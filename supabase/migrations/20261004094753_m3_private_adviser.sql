-- Personal content is separate from the public knowledge base. No billing tables.
create table public.adviser_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'College research' check (char_length(title) between 1 and 100),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 16000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  unique (id, user_id)
);
create index adviser_conversations_owner_updated on public.adviser_conversations(user_id, updated_at desc);
create index adviser_conversations_expiry on public.adviser_conversations(expires_at);

create table public.adviser_usage_periods (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  successful_count integer not null default 0 check (successful_count >= 0),
  attempted_count integer not null default 0 check (attempted_count >= successful_count),
  primary key (user_id, period_start)
);
create table private.adviser_global_usage (
  period_start timestamptz primary key,
  attempted_count integer not null default 0 check (attempted_count >= 0)
);
alter table private.adviser_global_usage enable row level security;
revoke all on private.adviser_global_usage from public, anon, authenticated;

create table public.adviser_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  session_id uuid not null,
  lease_id uuid not null default gen_random_uuid(),
  conversation_id uuid,
  body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('pending','completed','failed','deleted')),
  period_start timestamptz not null,
  reserved_until timestamptz not null,
  response jsonb check (response is null or (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 100000)),
  input_tokens integer not null default 0 check (input_tokens between 0 and 1000000),
  output_tokens integer not null default 0 check (output_tokens between 0 and 1000000),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id),
  foreign key (conversation_id, user_id) references public.adviser_conversations(id, user_id)
);
create index adviser_requests_pending on public.adviser_requests(user_id, reserved_until) where status = 'pending';
create index adviser_requests_conversation on public.adviser_requests(conversation_id);

create table public.adviser_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  request_id uuid not null,
  role text not null check (role in ('user','assistant')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.adviser_conversations(id, user_id) on delete cascade,
  foreign key (user_id, request_id) references public.adviser_requests(user_id, request_id) on delete cascade,
  unique (user_id, request_id, role)
);
create index adviser_messages_conversation on public.adviser_messages(conversation_id, created_at, role desc);

alter table public.adviser_conversations enable row level security;
alter table public.adviser_messages enable row level security;
alter table public.adviser_requests enable row level security;
alter table public.adviser_usage_periods enable row level security;
revoke all on public.adviser_conversations, public.adviser_messages, public.adviser_requests, public.adviser_usage_periods from public, anon, authenticated;
grant select, delete on public.adviser_conversations to authenticated;
grant select on public.adviser_messages, public.adviser_usage_periods to authenticated;
grant all on public.adviser_conversations, public.adviser_messages, public.adviser_requests, public.adviser_usage_periods to service_role;

create policy adviser_conversations_read_own on public.adviser_conversations for select to authenticated
  using (user_id = (select auth.uid()) and (select private.account_session_active()) and expires_at > now());
create policy adviser_conversations_delete_own on public.adviser_conversations for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.account_session_active()));
create policy adviser_messages_read_own on public.adviser_messages for select to authenticated
  using (user_id = (select auth.uid()) and (select private.account_session_active()) and exists (
    select 1 from public.adviser_conversations c where c.id = conversation_id and c.user_id = auth.uid() and c.expires_at > now()
  ));
create policy adviser_usage_read_own on public.adviser_usage_periods for select to authenticated
  using (user_id = (select auth.uid()) and (select private.account_session_active()));

-- Deletion erases cached answers too. Keep only an opaque idempotency tombstone
-- so a delayed retry cannot restore a conversation that the student deleted.
create function private.erase_adviser_request_content() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- During Auth-user deletion, both conversations and requests are already
  -- cascading. Updating a request after its parent user is gone violates its FK.
  if exists (select 1 from auth.users where id = old.user_id) then
    update public.adviser_requests set response = null, status = 'deleted', conversation_id = null
      where conversation_id = old.id and user_id = old.user_id;
  end if;
  return old;
end;
$$;
revoke all on function private.erase_adviser_request_content() from public, anon, authenticated;
create trigger adviser_erase_request_content before delete on public.adviser_conversations
  for each row execute function private.erase_adviser_request_content();

