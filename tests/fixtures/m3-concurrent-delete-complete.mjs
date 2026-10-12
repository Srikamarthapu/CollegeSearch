#!/usr/bin/env node
// Run only against the locally owned, network-isolated test container.
import { spawn } from "node:child_process";

const container = "collegesearch-goal-db-20261004";
const database = "collegesearch_m3_verify";
const userId = "30000000-0000-4000-8000-000000000001";
const sessionId = "40000000-0000-4000-8000-000000000001";
const requestId = "56000000-0000-4000-8000-000000000001";
const bodyHash = "6".repeat(64);

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

const reserved = await psql(`
begin;
set local role service_role;
select concat(result->>'status','|',result->>'leaseId','|',result->>'conversationId')
from (select public.reserve_adviser_request(
  '${userId}','${sessionId}','${requestId}',null,'${bodyHash}',5,1000
) as result) reserved;
commit;
`);
const [reserveStatus, leaseId, conversationId] = reserved.split("|");
if (reserveStatus !== "reserved" || !leaseId || !conversationId) {
  throw new Error(`Expected a new pending reservation, received ${reserved}`);
}

const deletion = psql(`
begin;
set local lock_timeout='8s';
set local statement_timeout='10s';
set local role authenticated;
set local application_name='m3-delete-race';
select set_config('request.jwt.claims',
  '{"sub":"${userId}","session_id":"${sessionId}","is_anonymous":false}',true);
with removed as (
  delete from public.adviser_conversations where id='${conversationId}' returning id
) select count(*) from removed;
select pg_sleep(1.5);
commit;
`);

// Wait until DELETE has locked the conversation and reached its sleep before completion starts.
let deletionHasLock = false;
for (let attempt = 0; attempt < 100; attempt += 1) {
  const active = await psql(`
    select count(*) from pg_stat_activity
    where application_name='m3-delete-race' and state='active' and query like '%pg_sleep%';
  `);
  if (active === "1") {
    deletionHasLock = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
}
if (!deletionHasLock) throw new Error("Delete transaction did not reach its lock-hold point");

const completion = await psql(`
begin;
set local lock_timeout='8s';
set local statement_timeout='10s';
set local role service_role;
select public.complete_adviser_request(
  '${userId}','${sessionId}','${requestId}','${leaseId}',
  'A concurrent completion.','{"text":"must not survive deletion"}'::jsonb,'{}'::jsonb,1,1
);
commit;
`);
await deletion;
if (completion !== "f") throw new Error(`Completion against deleted conversation should fail; got ${completion}`);

const tombstone = await psql(`
select concat(status,'|',coalesce(response::text,'NULL'),'|',coalesce(conversation_id::text,'NULL'))
from public.adviser_requests where user_id='${userId}' and request_id='${requestId}';
`);
if (tombstone !== "deleted|NULL|NULL") throw new Error(`Unexpected post-race request state: ${tombstone}`);

console.log("PASS: owner deletion held the conversation lock; concurrent completion returned false, no deadlock occurred, transcript was erased, and the tombstone remained.");
