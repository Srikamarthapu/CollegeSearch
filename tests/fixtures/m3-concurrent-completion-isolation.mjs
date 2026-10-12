#!/usr/bin/env node
// Run only against the locally owned, network-isolated M3 Docker test database.
import { spawn } from "node:child_process";

const container = "collegesearch-goal-db-20261004";
const database = "collegesearch_m3_verify";
const firstUser = "30000000-0000-4000-8000-000000000001";
const firstSession = "40000000-0000-4000-8000-000000000001";
const secondUser = "30000000-0000-4000-8000-000000000002";
const secondSession = "40000000-0000-4000-8000-000000000002";
const firstRequest = "58000000-0000-4000-8000-000000000001";
const secondRequest = "58000000-0000-4000-8000-000000000002";
const appName = "m3-completion-lock-test";

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
      "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database,
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`psql failed (${code}): ${stderr.trim()}`));
    });
    child.stdin.end(sql);
  });
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let completionTransaction;
let enqueueTransaction;
let elapsedMs;
try {
  const before = await psql(`
    select (select count(*) from public.adviser_requests where user_id in ('${firstUser}','${secondUser}'))||'|'||
      (select count(*) from public.adviser_conversations where user_id in ('${firstUser}','${secondUser}'))||'|'||
      (select count(*) from public.adviser_usage_periods where user_id in ('${firstUser}','${secondUser}'))||'|'||
      (select count(*) from private.adviser_global_usage
        where period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC');
  `);
  if (before !== "0|0|0|0") throw new Error("Isolation test requires empty adviser rows/counters for the two seeded users and current period");

  const setup = await psql(`
    begin;
    set local role service_role;
    select result->>'conversationId' from (
      select public.enqueue_adviser_request('${firstUser}','${firstSession}','${firstRequest}',null,
        '${"a".repeat(64)}','Completion lock question',5,1000) as result
    ) queued;
    select public.acquire_adviser_queue_worker();
    select public.claim_adviser_request((select worker_lease_id from private.adviser_queue_control where singleton));
    commit;
  `);
  const lines = setup.split(/\r?\n/).filter(Boolean);
  const [conversationId, workerLeaseId, rawClaim] = lines;
  const job = JSON.parse(rawClaim);
  if (!conversationId || !workerLeaseId || job.requestId !== firstRequest || !job.leaseId) {
    throw new Error(`Unexpected isolated completion setup output: ${setup}`);
  }

  completionTransaction = psql(`
    begin;
    set application_name='${appName}';
    set local role service_role;
    select public.complete_adviser_request('${firstUser}','${firstSession}','${firstRequest}','${job.leaseId}',
      'Completion lock question','{"text":"Saved"}'::jsonb,'{}'::jsonb,1,1);
    select public.release_adviser_queue_worker('${workerLeaseId}');
    select pg_sleep(1.5);
    commit;
  `);

  let completionHoldsTransaction = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const active = await psql(`
      select count(*) from pg_stat_activity
      where application_name='${appName}' and state='active' and query like '%pg_sleep%';
    `);
    if (active === "1") {
      completionHoldsTransaction = true;
      break;
    }
    await sleep(25);
  }
  if (!completionHoldsTransaction) throw new Error("Completion did not reach the lock-hold point");

  const startedAt = Date.now();
  enqueueTransaction = psql(`
    begin;
    set local role service_role;
    select result->>'status' from (
      select public.enqueue_adviser_request('${secondUser}','${secondSession}','${secondRequest}',null,
        '${"b".repeat(64)}','Other user while completing',5,1000) as result
    ) queued;
    commit;
  `);
  const enqueueResult = await Promise.race([
    enqueueTransaction.then((result) => ({ result })),
    sleep(900).then(() => ({ timedOut: true })),
  ]);
  elapsedMs = Date.now() - startedAt;
  if (enqueueResult.timedOut) {
    throw new Error("Different-user enqueue waited on the completion transaction's month-wide lock");
  }
  if (enqueueResult.result !== "queued") throw new Error(`Different-user enqueue returned ${enqueueResult.result}`);
} finally {
  await Promise.allSettled([completionTransaction, enqueueTransaction].filter(Boolean));
  await psql(`
    begin;
    set local role supabase_admin;
    delete from public.adviser_messages where request_id in ('${firstRequest}','${secondRequest}');
    delete from public.adviser_conversations c using public.adviser_requests r
      where r.user_id in ('${firstUser}','${secondUser}') and r.request_id in ('${firstRequest}','${secondRequest}')
        and c.id=r.conversation_id;
    delete from public.adviser_requests where user_id in ('${firstUser}','${secondUser}')
      and request_id in ('${firstRequest}','${secondRequest}');
    delete from public.adviser_usage_periods where user_id in ('${firstUser}','${secondUser}')
      and period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
    delete from private.adviser_global_usage
      where period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
    commit;
  `);
}

console.log(`PASS: other-user enqueue completed while completion held its transaction (${elapsedMs} ms); rows and counters cleaned`);
