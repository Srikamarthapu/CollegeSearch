-- Persist adviser work before returning to the browser. The request table already
-- owns idempotency, quota accounting, session binding, and 90-day conversation
-- retention; this migration adds bounded queued payloads and lease-based workers.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.adviser_requests
  add column prompt text check (prompt is null or (char_length(prompt) between 1 and 2000 and octet_length(prompt) <= 8000)),
  add column available_at timestamptz not null default now(),
  add column worker_started_at timestamptz,
  add column attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  add column failure_code text check (failure_code is null or failure_code in ('worker_failed','session','conversation','retry_exhausted'));

create index adviser_requests_queue_due on public.adviser_requests(available_at, created_at)
  where status = 'pending' and prompt is not null;
create index adviser_requests_queue_expired on public.adviser_requests(reserved_until)
  where status = 'pending' and prompt is not null;

create table private.adviser_queue_control (
  singleton boolean primary key default true check (singleton),
  worker_lease_id uuid,
  worker_lease_until timestamptz,
  dispatch_paused_until timestamptz,
  check ((worker_lease_id is null) = (worker_lease_until is null))
);
insert into private.adviser_queue_control(singleton) values (true) on conflict do nothing;
alter table private.adviser_queue_control enable row level security;
revoke all on private.adviser_queue_control from public, anon, authenticated;
grant all on private.adviser_queue_control to service_role;

-- A deleted conversation erases any queued prompt as well as the cached answer.
create or replace function private.erase_adviser_request_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users where id = old.user_id) then
    update public.adviser_requests set response = null, prompt = null, status = 'deleted', conversation_id = null,
      worker_started_at = null, reserved_until = now()
    where conversation_id = old.id and user_id = old.user_id;
  end if;
  return old;
end;
$$;

-- Keep the legacy reservation wrapper safe during a rolling deploy: queued jobs
-- count as in-flight even though they do not hold an active worker lease.
create or replace function private.reserve_adviser_request(p_user_id uuid, p_session_id uuid, p_request_id uuid,
  p_conversation_id uuid, p_body_hash text, p_free_limit integer, p_global_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_period timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_request public.adviser_requests%rowtype;
  v_usage public.adviser_usage_periods%rowtype;
  v_conversation uuid;
  v_pending integer;
  v_global integer;
begin
  if p_free_limit is null or p_global_limit is null or p_body_hash is null or p_free_limit not between 1 and 1000 or p_global_limit not between 1 and 100000
    or p_body_hash !~ '^[a-f0-9]{64}$' or p_request_id is null then
    raise exception 'Invalid adviser configuration or request' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.sessions where id = p_session_id and user_id = p_user_id) then
    return jsonb_build_object('status','unauthorized');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('collegesearch-adviser-' || v_period::text, 0));
  select * into v_request from public.adviser_requests where user_id = p_user_id and request_id = p_request_id for update;
  if found then
    if v_request.body_hash <> p_body_hash then return jsonb_build_object('status','conflict'); end if;
    if v_request.status = 'deleted' then return jsonb_build_object('status','deleted'); end if;
    if v_request.status = 'completed' then
      if not exists (select 1 from public.adviser_conversations where id = v_request.conversation_id and expires_at > now()) then return jsonb_build_object('status','deleted'); end if;
      return jsonb_build_object('status','completed','conversationId',v_request.conversation_id,'answer',v_request.response);
    end if;
    if v_request.status = 'pending' and (v_request.prompt is not null or v_request.reserved_until > now()) then
      return jsonb_build_object('status','pending','conversationId',v_request.conversation_id);
    end if;
    if v_request.period_start <> v_period then return jsonb_build_object('status','expired'); end if;
    v_conversation := v_request.conversation_id;
  else
    v_conversation := p_conversation_id;
  end if;
  if v_conversation is not null and not exists (
    select 1 from public.adviser_conversations where id = v_conversation and user_id = p_user_id and expires_at > now()
  ) then return jsonb_build_object('status','deleted'); end if;
  insert into public.adviser_usage_periods(user_id, period_start) values (p_user_id,v_period) on conflict do nothing;
  insert into private.adviser_global_usage(period_start) values (v_period) on conflict do nothing;
  select * into v_usage from public.adviser_usage_periods where user_id = p_user_id and period_start = v_period;
  select count(*) into v_pending from public.adviser_requests where user_id = p_user_id and status = 'pending'
    and (prompt is not null or reserved_until > now());
  if v_pending > 0 then return jsonb_build_object('status','busy'); end if;
  if v_usage.successful_count >= p_free_limit then return jsonb_build_object('status','quota'); end if;
  if v_usage.attempted_count >= p_free_limit * 3 then return jsonb_build_object('status','retry-limit'); end if;
  select attempted_count into v_global from private.adviser_global_usage where period_start = v_period;
  if v_global >= p_global_limit then return jsonb_build_object('status','capacity'); end if;
  if v_conversation is null then
    insert into public.adviser_conversations(user_id) values (p_user_id) returning id into v_conversation;
  end if;
  insert into public.adviser_requests(user_id,request_id,session_id,conversation_id,body_hash,status,period_start,reserved_until)
    values (p_user_id,p_request_id,p_session_id,v_conversation,p_body_hash,'pending',v_period,now()+interval '4 minutes')
    on conflict (user_id,request_id) do update set status='pending', session_id=excluded.session_id, lease_id=excluded.lease_id, reserved_until=excluded.reserved_until
    returning * into v_request;
  update public.adviser_usage_periods set attempted_count=attempted_count+1 where user_id=p_user_id and period_start=v_period;
  update private.adviser_global_usage set attempted_count=attempted_count+1 where period_start=v_period;
  return jsonb_build_object('status','reserved','conversationId',v_conversation,'leaseId',v_request.lease_id);
