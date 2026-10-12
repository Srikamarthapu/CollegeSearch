# Durable adviser queue

Adviser messages are committed to `public.adviser_requests` before the API returns `202`. The browser polls only the signed-in owner’s request status; it never starts work from a status read. The Next.js `after()` hook can wake one job immediately, while a separately enabled Supabase `pg_cron` + `pg_net` dispatcher retries due work if a browser closes or a function exits early.

The request stores a bounded prompt until completion. Claims use database leases and `SKIP LOCKED`, and the worker rechecks the Auth session and conversation before generating and before committing. Provider errors retry after 15 seconds and then 60 seconds, with three total claims. The original allowance attempt is reserved at enqueue; worker retries do not consume more allowance. Completed and terminal requests erase the queued prompt. Only one worker lease is active globally, a deliberate low-throughput limit for this first durable path.

The public adviser gate remains unchanged in its policy: the queue does not authorize public NVIDIA use. It also requires `ADVISER_WORKER_SECRET` (at least 32 characters), so messages cannot be queued until the worker endpoint is configured. The nightly retention endpoint continues to use the existing `CRON_SECRET`.

## Production setup

After the worker route is deployed and `ADVISER_WORKER_SECRET` is set for the Vercel Production environment, add the exact same worker secret and deployed HTTPS worker URL to Supabase Vault. Use the production alias or URL that the app’s cron invocation can reach. Do not reuse or rotate `CRON_SECRET`.

```sql
select vault.create_secret(
  'https://<production-host>/api/internal/adviser-worker',
  'college_search_worker_url',
  'CollegeSearch adviser queue worker URL'
);

select vault.create_secret(
  '<same value as Vercel ADVISER_WORKER_SECRET>',
  'college_search_worker_secret',
  'CollegeSearch adviser queue worker bearer secret'
);
```

The migration installs `pg_cron` and `pg_net` but does not schedule the dispatcher. After both Vault entries exist and the worker route is READY, enable the one-minute wake-up job:

```sql
select private.enable_adviser_queue_dispatch();
```

To stop scheduled delivery while preserving queued rows:

```sql
select private.disable_adviser_queue_dispatch();
```

The dispatcher checks for due rows and an available worker lease before sending a wake-up. Vault secrets are not copied into adviser rows, function responses, or browser-visible status.

## Local verification

Run the focused API contract checks and TypeScript check:

```sh
node --test tests/adviser-service.test.ts
node --test tests/adviser-queue-orchestrator.test.ts tests/adviser-worker-auth.test.ts tests/adviser-polling.test.ts
npx tsc --noEmit --pretty false
```

The database queue fixture is transactional and targets only the isolated `collegesearch_m3_verify` local database. A local clone may reject `CREATE EXTENSION pg_cron` when its cluster is configured to install cron only in the `postgres` database; in that case, omit the two extension statements only in the temporary test copy. Do not change or apply the production migration by hand to work around the fixture limitation.
