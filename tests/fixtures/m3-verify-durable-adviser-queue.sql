-- Manual verification for an isolated Docker Postgres clone only.
-- Apply the durable adviser queue migration to this isolated clone first.
-- Seed users/sessions with m3-seed-adviser-users.sql.
begin;

do $$
declare f record;
begin
  if not (select relrowsecurity from pg_class where oid='private.adviser_queue_control'::regclass) then
    raise exception 'Queue control table must have RLS enabled';
  end if;
  if has_table_privilege('anon','private.adviser_queue_control','select,insert,update,delete') or
     has_table_privilege('authenticated','private.adviser_queue_control','select,insert,update,delete') or
     not has_table_privilege('service_role','private.adviser_queue_control','select,insert,update,delete') then
    raise exception 'Unexpected queue-control table grants';
  end if;
  for f in
    select p.oid::regprocedure as signature,p.prosecdef,p.proconfig,
      coalesce(p.proacl,acldefault('f',p.proowner)) as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname in (
        'enqueue_adviser_request','acquire_adviser_queue_worker','claim_adviser_request',
        'retry_adviser_request','release_adviser_queue_worker','pause_adviser_queue_dispatch',
        'dispatch_adviser_queue','enable_adviser_queue_dispatch','disable_adviser_queue_dispatch'
      )) or (n.nspname='public' and p.proname in (
        'enqueue_adviser_request','acquire_adviser_queue_worker','claim_adviser_request',
        'retry_adviser_request','release_adviser_queue_worker','pause_adviser_queue_dispatch'
      ))
  loop
    if has_function_privilege('anon',f.signature,'EXECUTE') or
       has_function_privilege('authenticated',f.signature,'EXECUTE') or
       exists(select 1 from aclexplode(f.acl) a where a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'Client or PUBLIC can execute %',f.signature;
    end if;
    if f.signature::text like 'private.%' then
      if not f.prosecdef or not ('search_path=""'=any(f.proconfig)) then
        raise exception 'Private function % must be SECURITY DEFINER with empty search_path',f.signature;
      end if;
    elsif f.prosecdef or not has_function_privilege('service_role',f.signature,'EXECUTE') then
      raise exception 'Public wrapper % must be SECURITY INVOKER and service-only',f.signature;
    end if;
  end loop;
  if has_function_privilege('service_role','private.dispatch_adviser_queue()','EXECUTE') or
     has_function_privilege('service_role','private.enable_adviser_queue_dispatch()','EXECUTE') or
     has_function_privilege('service_role','private.disable_adviser_queue_dispatch()','EXECUTE') then
    raise exception 'Scheduler operator functions must remain unavailable to service_role';
  end if;
  if not exists(select 1 from pg_index where indexrelid='public.adviser_requests_queue_due'::regclass and indisvalid and indpred is not null) or
     not exists(select 1 from pg_index where indexrelid='public.adviser_requests_queue_expired'::regclass and indisvalid and indpred is not null) then
    raise exception 'Expected valid partial indexes for due claims and expired-lease cleanup';
  end if;
end;
$$;

set local role service_role;
do $$
declare
  r jsonb; replay jsonb; changed jsonb; busy jsonb; lease uuid; worker uuid;
  conversation uuid; v_request_id uuid:='56000000-0000-4000-8000-000000000001';
  v_session_id uuid:='40000000-0000-4000-8000-000000000001';
  v_user_id uuid:='30000000-0000-4000-8000-000000000001';
  i integer; count_rows integer;
begin
  r:=public.enqueue_adviser_request(v_user_id,'40000000-0000-4000-8000-000000000002',v_request_id,null,repeat('a',64),'wrong session',5,1000);
  if r->>'status'<>'unauthorized' then raise exception 'Wrong session enqueued a request: %',r; end if;

  r:=public.enqueue_adviser_request(v_user_id,v_session_id,v_request_id,null,repeat('a',64),'First durable question',5,1000);
  if r->>'status'<>'queued' then raise exception 'Initial enqueue failed: %',r; end if;
  conversation:=(r->>'conversationId')::uuid;
  perform set_config('m3.queue_conversation_a',conversation::text,true);
  replay:=public.enqueue_adviser_request(v_user_id,v_session_id,v_request_id,null,repeat('a',64),'First durable question',5,1000);
  if replay->>'status'<>'queued' or (replay->>'conversationId')::uuid<>conversation then
    raise exception 'Same-body replay changed queue state: %',replay;
  end if;
  changed:=public.enqueue_adviser_request(v_user_id,v_session_id,v_request_id,null,repeat('b',64),'Changed body',5,1000);
  if changed->>'status'<>'conflict' then raise exception 'Changed-body replay did not conflict: %',changed; end if;
  busy:=public.enqueue_adviser_request(v_user_id,v_session_id,'56000000-0000-4000-8000-000000000002',conversation,repeat('c',64),'Second question',5,1000);
  if busy->>'status'<>'busy' then raise exception 'A second live request was not rejected as busy: %',busy; end if;
  if (select attempted_count from public.adviser_usage_periods where user_id=v_user_id
      and period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')<>1 then
    raise exception 'Idempotent replay or busy request changed the attempt count';
  end if;

  worker:=public.acquire_adviser_queue_worker();
  if worker is null or public.acquire_adviser_queue_worker() is not null then
    raise exception 'Worker lease was missing or acquired twice';
  end if;
  r:=public.claim_adviser_request(worker);
  if r->>'requestId'<>v_request_id::text or r->>'message'<>'First durable question' or r->>'attempt'<>'1' then
    raise exception 'Unexpected first claim: %',r;
  end if;
  lease:=(r->>'leaseId')::uuid;
  if public.claim_adviser_request(worker) is not null then raise exception 'Active lease was claimed twice'; end if;
  r:=public.retry_adviser_request(v_user_id,v_request_id,lease,'worker_failed');
  if r->>'status'<>'queued' or (r->>'availableAt')::timestamptz<=now() then
    raise exception 'First provider failure did not back off: %',r;
  end if;
  if (public.retry_adviser_request(v_user_id,v_request_id,lease,'worker_failed'))->>'status'<>'stale' then
    raise exception 'A retry with an already-used job lease was not stale';
  end if;
  update public.adviser_requests set available_at=now() where user_id=v_user_id and request_id=v_request_id;
  r:=public.claim_adviser_request(worker);
  if r->>'attempt'<>'2' then raise exception 'Second attempt was not claimable: %',r; end if;
  lease:=(r->>'leaseId')::uuid;
  r:=public.retry_adviser_request(v_user_id,v_request_id,lease,'worker_failed');
  if r->>'status'<>'queued' or (r->>'availableAt')::timestamptz<=now() then
    raise exception 'Second provider failure did not back off: %',r;
  end if;
  update public.adviser_requests set available_at=now() where user_id=v_user_id and request_id=v_request_id;
  r:=public.claim_adviser_request(worker);
  if r->>'attempt'<>'3' then raise exception 'Third attempt was not claimable: %',r; end if;
  update public.adviser_requests set reserved_until=now()-interval '1 second'
    where user_id=v_user_id and request_id=v_request_id;
  if public.claim_adviser_request(worker) is not null then raise exception 'An exhausted crashed job was dispatched again'; end if;
  if not exists(select 1 from public.adviser_requests where user_id=v_user_id and request_id=v_request_id
      and status='failed' and failure_code='retry_exhausted' and prompt is null) then
    raise exception 'Exhausted crash was not terminalized and cleared';
  end if;
  if not public.release_adviser_queue_worker(worker) or public.release_adviser_queue_worker(worker) then
    raise exception 'Worker lease release did not become stale after one use';
  end if;

  r:=public.enqueue_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000003',null,
    repeat('d',64),'Successful queued question',5,1000);
  if r->>'status'<>'queued' then raise exception 'Success-test enqueue failed: %',r; end if;
  conversation:=(r->>'conversationId')::uuid;
  perform set_config('m3.queue_conversation_b',conversation::text,true);
  worker:=public.acquire_adviser_queue_worker();
  r:=public.claim_adviser_request(worker);
  if r->>'requestId'<>'56000000-0000-4000-8000-000000000003' then raise exception 'Unexpected success claim: %',r; end if;
  lease:=(r->>'leaseId')::uuid;
  if not public.complete_adviser_request('30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000003',lease,
      'Successful queued question','{"text":"Persisted answer"}'::jsonb,'{}'::jsonb,4,8) then
    raise exception 'Valid worker completion failed';
  end if;
  if exists(select 1 from public.adviser_requests where request_id='56000000-0000-4000-8000-000000000003' and prompt is not null) or
     (select count(*) from public.adviser_messages where request_id='56000000-0000-4000-8000-000000000003')<>2 or
     (select successful_count from public.adviser_usage_periods where user_id='30000000-0000-4000-8000-000000000002'
       and period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')<>1 then
    raise exception 'Completion failed to clear prompt, save both messages, or consume success quota';
  end if;
  r:=public.enqueue_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000006',null,
    repeat('6',64),'Over quota question',1,1000);
  if r->>'status'<>'quota' then raise exception 'Successful request did not enforce per-user quota: %',r; end if;
  r:=public.enqueue_adviser_request('30000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000007',null,
    repeat('7',64),'At global capacity',5,2);
  if r->>'status'<>'capacity' then raise exception 'Global request capacity was not enforced: %',r; end if;
  replay:=public.enqueue_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000003',null,
    repeat('d',64),'Successful queued question',5,1000);
  if replay->>'status'<>'completed' or replay->'answer'<>'{"text":"Persisted answer"}'::jsonb then
    raise exception 'Completed idempotent replay did not return cached answer: %',replay;
  end if;
  if not public.release_adviser_queue_worker(worker) then raise exception 'Success-test worker lease did not release'; end if;

  begin
    perform public.retry_adviser_request(v_user_id,v_request_id,gen_random_uuid(),null);
    raise exception 'Null retry failure code was accepted';
  exception when sqlstate '22023' then null; end;