end;
$$;

-- Queue insert, per-user capacity reservation, and idempotency all commit as one
-- transaction. Replays of an already queued request preserve its backoff/lease.
create function private.enqueue_adviser_request(p_user_id uuid, p_session_id uuid, p_request_id uuid,
  p_conversation_id uuid, p_body_hash text, p_message text, p_free_limit integer, p_global_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_period timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_request public.adviser_requests%rowtype;
  v_usage public.adviser_usage_periods%rowtype;
  v_conversation uuid;
  v_pending integer;
  v_global integer;
  v_retry_legacy boolean := false;
begin
  if p_user_id is null or p_session_id is null or p_request_id is null or p_message is null
    or char_length(p_message) not between 1 and 2000 or octet_length(p_message) > 8000
    or p_free_limit is null or p_global_limit is null or p_free_limit not between 1 and 1000
    or p_global_limit not between 1 and 100000 or p_body_hash is null or p_body_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid adviser configuration or request' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.sessions where id = p_session_id and user_id = p_user_id) then
    return jsonb_build_object('status','unauthorized');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('collegesearch-adviser-' || v_period::text, 0));

  select * into v_request from public.adviser_requests where user_id = p_user_id and request_id = p_request_id for update;
  if found then
    if v_request.body_hash <> p_body_hash then return jsonb_build_object('status','conflict'); end if;
    if v_request.status = 'deleted' then return jsonb_build_object('status','deleted'); end if;
    if v_request.status = 'completed' then
      if not exists (select 1 from public.adviser_conversations where id = v_request.conversation_id and expires_at > now()) then return jsonb_build_object('status','deleted'); end if;
      return jsonb_build_object('status','completed','conversationId',v_request.conversation_id,'answer',v_request.response);
    end if;
    if v_request.status = 'pending' then
      if v_request.prompt is not null then return jsonb_build_object('status','queued','conversationId',v_request.conversation_id); end if;
      if v_request.reserved_until > now() then return jsonb_build_object('status','pending','conversationId',v_request.conversation_id); end if;
    end if;
    if v_request.period_start <> v_period then return jsonb_build_object('status','expired'); end if;
    if v_request.status = 'failed' then
      if v_request.failure_code is not null then return jsonb_build_object('status','failed','conversationId',v_request.conversation_id); end if;
      v_retry_legacy := true;
    end if;
    v_conversation := v_request.conversation_id;
    select count(*) into v_pending from public.adviser_requests
      where user_id=p_user_id and status='pending' and request_id<>p_request_id
        and (prompt is not null or reserved_until>now());
    if v_pending > 0 then return jsonb_build_object('status','busy'); end if;
    if v_conversation is not null and not exists (
      select 1 from public.adviser_conversations where id = v_conversation and user_id = p_user_id and expires_at > now()
    ) then return jsonb_build_object('status','deleted'); end if;
    if v_retry_legacy then
      insert into public.adviser_usage_periods(user_id, period_start) values (p_user_id,v_period) on conflict do nothing;
      insert into private.adviser_global_usage(period_start) values (v_period) on conflict do nothing;
      select * into v_usage from public.adviser_usage_periods where user_id=p_user_id and period_start=v_period for update;
      select attempted_count into v_global from private.adviser_global_usage where period_start=v_period for update;
      if v_usage.successful_count >= p_free_limit then return jsonb_build_object('status','quota'); end if;
      if v_usage.attempted_count >= p_free_limit * 3 then return jsonb_build_object('status','retry-limit'); end if;
      if v_global >= p_global_limit then return jsonb_build_object('status','capacity'); end if;
      update public.adviser_usage_periods set attempted_count=attempted_count+1 where user_id=p_user_id and period_start=v_period;
      update private.adviser_global_usage set attempted_count=attempted_count+1 where period_start=v_period;
    end if;
    update public.adviser_requests set status='pending', session_id=p_session_id, lease_id=gen_random_uuid(),
      prompt=p_message, response=null, available_at=now(), worker_started_at=null,
      reserved_until=now(), failure_code=null, attempt_count=case when v_retry_legacy then 0 else attempt_count end
      where user_id=p_user_id and request_id=p_request_id;
    return jsonb_build_object('status','queued','conversationId',v_conversation);
  end if;

  v_conversation := p_conversation_id;
  if v_conversation is not null and not exists (
    select 1 from public.adviser_conversations where id = v_conversation and user_id = p_user_id and expires_at > now()
  ) then return jsonb_build_object('status','deleted'); end if;
  insert into public.adviser_usage_periods(user_id, period_start) values (p_user_id,v_period) on conflict do nothing;
  insert into private.adviser_global_usage(period_start) values (v_period) on conflict do nothing;
  select * into v_usage from public.adviser_usage_periods where user_id = p_user_id and period_start = v_period for update;
  select count(*) into v_pending from public.adviser_requests where user_id = p_user_id and status = 'pending'
    and (prompt is not null or reserved_until > now());
  if v_pending > 0 then return jsonb_build_object('status','busy'); end if;
  if v_usage.successful_count >= p_free_limit then return jsonb_build_object('status','quota'); end if;
  if v_usage.attempted_count >= p_free_limit * 3 then return jsonb_build_object('status','retry-limit'); end if;
  select attempted_count into v_global from private.adviser_global_usage where period_start = v_period for update;
  if v_global >= p_global_limit then return jsonb_build_object('status','capacity'); end if;
  if v_conversation is null then
    insert into public.adviser_conversations(user_id) values (p_user_id) returning id into v_conversation;
  end if;
  insert into public.adviser_requests(user_id,request_id,session_id,conversation_id,body_hash,status,period_start,
      reserved_until,prompt,available_at)
    values (p_user_id,p_request_id,p_session_id,v_conversation,p_body_hash,'pending',v_period,now(),p_message,now());
  update public.adviser_usage_periods set attempted_count=attempted_count+1 where user_id=p_user_id and period_start=v_period;
  update private.adviser_global_usage set attempted_count=attempted_count+1 where period_start=v_period;
  return jsonb_build_object('status','queued','conversationId',v_conversation);
