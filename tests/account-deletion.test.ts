import assert from "node:assert/strict";
import test from "node:test";
import { deleteCurrentAccount, type AccountDeletionServices } from "../app/lib/account-deletion.ts";

const request = (headers: Record<string, string> = {}, method = "DELETE") => new Request("https://college.example/api/account", {
  method, headers: { Origin: "https://college.example", Authorization: "Bearer signed.token.value", "x-collegesearch-confirm-delete": "delete-my-account", ...headers },
});
function services(events: string[]): AccountDeletionServices {
  return { async verify() { events.push("verify"); return { id: "verified-owner", active: true }; }, async revokeSessions() { events.push("revoke"); return true; }, async deleteUser(id) { events.push(`delete:${id}`); return true; } };
}
test("deletion uses verified identity and revokes all sessions before deletion", async () => {
  const events: string[] = [];
  const result = await deleteCurrentAccount(request(), services(events));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(events, ["verify", "revoke", "delete:verified-owner"]);
});
test("cross-origin, missing confirmation, malformed bearer, and wrong method cannot call Auth", async () => {
  for (const [input, status] of [[request({ Origin: "https://attacker.example" }), 403], [request({ "x-collegesearch-confirm-delete": "" }), 400], [request({ Authorization: "Basic no" }), 401], [request({}, "POST"), 405]] as const) {
    const events: string[] = [];
    assert.equal((await deleteCurrentAccount(input, services(events))).status, status);
    assert.deepEqual(events, []);
  }
});
test("a revoked session and provider verification errors fail closed", async () => {
  const events: string[] = [];
  const dependencies = services(events);
  dependencies.verify = async () => ({ id: "former-owner", active: false });
  assert.equal((await deleteCurrentAccount(request(), dependencies)).status, 401);
  assert.deepEqual(events, []);
  dependencies.verify = async () => { throw new Error("secret internal details"); };
  const result = await deleteCurrentAccount(request(), dependencies);
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /secret internal/);
});
test("failed revocation prevents deletion and failed deletion reports retry after sign-in", async () => {
  const events: string[] = [];
  const dependencies = services(events);
  dependencies.revokeSessions = async () => false;
  assert.equal((await deleteCurrentAccount(request(), dependencies)).status, 503);
  assert.deepEqual(events, ["verify"]);
  dependencies.revokeSessions = async () => true;
  dependencies.deleteUser = async () => false;
  const result = await deleteCurrentAccount(request(), dependencies);
  assert.equal(result.status, 503);
  assert.match(await result.text(), /Sessions were revoked/);
  assert.equal((await deleteCurrentAccount(request(), null)).status, 503);
});
