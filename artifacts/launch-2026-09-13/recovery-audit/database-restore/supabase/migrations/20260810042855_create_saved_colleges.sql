create table public.saved_colleges (
  user_id uuid not null references auth.users (id) on delete cascade,
  unit_id bigint not null,
  created_at timestamptz not null default now(),
  constraint saved_colleges_pkey primary key (user_id, unit_id),
  constraint saved_colleges_unit_id_catalog check (
    unit_id = any (array[
      104151, 104179, 110404, 110422, 110529, 110556, 110565, 110583,
      110592, 110608, 110617, 110635, 110644, 110653, 110662, 110671,
      110680, 110705, 110714, 111948, 117946, 121345, 122409, 122612,
      122755, 122931, 123961, 130794, 139755, 145637, 147767, 166027,
      166629, 166683, 170976, 186131, 190150, 193900, 198419, 199120,
      204796, 209542, 228778, 234076, 236939, 236948, 240444, 243744,
      243780, 445188
    ]::bigint[])
  )
);

comment on table public.saved_colleges is
  'Colleges saved by an authenticated CollegeSearch user.';

alter table public.saved_colleges enable row level security;

-- Data API access is opt-in and limited to the three operations the app needs.
revoke all privileges on table public.saved_colleges from public;
revoke all privileges on table public.saved_colleges from anon;
revoke all privileges on table public.saved_colleges from authenticated;
grant select, insert, delete on table public.saved_colleges to authenticated;

create policy saved_colleges_select_own
on public.saved_colleges
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);

create policy saved_colleges_insert_own
on public.saved_colleges
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);

create policy saved_colleges_delete_own
on public.saved_colleges
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);
