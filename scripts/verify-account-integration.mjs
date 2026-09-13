import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { deleteCurrentAccount } from "../app/lib/account-deletion.ts";

// Explicitly supplied, ignored connection file. Never print credentials or JWTs.
const [configPath, reportPath, appOrigin] = process.argv.slice(2);
if (appOrigin && new URL(appOrigin).origin !== appOrigin) throw new Error("App origin must be an exact origin without a path.");
if (!configPath || !reportPath) throw new Error("Usage: node scripts/verify-account-integration.mjs <ignored-config.json> <report.json>");
const config = JSON.parse(await readFile(configPath, "utf8"));
const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const admin = createClient(config.API_URL, config.SECRET_KEY, options);
const created = [];
const checks = [];
const report = { checkedAt: new Date().toISOString(), origin: config.API_URL, applicationOrigin: appOrigin ?? null, status: "failed", checks, cleanup: "pending" };
async function check(name, run) { await run(); checks.push({ name, status: "passed" }); }
try {
  const users = [];
  for (const suffix of ["a", "b"]) {
    const email = `collegesearch-qa-${suffix}-${randomUUID()}@example.test`;
    const password = `Qa!${randomUUID()}`;
    const createdUser = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(createdUser.error, null, "test account creation succeeds");
    created.push(createdUser.data.user.id);
    const client = createClient(config.API_URL, config.PUBLISHABLE_KEY, options);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null, "password sign-in succeeds");
    users.push({ client, id: createdUser.data.user.id, token: signedIn.data.session.access_token });
  }
  const [a, b] = users;
  await check("authenticated current session is active", async () => { const r = await a.client.rpc("account_session_active"); assert.equal(r.error, null); assert.equal(r.data, true); });
  await check("owner can save and read a college", async () => {
    assert.equal((await a.client.from("saved_colleges").insert({ user_id: a.id, unit_id: 110635 })).error, null);
    const r = await a.client.from("saved_colleges").select("unit_id"); assert.equal(r.error, null); assert.deepEqual(r.data, [{ unit_id: 110635 }]);
  });
  await check("second user cannot read or write the first user's list", async () => {
    const r = await b.client.from("saved_colleges").select("unit_id").eq("user_id", a.id); assert.equal(r.error, null); assert.deepEqual(r.data, []);
    assert.ok((await b.client.from("saved_colleges").insert({ user_id: a.id, unit_id: 110644 })).error);
    assert.equal((await b.client.from("saved_colleges").insert({ user_id: b.id, unit_id: 110644 })).error, null);
  });
  await check("anonymous access cannot read saved lists or call the session check", async () => {
    const anonymous = createClient(config.API_URL, config.PUBLISHABLE_KEY, options);
    assert.ok((await anonymous.from("saved_colleges").select("unit_id")).error);
    assert.ok((await anonymous.rpc("account_session_active")).error);
  });
  await check("global revocation immediately blocks the old JWT through RLS", async () => {
    assert.equal((await admin.auth.admin.signOut(a.token, "global")).error, null);
    const stale = createClient(config.API_URL, config.PUBLISHABLE_KEY, { ...options, global: { headers: { Authorization: `Bearer ${a.token}` } } });
    assert.equal((await stale.rpc("account_session_active")).data, false);
    const r = await stale.from("saved_colleges").select("unit_id"); assert.equal(r.error, null); assert.deepEqual(r.data, []);
    assert.ok((await stale.from("saved_colleges").insert({ user_id: a.id, unit_id: 110644 })).error);
  });
  await check("account deletion revokes sessions and cascades only the verified owner's list", async () => {
    const origin = appOrigin ?? "https://collegesearch.test";
    const request = new Request(`${origin}/api/account`, { method: "DELETE", headers: { Origin: origin, Authorization: `Bearer ${b.token}`, "x-collegesearch-confirm-delete": "delete-my-account" } });
    const response = appOrigin ? await fetch(request) : await deleteCurrentAccount(request, {
      async verify(token) { const r = await admin.auth.getUser(token); const current = await b.client.rpc("account_session_active"); return r.data.user ? { id: r.data.user.id, active: !current.error && current.data === true } : null; },
      async revokeSessions(token) { return !(await admin.auth.admin.signOut(token, "global")).error; },
      async deleteUser(id) { return !(await admin.auth.admin.deleteUser(id)).error; },
    });
    assert.equal(response.status, 200);
    assert.ok((await admin.auth.admin.getUserById(b.id)).error);
    assert.deepEqual((await admin.from("saved_colleges").select("user_id").eq("user_id", b.id)).data, []);
    assert.equal((await admin.from("saved_colleges").select("unit_id").eq("user_id", a.id)).data.length, 1);
  });
  report.status = "passed";
} catch (error) {
  // Assertion messages have no credentials, response bodies or student records.
  report.error = String(error.message).slice(0, 500);
  process.exitCode = 1;
} finally {
  const failures = [];
  for (const id of created) {
    const existing = await admin.auth.admin.getUserById(id);
    if (existing.data.user && (await admin.auth.admin.deleteUser(id)).error) failures.push("test-user cleanup failed");
  }
  report.cleanup = failures.length ? "failed" : "passed";
  if (failures.length) process.exitCode = 1;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, passed: checks.length, cleanup: report.cleanup }));
}