end;
$$;

create or replace function private.complete_adviser_request(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_lease_id uuid,
  p_message text,p_answer jsonb,p_preferences jsonb,p_input_tokens integer,p_output_tokens integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_request public.adviser_requests%rowtype; v_period timestamptz; v_conversation uuid;
begin
  select period_start,conversation_id into v_period,v_conversation from public.adviser_requests where user_id=p_user_id and request_id=p_request_id;
  if v_period is null then return false; end if;
  perform 1 from public.adviser_conversations where id=v_conversation and user_id=p_user_id for update;
  select * into v_request from public.adviser_requests where user_id=p_user_id and request_id=p_request_id for update;
  if p_lease_id is null or v_request.lease_id <> p_lease_id or v_request.status <> 'pending' or v_request.reserved_until <= now() or v_request.session_id <> p_session_id
    or (v_request.prompt is not null and v_request.prompt <> p_message)
    or not exists (select 1 from auth.sessions where id=p_session_id and user_id=p_user_id)
    or not exists (select 1 from public.adviser_conversations where id=v_request.conversation_id and user_id=p_user_id and expires_at>now()) then return false; end if;
  if char_length(p_message) not between 1 and 2000 or jsonb_typeof(p_answer) <> 'object' or jsonb_typeof(p_preferences) <> 'object'
    or p_input_tokens is null or p_input_tokens not between 0 and 1000000 or p_output_tokens is null or p_output_tokens not between 0 and 1000000 then
    raise exception 'Invalid adviser content' using errcode='22023';
  end if;
  insert into public.adviser_messages(user_id,conversation_id,request_id,role,payload) values
    (p_user_id,v_request.conversation_id,p_request_id,'user',jsonb_build_object('text',p_message)),
    (p_user_id,v_request.conversation_id,p_request_id,'assistant',p_answer);
  update public.adviser_requests set status='completed',response=p_answer,prompt=null,worker_started_at=null,
    reserved_until=now(),failure_code=null,input_tokens=p_input_tokens,output_tokens=p_output_tokens
    where user_id=p_user_id and request_id=p_request_id;
  -- This row update serializes against the enqueue path's per-user quota lock;
  -- completion does not change global attempted quota, so it needs no period-wide lock.
  update public.adviser_usage_periods set successful_count=successful_count+1 where user_id=p_user_id and period_start=v_request.period_start;
  update public.adviser_conversations set title=case when title='College research' then left(regexp_replace(p_message, '[[:cntrl:]]+', ' ', 'g'),80) else title end,
    preferences=p_preferences,updated_at=now(),expires_at=now()+interval '90 days'
    where id=v_request.conversation_id and user_id=p_user_id;
  return true;
end;
$$;

create function private.acquire_adviser_queue_worker() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_lease uuid;
begin
  update private.adviser_queue_control set worker_lease_id=gen_random_uuid(),
    worker_lease_until=now()+interval '240 seconds', dispatch_paused_until=null
    where singleton and (worker_lease_until is null or worker_lease_until <= now())
    returning worker_lease_id into v_lease;
  return v_lease;
end;
$$;

create function private.claim_adviser_request(p_worker_lease_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_job record; v_request public.adviser_requests%rowtype; v_previous jsonb; v_lease uuid;
begin
  if p_worker_lease_id is null or not exists (select 1 from private.adviser_queue_control
    where singleton and worker_lease_id=p_worker_lease_id and worker_lease_until>now()) then return null; end if;

  update public.adviser_requests r set status='failed', failure_code=case
      when not exists (select 1 from auth.sessions s where s.id=r.session_id and s.user_id=r.user_id) then 'session'
      else 'conversation' end,
    prompt=null,
    worker_started_at=null,reserved_until=now()
    where (r.user_id,r.request_id) in (
      select q.user_id,q.request_id from public.adviser_requests q
      where q.status='pending' and q.prompt is not null and q.reserved_until<=now()
        and (not exists (select 1 from auth.sessions s where s.id=q.session_id and s.user_id=q.user_id)
          or not exists (select 1 from public.adviser_conversations c where c.id=q.conversation_id and c.user_id=q.user_id and c.expires_at>now()))
      order by q.reserved_until,q.created_at for update skip locked limit 100
    );
  update public.adviser_requests set status='failed',prompt=null,worker_started_at=null,reserved_until=now(),failure_code='retry_exhausted'
    where (user_id,request_id) in (
      select q.user_id,q.request_id from public.adviser_requests q
      where q.status='pending' and q.prompt is not null and q.attempt_count>=3 and q.reserved_until<=now()
      order by q.reserved_until,q.created_at for update skip locked limit 100
    );

  select r.user_id,r.session_id,r.request_id,r.conversation_id,r.prompt,r.attempt_count,c.preferences,
    coalesce((select m.payload->'recommendations' from public.adviser_messages m
      where m.user_id=r.user_id and m.conversation_id=r.conversation_id and m.role='assistant'
      order by m.created_at desc limit 1),'[]'::jsonb) as recommendations
    into v_job
    from public.adviser_requests r
    join public.adviser_conversations c on c.id=r.conversation_id and c.user_id=r.user_id and c.expires_at>now()
    where r.status='pending' and r.prompt is not null and r.available_at<=now() and r.reserved_until<=now()
      and r.attempt_count<3 and exists(select 1 from auth.sessions s where s.id=r.session_id and s.user_id=r.user_id)
    order by r.available_at,r.created_at
    for update of r skip locked limit 1;
  if not found then return null; end if;
  v_lease := gen_random_uuid();
  update public.adviser_requests set lease_id=v_lease,reserved_until=now()+interval '240 seconds',
    worker_started_at=now(),attempt_count=attempt_count+1,failure_code=null
    where user_id=v_job.user_id and request_id=v_job.request_id returning * into v_request;
  v_previous := case when jsonb_typeof(v_job.recommendations)='array' then v_job.recommendations else '[]'::jsonb end;
  return jsonb_build_object('userId',v_request.user_id,'sessionId',v_request.session_id,
    'requestId',v_request.request_id,'conversationId',v_request.conversation_id,'leaseId',v_request.lease_id,
    'message',v_request.prompt,'attempt',v_request.attempt_count,'preferences',v_job.preferences,
    'previousRecommendations',v_previous);
end;
$$;

create function private.retry_adviser_request(p_user_id uuid,p_request_id uuid,p_lease_id uuid,p_failure_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.adviser_requests%rowtype; v_code text; v_status text; v_next timestamptz;
begin
  if p_failure_code is null or p_failure_code not in ('worker_failed','session','conversation') then
    raise exception 'Invalid adviser failure code' using errcode='22023';
  end if;
  select * into v_request from public.adviser_requests
    where user_id=p_user_id and request_id=p_request_id for update;
  if not found or p_lease_id is null or v_request.lease_id<>p_lease_id or v_request.status<>'pending'
    or v_request.reserved_until<=now() then return jsonb_build_object('status','stale'); end if;
  v_code := case
    when not exists(select 1 from auth.sessions where id=v_request.session_id and user_id=v_request.user_id) then 'session'
    when not exists(select 1 from public.adviser_conversations where id=v_request.conversation_id and user_id=v_request.user_id and expires_at>now()) then 'conversation'
    else p_failure_code end;
  if v_code in ('session','conversation') then
    update public.adviser_requests set status='failed',failure_code=v_code,worker_started_at=null,
      reserved_until=now(),prompt=null
      where user_id=p_user_id and request_id=p_request_id;
    return jsonb_build_object('status','failed','failureCode',v_code);
  end if;
  if v_request.attempt_count >= 3 then
    update public.adviser_requests set status='failed',failure_code='retry_exhausted',worker_started_at=null,
      reserved_until=now(),prompt=null where user_id=p_user_id and request_id=p_request_id;
    return jsonb_build_object('status','failed','failureCode','retry_exhausted');
  end if;
  v_next := now() + case v_request.attempt_count when 1 then interval '15 seconds' else interval '60 seconds' end;
  update public.adviser_requests set available_at=v_next,reserved_until=now(),worker_started_at=null,
    failure_code=p_failure_code where user_id=p_user_id and request_id=p_request_id;
  return jsonb_build_object('status','queued','availableAt',v_next);
end;
$$;

create function private.release_adviser_queue_worker(p_worker_lease_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update private.adviser_queue_control set worker_lease_id=null,worker_lease_until=null
    where singleton and worker_lease_id=p_worker_lease_id;
  return found;
end;
$$;

create function private.pause_adviser_queue_dispatch(p_seconds integer default 300) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_seconds is null or p_seconds not between 60 and 3600 then
    raise exception 'Invalid adviser dispatch pause' using errcode='22023';
  end if;
  update private.adviser_queue_control set dispatch_paused_until=greatest(coalesce(dispatch_paused_until,now()),now()+make_interval(secs=>p_seconds))
    where singleton;
end;
$$;

-- The dispatcher sends only a wake-up signal. Claims remain atomic in Postgres;
-- Vault is the only source of the deployment URL and ADVISER_WORKER_SECRET. Scheduling is
-- deliberately a separate operator action after both secrets and the route exist.
create function private.dispatch_adviser_queue() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='college_search_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='college_search_worker_secret';
  if v_url is null or char_length(v_url)>500 or v_url !~ '^https://[^/?#[:space:]]+/api/internal/adviser-worker$'
    or v_secret is null or char_length(v_secret)<32 then return; end if;
  if exists(select 1 from private.adviser_queue_control where singleton
    and (dispatch_paused_until>now() or worker_lease_until>now())) then return; end if;
  if not exists(select 1 from public.adviser_requests where status='pending' and prompt is not null
    and reserved_until<=now() and (attempt_count>=3 or available_at<=now())) then return; end if;
  perform net.http_post(url:=v_url,body:='{}'::jsonb,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
    timeout_milliseconds:=170000);
end;
$$;

create function private.enable_adviser_queue_dispatch() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_job_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='college_search_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='college_search_worker_secret';
  if v_url is null or char_length(v_url)>500 or v_url !~ '^https://[^/?#[:space:]]+/api/internal/adviser-worker$'
    or v_secret is null or char_length(v_secret)<32 then
    raise exception 'Set both adviser queue Vault secrets before enabling the scheduler' using errcode='22023';
  end if;
  select jobid into v_job_id from cron.job where jobname='college-search-adviser-queue-dispatch';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  return cron.schedule('college-search-adviser-queue-dispatch','* * * * *','select private.dispatch_adviser_queue();');
end;
$$;

create function private.disable_adviser_queue_dispatch() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='college-search-adviser-queue-dispatch';
  if v_job_id is null then return false; end if;
  return cron.unschedule(v_job_id);
end;
$$;

-- Only service_role can enqueue, claim, retry, or release work. Scheduler controls
-- remain operator-only; no credential or prompt is returned to browser roles.
create function public.enqueue_adviser_request(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_conversation_id uuid,
  p_body_hash text,p_message text,p_free_limit integer,p_global_limit integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.enqueue_adviser_request(p_user_id,p_session_id,p_request_id,p_conversation_id,p_body_hash,p_message,p_free_limit,p_global_limit);
$$;
create function public.acquire_adviser_queue_worker() returns uuid
language sql security invoker set search_path = '' as $$ select private.acquire_adviser_queue_worker(); $$;
create function public.claim_adviser_request(p_worker_lease_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.claim_adviser_request(p_worker_lease_id); $$;
create function public.retry_adviser_request(p_user_id uuid,p_request_id uuid,p_lease_id uuid,p_failure_code text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.retry_adviser_request(p_user_id,p_request_id,p_lease_id,p_failure_code);
$$;
create function public.release_adviser_queue_worker(p_worker_lease_id uuid) returns boolean
language sql security invoker set search_path = '' as $$ select private.release_adviser_queue_worker(p_worker_lease_id); $$;
create function public.pause_adviser_queue_dispatch(p_seconds integer default 300) returns void
language sql security invoker set search_path = '' as $$ select private.pause_adviser_queue_dispatch(p_seconds); $$;

revoke all on function private.enqueue_adviser_request(uuid,uuid,uuid,uuid,text,text,integer,integer),
  private.acquire_adviser_queue_worker(),private.claim_adviser_request(uuid),
  private.retry_adviser_request(uuid,uuid,uuid,text),private.release_adviser_queue_worker(uuid),
  private.pause_adviser_queue_dispatch(integer),private.dispatch_adviser_queue(),
  private.enable_adviser_queue_dispatch(),private.disable_adviser_queue_dispatch() from public,anon,authenticated,service_role;
grant execute on function private.enqueue_adviser_request(uuid,uuid,uuid,uuid,text,text,integer,integer),
  private.acquire_adviser_queue_worker(),private.claim_adviser_request(uuid),
  private.retry_adviser_request(uuid,uuid,uuid,text),private.release_adviser_queue_worker(uuid),
  private.pause_adviser_queue_dispatch(integer) to service_role;

revoke all on function public.enqueue_adviser_request(uuid,uuid,uuid,uuid,text,text,integer,integer),
  public.acquire_adviser_queue_worker(),public.claim_adviser_request(uuid),
  public.retry_adviser_request(uuid,uuid,uuid,text),public.release_adviser_queue_worker(uuid),
  public.pause_adviser_queue_dispatch(integer) from public,anon,authenticated;
grant execute on function public.enqueue_adviser_request(uuid,uuid,uuid,uuid,text,text,integer,integer),
  public.acquire_adviser_queue_worker(),public.claim_adviser_request(uuid),
  public.retry_adviser_request(uuid,uuid,uuid,text),public.release_adviser_queue_worker(uuid),
  public.pause_adviser_queue_dispatch(integer) to service_role;

revoke all on function private.dispatch_adviser_queue(),private.enable_adviser_queue_dispatch(),
  private.disable_adviser_queue_dispatch() from public,anon,authenticated,service_role;
