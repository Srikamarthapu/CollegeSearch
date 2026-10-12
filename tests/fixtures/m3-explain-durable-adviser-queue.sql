-- Local query-plan evidence only; requires the durable queue migration on the
-- isolated collegesearch_m3_verify clone. All synthetic rows are rolled back.
begin;
set local role supabase_admin;

do $$
declare v_conversation uuid;
begin
  insert into public.adviser_conversations(user_id)
    values ('30000000-0000-4000-8000-000000000003') returning id into v_conversation;
  insert into public.adviser_requests(
    user_id,request_id,session_id,conversation_id,body_hash,status,period_start,
    reserved_until,prompt,available_at,attempt_count
  )
  select '30000000-0000-4000-8000-000000000003',gen_random_uuid(),
    '40000000-0000-4000-8000-000000000003',v_conversation,repeat('a',64),'pending',
    date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',
    case when g<=2000 then now()-interval '5 minutes' else now()+interval '1 hour' end,
    repeat('x',100),
    case when g<=10 then now()-interval '5 minutes' else now()+interval '1 hour' end,
    case when g<=5 then 3 else 0 end
  from generate_series(1,20000) as g;
end;
$$;

analyze public.adviser_requests;

select 'Due-claim candidate query' as plan_name;
explain (costs true, format text)
select r.user_id,r.session_id,r.request_id,r.conversation_id,r.prompt,r.attempt_count,c.preferences,
  coalesce((select m.payload->'recommendations' from public.adviser_messages m
    where m.user_id=r.user_id and m.conversation_id=r.conversation_id and m.role='assistant'
    order by m.created_at desc limit 1),'[]'::jsonb) as recommendations
from public.adviser_requests r
join public.adviser_conversations c on c.id=r.conversation_id and c.user_id=r.user_id and c.expires_at>now()
where r.status='pending' and r.prompt is not null and r.available_at<=now() and r.reserved_until<=now()
  and r.attempt_count<3
  and exists(select 1 from auth.sessions s where s.id=r.session_id and s.user_id=r.user_id)
order by r.available_at,r.created_at for update of r skip locked limit 1;

select 'Expired-lease cleanup candidates' as plan_name;
explain (costs true, format text)
select q.user_id,q.request_id from public.adviser_requests q
where q.status='pending' and q.prompt is not null and q.reserved_until<=now()
  and (not exists(select 1 from auth.sessions s where s.id=q.session_id and s.user_id=q.user_id)
    or not exists(select 1 from public.adviser_conversations c where c.id=q.conversation_id
      and c.user_id=q.user_id and c.expires_at>now()))
order by q.reserved_until,q.created_at for update skip locked limit 100;

select 'Exhausted-lease cleanup candidates' as plan_name;
explain (costs true, format text)
select q.user_id,q.request_id from public.adviser_requests q
where q.status='pending' and q.prompt is not null and q.attempt_count>=3 and q.reserved_until<=now()
order by q.reserved_until,q.created_at for update skip locked limit 100;

rollback;
select 'PASS: queue candidate and cleanup plans captured; all synthetic requests rolled back' as result;
