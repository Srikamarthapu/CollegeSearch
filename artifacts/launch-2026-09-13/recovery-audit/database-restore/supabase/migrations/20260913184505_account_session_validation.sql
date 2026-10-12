-- The Auth schema is not exposed through PostgREST. This narrow check reveals
-- only whether the caller's own, signed JWT session still exists.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.account_session_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from auth.sessions
      where user_id = auth.uid()
        and id::text = auth.jwt() ->> 'session_id'
    );
$$;
revoke all on function private.account_session_active() from public, anon;
grant execute on function private.account_session_active() to authenticated;

create function public.account_session_active()
returns boolean
language sql stable security invoker
set search_path = ''
as $$ select private.account_session_active(); $$;
revoke all on function public.account_session_active() from public, anon;
grant execute on function public.account_session_active() to authenticated;

-- Revoked sessions cannot continue editing a student's list with a JWT whose
-- signature has not yet expired. The uncorrelated subquery is checked once.
create policy saved_colleges_active_session
on public.saved_colleges as restrictive
for all to authenticated
using ((select private.account_session_active()))
with check ((select private.account_session_active()));
