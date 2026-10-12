import assert from "node:assert/strict";
import test from "node:test";
import { emptyAdviserPreferences } from "../app/lib/adviser/contracts.ts";
import type { AdviserAnswer } from "../app/lib/adviser/engine.ts";
import { adviserConsentVersion, handleAdviserTurn, type AdviserTurnServices } from "../app/lib/adviser/service.ts";
const requestId = "a0000000-0000-4000-8000-000000000001";
const conversationId = "c0000000-0000-4000-8000-000000000001";
const answer: AdviserAnswer = { version: 1, message: "What would you like to study?", question: null, preferences: emptyAdviserPreferences, recommendations: [], notices: [], retrievalMode: "not-needed" };
function request(extra = {}, origin = "https://college.test") {
  return new Request("https://college.test/api/adviser", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ requestId, conversationId: null, message: "Engineering in California", consentVersion: adviserConsentVersion, ...extra }) });
}
function services(overrides: Partial<AdviserTurnServices> = {}): AdviserTurnServices {
  return { enabled: true, enqueue: async () => ({ status: "queued", conversationId }), usage: async () => ({ used: 1, limit: 20, remaining: 19, resetsAt: "2026-11-01T00:00:00.000Z" }), ...overrides };
}
test("adviser API rejects unauthenticated, cross-origin, extra identity and missing consent before enqueue", async () => {
  assert.equal((await handleAdviserTurn(request(), null)).status, 401);
  assert.equal((await handleAdviserTurn(request({}, "https://evil.test"), services())).status, 403);
  let called = false;
  const store = services({ enqueue: async () => { called = true; throw new Error(); } });
  for (const extra of [{ userId: "victim" }, { consentVersion: null }, { message: "x".repeat(2001) }, { requestId: "nope" }]) assert.equal((await handleAdviserTurn(request(extra), store)).status, 400);
  assert.equal(called, false);
});
test("disabled adviser preserves public tools and never reserves capacity", async () => {
  const response = await handleAdviserTurn(request(), services({ enabled: false, enqueue: async () => { throw new Error("Must not enqueue"); } }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "disabled");
});
test("a valid message is durably enqueued and returns immediately without running the provider", async () => {
  let enqueueInput: Parameters<AdviserTurnServices["enqueue"]>[0] | undefined;
  const response = await handleAdviserTurn(request(), services({
    enqueue: async (input) => { enqueueInput = input; return { status: "queued", conversationId }; },
  }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(enqueueInput);
  const { bodyHash, ...queuedInput } = enqueueInput;
  assert.match(bodyHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(queuedInput, { requestId, conversationId: null, message: "Engineering in California" });
  assert.deepEqual(await response.json(), { requestId, conversationId, status: "queued" });
});
test("completed idempotent retry returns the saved answer and allowance without enqueue", async () => {
  const response = await handleAdviserTurn(request(), services({ enqueue: async () => ({ status: "completed", conversationId, answer }) }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).answer, answer);
});
test("quota, busy and invalidated statuses never start work", async () => {
  for (const status of ["quota", "pending", "busy", "capacity", "deleted", "failed"] as const) {
    const response = await handleAdviserTurn(request(), services({ enqueue: async () => ({ status }), }));
    assert.ok([429, 409, 503, 410].includes(response.status));
    assert.equal((await response.json()).code, status);
  }
});