-- These narrow private helpers need Auth session access. Only the server role
-- may call them; the server obtains user/session IDs from verified Auth, never
-- from a posted user_id. They recheck the session again during commit.
grant usage on schema private to service_role;
create function private.reserve_adviser_request(p_user_id uuid, p_session_id uuid, p_request_id uuid,
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
    if v_request.status = 'pending' and v_request.reserved_until > now() then return jsonb_build_object('status','pending'); end if;
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
  select count(*) into v_pending from public.adviser_requests where user_id = p_user_id and status = 'pending' and reserved_until > now();
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

create function private.complete_adviser_request(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_lease_id uuid,
  p_message text,p_answer jsonb,p_preferences jsonb,p_input_tokens integer,p_output_tokens integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_request public.adviser_requests%rowtype; v_period timestamptz; v_conversation uuid;
begin
  select period_start,conversation_id into v_period,v_conversation from public.adviser_requests where user_id=p_user_id and request_id=p_request_id;
  if v_period is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('collegesearch-adviser-' || v_period::text,0));
  perform 1 from public.adviser_conversations where id=v_conversation and user_id=p_user_id for update;
  select * into v_request from public.adviser_requests where user_id=p_user_id and request_id=p_request_id for update;
  if p_lease_id is null or v_request.lease_id <> p_lease_id or v_request.status <> 'pending' or v_request.reserved_until <= now() or v_request.session_id <> p_session_id
    or not exists (select 1 from auth.sessions where id=p_session_id and user_id=p_user_id)
    or not exists (select 1 from public.adviser_conversations where id=v_request.conversation_id and user_id=p_user_id and expires_at>now()) then return false; end if;
  if char_length(p_message) not between 1 and 2000 or jsonb_typeof(p_answer) <> 'object' or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Invalid adviser content' using errcode='22023';
  end if;
  insert into public.adviser_messages(user_id,conversation_id,request_id,role,payload) values
    (p_user_id,v_request.conversation_id,p_request_id,'user',jsonb_build_object('text',p_message)),
    (p_user_id,v_request.conversation_id,p_request_id,'assistant',p_answer);
  update public.adviser_requests set status='completed',response=p_answer,input_tokens=p_input_tokens,output_tokens=p_output_tokens
    where user_id=p_user_id and request_id=p_request_id;
  update public.adviser_usage_periods set successful_count=successful_count+1 where user_id=p_user_id and period_start=v_request.period_start;
  update public.adviser_conversations set title=case when title='College research' then left(regexp_replace(p_message, '[[:cntrl:]]+', ' ', 'g'),80) else title end,
    preferences=p_preferences,updated_at=now(),expires_at=now()+interval '90 days'
    where id=v_request.conversation_id and user_id=p_user_id;
  return true;
end;
$$;

create function private.release_adviser_request(p_user_id uuid,p_request_id uuid,p_lease_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.adviser_requests set status='failed' where user_id=p_user_id and request_id=p_request_id and lease_id=p_lease_id and status='pending';
$$;

create function private.purge_expired_adviser_history() returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.adviser_conversations where expires_at <= now();
  get diagnostics v_count = row_count;
  delete from public.adviser_requests where conversation_id is null and created_at < now()-interval '90 days';
  return v_count;
end;
$$;

revoke all on function private.reserve_adviser_request(uuid,uuid,uuid,uuid,text,integer,integer),
  private.complete_adviser_request(uuid,uuid,uuid,uuid,text,jsonb,jsonb,integer,integer),
  private.release_adviser_request(uuid,uuid,uuid),private.purge_expired_adviser_history() from public,anon,authenticated;
grant execute on function private.reserve_adviser_request(uuid,uuid,uuid,uuid,text,integer,integer),
  private.complete_adviser_request(uuid,uuid,uuid,uuid,text,jsonb,jsonb,integer,integer),
  private.release_adviser_request(uuid,uuid,uuid),private.purge_expired_adviser_history() to service_role;

create function public.reserve_adviser_request(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_conversation_id uuid,p_body_hash text,p_free_limit integer,p_global_limit integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.reserve_adviser_request(p_user_id,p_session_id,p_request_id,p_conversation_id,p_body_hash,p_free_limit,p_global_limit); $$;
create function public.complete_adviser_request(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_lease_id uuid,p_message text,p_answer jsonb,p_preferences jsonb,p_input_tokens integer,p_output_tokens integer)
returns boolean language sql security invoker set search_path='' as $$ select private.complete_adviser_request(p_user_id,p_session_id,p_request_id,p_lease_id,p_message,p_answer,p_preferences,p_input_tokens,p_output_tokens); $$;
create function public.release_adviser_request(p_user_id uuid,p_request_id uuid,p_lease_id uuid)
returns void language sql security invoker set search_path='' as $$ select private.release_adviser_request(p_user_id,p_request_id,p_lease_id); $$;
create function public.purge_expired_adviser_history()
returns integer language sql security invoker set search_path='' as $$ select private.purge_expired_adviser_history(); $$;
revoke all on function public.reserve_adviser_request(uuid,uuid,uuid,uuid,text,integer,integer),
  public.complete_adviser_request(uuid,uuid,uuid,uuid,text,jsonb,jsonb,integer,integer),
  public.release_adviser_request(uuid,uuid,uuid),public.purge_expired_adviser_history() from public,anon,authenticated;
grant execute on function public.reserve_adviser_request(uuid,uuid,uuid,uuid,text,integer,integer),
  public.complete_adviser_request(uuid,uuid,uuid,uuid,text,jsonb,jsonb,integer,integer),
  public.release_adviser_request(uuid,uuid,uuid),public.purge_expired_adviser_history() to service_role;