end;
$$;
reset role;

-- Session revocation and expired conversations must remove payloads before any claim.
set local role service_role;
do $$
declare r jsonb; worker uuid;
begin
  r:=public.enqueue_adviser_request('30000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000004',null,
    repeat('e',64),'Revoked session prompt',5,1000);
  if r->>'status'<>'queued' then raise exception 'Revocation cleanup enqueue failed: %',r; end if;
  perform set_config('m3.queue_conversation_c',r->>'conversationId',true);
end;
$$;
reset role;
set local role supabase_admin;
delete from auth.sessions where id='40000000-0000-4000-8000-000000000003';
reset role;
set local role service_role;
do $$
declare worker uuid; r jsonb;
begin
  worker:=public.acquire_adviser_queue_worker();
  r:=public.claim_adviser_request(worker);
  if r is not null then raise exception 'Revoked-session prompt was claimed'; end if;
  if not exists(select 1 from public.adviser_requests where request_id='56000000-0000-4000-8000-000000000004'
      and status='failed' and failure_code='session' and prompt is null) then
    raise exception 'Revoked session was not terminalized and payload-erased';
  end if;
  perform public.release_adviser_queue_worker(worker);
end;
$$;
reset role;
set local role supabase_admin;
insert into auth.sessions(id,user_id) values
  ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003') on conflict(id) do nothing;
