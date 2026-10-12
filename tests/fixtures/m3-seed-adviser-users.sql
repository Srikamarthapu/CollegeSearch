-- Isolated Docker verification fixture only; never run against a hosted project.
insert into auth.users (id) values
  ('30000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into auth.sessions (id, user_id) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

select 'PASS: three isolated adviser users and active sessions seeded' as result;
