#!/usr/bin/env node
// Run only against the locally owned, network-isolated M3 Docker test database.
import { spawn } from "node:child_process";

const container = "collegesearch-goal-db-20261004";
const database = "collegesearch_m3_verify";
const userId = "30000000-0000-4000-8000-000000000001";
const sessionId = "40000000-0000-4000-8000-000000000001";
const firstRequest = "57000000-0000-4000-8000-000000000001";
const secondRequest = "57000000-0000-4000-8000-000000000002";
const appName = "m3-adviser-enqueue-race-a";

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

let primaryResult;
let competingResult;
let firstTransaction;
let competingTransaction;
try {
  const existing = await psql(`
    select (select count(*) from public.adviser_requests where user_id='${userId}')||'|'||
      (select count(*) from public.adviser_conversations where user_id='${userId}')||'|'||
      (select count(*) from public.adviser_usage_periods where user_id='${userId}')||'|'||
      (select count(*) from private.adviser_global_usage
        where period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC');
  `);
  if (existing !== "0|0|0|0") throw new Error("Concurrency fixture requires empty adviser rows/counters for seeded user A and the current period");

  firstTransaction = psql(`
    begin;
    set application_name='${appName}';
    set local role service_role;
    select result->>'status' from (
      select public.enqueue_adviser_request('${userId}','${sessionId}','${firstRequest}',null,
        '${"a".repeat(64)}','Concurrent first question',5,1000) as result
    ) queued;
    select pg_sleep(1.5);
    commit;
  `);

  let holdingLock = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const active = await psql(`
      select count(*) from pg_stat_activity
      where application_name='${appName}' and state='active' and query like '%pg_sleep%';
    `);
    if (active === "1") {
      holdingLock = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!holdingLock) throw new Error("First enqueue did not reach the lock-hold point");

  competingTransaction = psql(`
    begin;
    set local role service_role;
    select result->>'status' from (
      select public.enqueue_adviser_request('${userId}','${sessionId}','${secondRequest}',null,
        '${"b".repeat(64)}','Concurrent second question',5,1000) as result
    ) queued;
    commit;
  `);
  [primaryResult, competingResult] = await Promise.all([firstTransaction, competingTransaction]);
  if (primaryResult !== "queued" || competingResult !== "busy") {
    throw new Error(`Expected serialized enqueue statuses queued|busy; received ${primaryResult}|${competingResult}`);
  }
} finally {
  await Promise.allSettled([firstTransaction, competingTransaction].filter(Boolean));
  // This isolated DB begins with empty adviser fixtures; remove only rows this script owns.
  await psql(`
    begin;
    set local role supabase_admin;
    delete from public.adviser_messages where request_id in ('${firstRequest}','${secondRequest}');
    delete from public.adviser_conversations c using public.adviser_requests r
      where r.user_id='${userId}' and r.request_id='${firstRequest}' and c.id=r.conversation_id;
    delete from public.adviser_requests where user_id='${userId}' and request_id in ('${firstRequest}','${secondRequest}');
    delete from public.adviser_usage_periods where user_id='${userId}'
      and period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
    delete from private.adviser_global_usage
      where period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
    commit;
  `);
}

console.log(`PASS: independent transactions serialized same-period enqueues as ${primaryResult} then ${competingResult}; test rows and counters cleaned`);
