-- Manual verification for an isolated Docker Postgres clone only.
-- Seed three users/sessions first with m3-seed-adviser-users.sql.
begin;

do $$
declare function_row record; table_name text;
begin
  for function_row in
    select p.oid::regprocedure as signature, p.prosecdef,
      coalesce(p.proacl, acldefault('f', p.proowner)) as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'reserve_adviser_request','complete_adviser_request',
      'release_adviser_request','purge_expired_adviser_history'
    )
  loop
    if function_row.prosecdef then raise exception '% must be SECURITY INVOKER',function_row.signature; end if;
    if has_function_privilege('anon',function_row.signature,'EXECUTE') or
       has_function_privilege('authenticated',function_row.signature,'EXECUTE') or
       not has_function_privilege('service_role',function_row.signature,'EXECUTE') then
      raise exception 'Unexpected wrapper EXECUTE grants for %',function_row.signature;
    end if;
    if exists(select 1 from aclexplode(function_row.acl) a where a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'PUBLIC can execute %',function_row.signature;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'reserve_adviser_request','complete_adviser_request',
        'release_adviser_request','purge_expired_adviser_history'
      )) <> 4 then raise exception 'Expected four public wrappers'; end if;
  if has_table_privilege('anon','public.adviser_conversations','select') or
     has_table_privilege('anon','public.adviser_messages','select') or
     has_table_privilege('anon','public.adviser_usage_periods','select') then
    raise exception 'Anon can read private adviser data';
  end if;
  if has_table_privilege('authenticated','public.adviser_requests','select') or
     has_table_privilege('authenticated','public.adviser_requests','insert') or
     has_table_privilege('authenticated','public.adviser_requests','update,delete') or
     has_table_privilege('authenticated','public.adviser_usage_periods','insert') or
     has_table_privilege('authenticated','public.adviser_usage_periods','update') or
     has_table_privilege('authenticated','public.adviser_usage_periods','delete') or
     has_table_privilege('authenticated','public.adviser_conversations','insert') or
     has_table_privilege('authenticated','public.adviser_conversations','update') or
     has_table_privilege('authenticated','public.adviser_messages','insert,update,delete') then
    raise exception 'Authenticated role has private writes or request reads';
  end if;
  if has_schema_privilege('anon','private','usage') or
     has_table_privilege('anon','private.adviser_global_usage','select,insert,update,delete') or
     has_table_privilege('authenticated','private.adviser_global_usage','select,insert,update,delete') then
    raise exception 'Client role can inspect or change global quota state';
  end if;
  if not (select relrowsecurity from pg_class where oid='private.adviser_global_usage'::regclass) then
    raise exception 'RLS is not enabled on the private global quota table';
  end if;
  if not has_table_privilege('service_role','public.adviser_conversations','select,insert,update,delete') or
     not has_table_privilege('service_role','public.adviser_messages','select,insert,update,delete') or
     not has_table_privilege('service_role','public.adviser_requests','select,insert,update,delete') or
     not has_table_privilege('service_role','public.adviser_usage_periods','select,insert,update,delete') then
    raise exception 'Service role lacks required adviser-table grants';
  end if;
  foreach table_name in array array['adviser_conversations','adviser_messages','adviser_requests','adviser_usage_periods'] loop
    if not (select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass) then
      raise exception 'RLS disabled on public.%',table_name;
    end if;
  end loop;
  for function_row in
    select p.oid::regprocedure as signature,p.prosecdef,p.proconfig,
      coalesce(p.proacl,acldefault('f',p.proowner)) as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname in (
      'reserve_adviser_request','complete_adviser_request',
      'release_adviser_request','purge_expired_adviser_history'
    )
  loop
    if not function_row.prosecdef or not ('search_path=""'=any(function_row.proconfig)) then
      raise exception 'Private helper % must be SECURITY DEFINER with an empty search_path',function_row.signature;
    end if;
    if has_function_privilege('anon',function_row.signature,'EXECUTE') or
       has_function_privilege('authenticated',function_row.signature,'EXECUTE') or
       not has_function_privilege('service_role',function_row.signature,'EXECUTE') or
       exists(select 1 from aclexplode(function_row.acl) a where a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'Unexpected private helper grants for %',function_row.signature;
    end if;
  end loop;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform * from public.adviser_conversations;
    raise exception 'Anon read adviser history';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_adviser_request(
      '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',null,repeat('a',64),5,100
    );
    raise exception 'Anon called reservation RPC';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","session_id":"40000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$
begin
  begin
    perform public.reserve_adviser_request(
      '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',null,repeat('a',64),5,100
    );
    raise exception 'Authenticated role called reservation RPC';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.adviser_usage_periods(user_id,period_start,successful_count,attempted_count)
      values ('30000000-0000-4000-8000-000000000001',date_trunc('month',now()),999,999);
    raise exception 'Authenticated role changed its quota';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.adviser_messages default values;
    raise exception 'Authenticated role inserted a private message';
  exception when insufficient_privilege then null; end;
  begin
    update public.adviser_conversations set title=title where false;
    raise exception 'Authenticated role updated a private conversation';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

set local role service_role;
do $$
declare
  r jsonb; replay jsonb; changed jsonb; lease uuid; next_lease uuid; conversation uuid;
  v_period_start timestamptz := date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  ok boolean; v_request_id uuid; i integer;
begin
  begin
    perform public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',gen_random_uuid(),null,repeat('a',64),null,100);
    raise exception 'Null per-user limit accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',gen_random_uuid(),null,repeat('a',64),5,null);
    raise exception 'Null global limit accepted';
  exception when sqlstate '22023' then null; end;

  r := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',null,repeat('a',64),2,1000);
  if r->>'status'<>'unauthorized' then raise exception 'Wrong-session reserve succeeded: %',r; end if;
  r := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null,repeat('a',64),2,1000);
  if r->>'status'<>'reserved' then raise exception 'Initial reserve failed: %',r; end if;
  conversation := (r->>'conversationId')::uuid;
  lease := (r->>'leaseId')::uuid;
  perform set_config('m3.user_a_conversation',conversation::text,true);
  ok := public.complete_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',lease,
    'Public'||chr(1)||E'\n\t'||repeat('x',100),'{"text":"Saved answer"}'::jsonb,'{"region":"West"}'::jsonb,11,23);
  if not ok then raise exception 'Valid completion failed'; end if;
  if exists(select 1 from public.adviser_conversations where id=conversation
      and (char_length(title)>80 or title ~ '[[:cntrl:]]')) then
    raise exception 'Conversation title contains control characters or exceeds 80 characters';
  end if;
  replay := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null,repeat('a',64),2,1000);
  if replay->>'status'<>'completed' or replay->'answer'<>'{"text":"Saved answer"}'::jsonb then
    raise exception 'Same-body retry did not return cache: %',replay;
  end if;
  changed := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null,repeat('b',64),2,1000);
  if changed->>'status'<>'conflict' then raise exception 'Changed-body retry did not conflict: %',changed; end if;

  r := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',conversation,repeat('c',64),2,1000);
  if r->>'status'<>'reserved' then raise exception 'Second reservation failed: %',r; end if;
  lease := (r->>'leaseId')::uuid;
  replay := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',conversation,repeat('d',64),2,1000);
  if replay->>'status'<>'busy' then raise exception 'Per-user busy limit failed: %',replay; end if;
  if public.complete_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',lease,
    'wrong session','{"text":"bad"}'::jsonb,'{}'::jsonb,1,1) then raise exception 'Wrong session committed'; end if;
  perform public.release_adviser_request('30000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',gen_random_uuid());
  update public.adviser_requests set reserved_until=now()-interval '1 second'
    where user_id='30000000-0000-4000-8000-000000000001' and request_id='50000000-0000-4000-8000-000000000002';
  r := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',conversation,repeat('c',64),2,1000);
  if r->>'status'<>'reserved' then raise exception 'Expired lease did not re-reserve: %',r; end if;
  next_lease := (r->>'leaseId')::uuid;
  if next_lease=lease then raise exception 'Retry reused its old lease ID'; end if;
  if public.complete_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',lease,
    'stale','{"text":"stale"}'::jsonb,'{}'::jsonb,1,1) then raise exception 'Stale lease committed'; end if;
  perform public.release_adviser_request('30000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',lease);
  if not exists(select 1 from public.adviser_requests where user_id='30000000-0000-4000-8000-000000000001'
      and request_id='50000000-0000-4000-8000-000000000002' and status='pending' and lease_id=next_lease) then
    raise exception 'Stale release changed current lease';
  end if;
  ok := public.complete_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',next_lease,
    'Second question.','{"text":"Second answer"}'::jsonb,'{}'::jsonb,2,3);
  if not ok then raise exception 'Current lease did not complete'; end if;
  r := public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',conversation,repeat('e',64),2,1000);
  if r->>'status'<>'quota' then raise exception 'Success quota was not enforced: %',r; end if;
  if not exists(select 1 from public.adviser_usage_periods where user_id='30000000-0000-4000-8000-000000000001'
      and period_start=v_period_start and successful_count=2 and attempted_count=3) then
    raise exception 'User A counters should be successful=2, attempted=3';
  end if;

  -- Three failed provider attempts use the retry budget; later reservation is rejected.
  for i in 1..3 loop
    v_request_id := ('51000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    r := public.reserve_adviser_request('30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000002',v_request_id,null,repeat('f',64),1,1000);
    if r->>'status'<>'reserved' then raise exception 'Retry attempt % failed: %',i,r; end if;
    if i=1 then
      conversation := (r->>'conversationId')::uuid;
      perform set_config('m3.user_b_conversation',conversation::text,true);
    end if;
    perform public.release_adviser_request('30000000-0000-4000-8000-000000000002',v_request_id,(r->>'leaseId')::uuid);
  end loop;
  r := public.reserve_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000099',conversation,repeat('f',64),1,1000);
  if r->>'status'<>'retry-limit' then raise exception 'Failed attempts did not exhaust retry budget: %',r; end if;
  if not exists(select 1 from public.adviser_usage_periods where user_id='30000000-0000-4000-8000-000000000002'
      and successful_count=0 and attempted_count=3) then raise exception 'Failed attempts were not counted'; end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","session_id":"40000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$
declare rows_deleted integer; conversation uuid:=current_setting('m3.user_a_conversation')::uuid;
begin
  if (select count(*) from public.adviser_conversations where user_id='30000000-0000-4000-8000-000000000001')<>1 or
     (select count(*) from public.adviser_messages where conversation_id=conversation)<>4 or
     (select count(*) from public.adviser_usage_periods where user_id='30000000-0000-4000-8000-000000000001')<>1 then
    raise exception 'Owner cannot read own history/messages/usage';
  end if;
  if exists(select 1 from public.adviser_conversations where user_id='30000000-0000-4000-8000-000000000002') then
    raise exception 'Owner read another account history';
  end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
do $$
declare rows_deleted integer; conversation uuid:=current_setting('m3.user_a_conversation')::uuid;
begin
  delete from public.adviser_conversations where id=conversation;
  get diagnostics rows_deleted=row_count;
  if rows_deleted<>0 then raise exception 'Other user deleted a conversation'; end if;
  if exists(select 1 from public.adviser_conversations where id=conversation) or
     exists(select 1 from public.adviser_messages where conversation_id=conversation) then
    raise exception 'Other user can read another account history';
  end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","session_id":"40000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$
declare rows_deleted integer; conversation uuid:=current_setting('m3.user_a_conversation')::uuid;
begin
  delete from public.adviser_conversations where id=conversation;
  get diagnostics rows_deleted=row_count;
  if rows_deleted<>1 then raise exception 'Owner could not delete own conversation'; end if;
  if exists(select 1 from public.adviser_conversations where id=conversation) or
     exists(select 1 from public.adviser_messages where conversation_id=conversation) then
    raise exception 'Conversation delete did not erase transcript';
  end if;
end;
$$;
reset role;

set local role service_role;
do $$
declare r jsonb; v_period_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
  if not exists(select 1 from public.adviser_requests where user_id='30000000-0000-4000-8000-000000000001'
      and request_id='50000000-0000-4000-8000-000000000001' and status='deleted' and response is null and conversation_id is null) then
    raise exception 'Conversation delete did not leave content-free idempotency tombstone';
  end if;
  if not exists(select 1 from public.adviser_usage_periods where user_id='30000000-0000-4000-8000-000000000001'
      and period_start=v_period_start and successful_count=2 and attempted_count=3) then
    raise exception 'History deletion changed quota';
  end if;
  r:=public.reserve_adviser_request('30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',null,repeat('a',64),2,1000);
  if r->>'status'<>'deleted' then raise exception 'Deleted request lost tombstone: %',r; end if;
end;
$$;

-- Lower a test-only global budget inside this transaction; first failed request consumes it.
reset role;
set local role supabase_admin;
insert into private.adviser_global_usage(period_start,attempted_count)
values(date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',1)
on conflict(period_start) do update set attempted_count=1;
reset role;
set local role service_role;
do $$
declare r jsonb; conversation uuid;
begin
  r:=public.reserve_adviser_request('30000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000001',null,repeat('1',64),5,2);
  if r->>'status'<>'reserved' then raise exception 'Global-cap test reserve failed: %',r; end if;
  conversation:=(r->>'conversationId')::uuid;
  perform public.release_adviser_request('30000000-0000-4000-8000-000000000003',
    '52000000-0000-4000-8000-000000000001',(r->>'leaseId')::uuid);
  r:=public.reserve_adviser_request('30000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000002',conversation,repeat('2',64),5,2);
  if r->>'status'<>'capacity' then raise exception 'Failed global attempt did not exhaust cap: %',r; end if;
  perform set_config('m3.user_c_conversation',conversation::text,true);
end;
$$;
reset role;

-- Expired history is invisible before purge, deleted after 90 days, and quota remains.
set local role service_role;
do $$
declare r jsonb; conversation uuid:=current_setting('m3.user_b_conversation')::uuid; ok boolean;
begin
  r:=public.reserve_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000001',conversation,repeat('3',64),10,1000);
  if r->>'status'<>'reserved' then raise exception 'Expiry-test reservation failed: %',r; end if;
  ok:=public.complete_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000001',
    (r->>'leaseId')::uuid,'Expiry question','{"text":"Expired answer"}'::jsonb,'{}'::jsonb,1,2);
  if not ok then raise exception 'Expiry-test completion failed'; end if;
  update public.adviser_conversations set expires_at=now()-interval '1 second' where id=conversation;
  update public.adviser_requests set created_at=now()-interval '91 days'
    where user_id='30000000-0000-4000-8000-000000000002' and request_id='53000000-0000-4000-8000-000000000001';
  perform set_config('m3.expired_conversation',conversation::text,true);
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
do $$
declare conversation uuid:=current_setting('m3.expired_conversation')::uuid;
begin
  if exists(select 1 from public.adviser_conversations where id=conversation) or
     exists(select 1 from public.adviser_messages where conversation_id=conversation) then
    raise exception 'Expired transcript is visible before purge';
  end if;
end;
$$;
reset role;

set local role service_role;
do $$
declare conversation uuid:=current_setting('m3.expired_conversation')::uuid;
begin
  if public.purge_expired_adviser_history()<1 then raise exception 'Purge deleted no expired conversation'; end if;
  if exists(select 1 from public.adviser_conversations where id=conversation) or
     exists(select 1 from public.adviser_messages where conversation_id=conversation) or
     exists(select 1 from public.adviser_requests where user_id='30000000-0000-4000-8000-000000000002'
       and request_id='53000000-0000-4000-8000-000000000001') then
    raise exception 'Expired transcript or older-than-90-day tombstone survived purge';
  end if;
  if not exists(select 1 from public.adviser_usage_periods where user_id='30000000-0000-4000-8000-000000000002'
      and successful_count=1 and attempted_count=4) then raise exception 'History purge changed quota'; end if;
end;
$$;
reset role;

-- A revoked session cannot complete an in-flight request or read its history.
set local role service_role;
do $$
declare r jsonb;
begin
  r:=public.reserve_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000001',null,repeat('5',64),10,1000);
  if r->>'status'<>'reserved' then raise exception 'Revocation-test reservation failed: %',r; end if;
  perform set_config('m3.revoked_lease',r->>'leaseId',true);
end;
$$;
reset role;
set local role supabase_admin;
delete from auth.sessions where id='40000000-0000-4000-8000-000000000002';
reset role;
set local role service_role;
do $$
begin
  if public.complete_adviser_request('30000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002','55000000-0000-4000-8000-000000000001',
    current_setting('m3.revoked_lease')::uuid,'revoked','{"text":"must not save"}'::jsonb,'{}'::jsonb,1,1) then
    raise exception 'Revoked session completed a request';
  end if;
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","session_id":"40000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
do $$
begin
  if exists(select 1 from public.adviser_conversations where user_id='30000000-0000-4000-8000-000000000002') or
     exists(select 1 from public.adviser_messages where user_id='30000000-0000-4000-8000-000000000002') then
    raise exception 'Revoked session read adviser history';
  end if;
end;
$$;
reset role;

-- Auth-user deletion cascades every private row.
set local role service_role;
do $$
declare r jsonb; ok boolean;
begin
  r:=public.reserve_adviser_request('30000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000001',
    current_setting('m3.user_c_conversation')::uuid,repeat('4',64),5,1000);
  if r->>'status'<>'reserved' then raise exception 'Cascade-test reservation failed: %',r; end if;
  ok:=public.complete_adviser_request('30000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000001',
    (r->>'leaseId')::uuid,'Delete me','{"text":"Private"}'::jsonb,'{}'::jsonb,1,1);
  if not ok then raise exception 'Cascade-test completion failed'; end if;
end;
$$;
reset role;
set local role supabase_admin;
delete from auth.users where id='30000000-0000-4000-8000-000000000003';
do $$
begin
  if exists(select 1 from public.adviser_conversations where user_id='30000000-0000-4000-8000-000000000003') or
     exists(select 1 from public.adviser_messages where user_id='30000000-0000-4000-8000-000000000003') or
     exists(select 1 from public.adviser_requests where user_id='30000000-0000-4000-8000-000000000003') or
     exists(select 1 from public.adviser_usage_periods where user_id='30000000-0000-4000-8000-000000000003') then
    raise exception 'Auth-user deletion left adviser rows';
  end if;
end;
$$;

rollback;
select 'PASS: M3 private adviser verification completed; all writes were rolled back' as result;