reset role;
set local role service_role;
do $$
declare r jsonb;
begin
  r:=public.enqueue_adviser_request('30000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000005',null,
    repeat('f',64),'Expired conversation prompt',5,1000);
  if r->>'status'<>'queued' then raise exception 'Expiry cleanup enqueue failed: %',r; end if;
  update public.adviser_conversations set expires_at=now()-interval '1 second' where id=(r->>'conversationId')::uuid;
end;
$$;
do $$
declare worker uuid; r jsonb;
begin
  worker:=public.acquire_adviser_queue_worker();
  r:=public.claim_adviser_request(worker);
  if r is not null then raise exception 'Expired-conversation prompt was claimed'; end if;
  if not exists(select 1 from public.adviser_requests where request_id='56000000-0000-4000-8000-000000000005'
      and status='failed' and failure_code='conversation' and prompt is null) then
    raise exception 'Expired conversation was not terminalized and payload-erased';
  end if;
  perform public.release_adviser_queue_worker(worker);
end;
$$;
reset role;

-- Owner deletion clears queued content and preserves the idempotency tombstone.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","session_id":"40000000-0000-4000-8000-000000000003","is_anonymous":false}',true);
delete from public.adviser_conversations where id=current_setting('m3.queue_conversation_c')::uuid;
reset role;
set local role service_role;
do $$
begin
  if not exists(select 1 from public.adviser_requests where request_id='56000000-0000-4000-8000-000000000004'
      and status='deleted' and prompt is null and response is null and conversation_id is null) then
    raise exception 'Conversation deletion did not erase pending prompt and leave a tombstone';
  end if;
end;
$$;
reset role;

rollback;
select 'PASS: durable adviser queue security, replay, quota, lease, retry, cleanup, deletion, and completion invariants verified; writes rolled back' as result;
