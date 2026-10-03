# CollegeSearch database setup

CollegeSearch includes the database boundary and client synchronization flow
for account-synced saves. It remains dormant when Supabase is unconfigured, so
browser-only saves continue to work without an account. A hosted deployment
must apply and verify the migration below before enabling account sync.

## Schema included

The CLI-generated migration in `supabase/migrations/` creates only
`public.saved_colleges`:

- `user_id` references `auth.users(id)` and cascades on account deletion
- `unit_id` must be one of the 50 UNITIDs in the committed reviewed cohort
- `(user_id, unit_id)` is the primary key, preventing duplicate saves
- `created_at` records when the row was created
- authenticated users receive only `SELECT`, `INSERT`, and `DELETE`
- anonymous access is revoked
- separate RLS policies authorize each supported operation only when
  `(select auth.uid()) = user_id` and the JWT is not an anonymous Auth identity

There is deliberately no update path, trigger, view, privileged function, or
server secret in this foundation.

The browser keeps guest saves in a guest-only key. A verified account receives
its own UUID-scoped cache and per-college retry records; those records never
contain an email, token, or profile. Existing guest saves are not uploaded at
sign-in. The student must explicitly import them after the remote account list
has loaded. Remote writes are serialized per account with the browser Web Locks
API, and the UI fails closed when the active identity, local retry record, or
cross-tab coordination cannot be verified.

The committed local configuration disables anonymous Auth sign-ins. Supabase
anonymous users otherwise assume the `authenticated` Postgres role, so keep
anonymous sign-ins disabled in the hosted project's Auth settings too. If the
product later introduces guest accounts, revise and retest these policies before
enabling that provider.

The migration pins the same 50 UNITIDs as `data/colleges.json`, which bounds one
account to at most 50 unique rows under the composite primary key. Update the
constraint and its exact-cohort regression whenever the reviewed catalog
changes. If colleges later become database-managed records, replace the fixed
constraint with a foreign key to that canonical table.

## Verify the committed contract without Docker

The focused static contract tests run with the normal test suite, or directly:

```bash
node --test tests/supabase-saved-colleges-schema.test.mjs
```

These tests verify the table constraints, least-privilege grants, RLS policy
shape, and absence of privileged database code. They do not replace a real
database test.

## Verify against a local Supabase database

Install Docker Desktop and a current Supabase CLI, then run from the repository
root:

```bash
supabase start
supabase db reset
supabase migration list --local
```

`supabase db reset` rebuilds the local database from the committed migrations.
Do not run it against a hosted database. After the reset, use local Studio or
SQL to confirm that:

1. an authenticated user can insert, list, and delete their own save;
2. that user cannot read or delete a second user's save;
3. a row whose `user_id` differs from `auth.uid()` cannot be inserted;
4. the anonymous role cannot access the table; and
5. an anonymous Auth identity is rejected even though Supabase assigns it the
   `authenticated` Postgres role;
6. an unreviewed positive UNITID is rejected; and
7. deleting an Auth user removes that user's saved rows.

Also confirm in the hosted Auth settings that anonymous sign-ins remain
disabled; the local `config.toml` does not change a hosted project's setting.

## Apply later to the hosted project

When the CollegeSearch Supabase project is available, link the CLI to that
specific project and review the pending migration before applying it. Keep only
the project URL and publishable key in the browser environment, as documented
in `AUTH_SETUP.md`; database passwords and secret keys must not be committed or
placed in any `NEXT_PUBLIC_*` variable.

After applying the migration, run Supabase's security and performance advisors
and repeat the two-user RLS matrix above against a non-production project. Then
exercise save, remove, offline retry, explicit guest import, sign-out, account
switching, and two-tab edits before enabling account synchronization publicly.

## Current references

- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase CLI local development](https://supabase.com/docs/guides/local-development/cli/getting-started)
