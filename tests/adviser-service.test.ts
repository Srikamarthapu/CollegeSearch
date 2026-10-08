import assert from "node:assert/strict";
import test from "node:test";
import { emptyAdviserPreferences } from "../app/lib/adviser/contracts.ts";
import { adviserConsentVersion, handleAdviserTurn, type AdviserTurnServices } from "../app/lib/adviser/service.ts";
import type { AdviserAnswer } from "../app/lib/adviser/engine.ts";
const requestId = "a0000000-0000-4000-8000-000000000001";
const conversationId = "c0000000-0000-4000-8000-000000000001";
const leaseId = "d0000000-0000-4000-8000-000000000001";
const answer: AdviserAnswer = { version: 1, message: "What would you like to study?", question: null, preferences: emptyAdviserPreferences, recommendations: [], notices: [], retrievalMode: "not-needed" };
function request(extra = {}, origin = "https://college.test") {
  return new Request("https://college.test/api/adviser", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ requestId, conversationId: null, message: "Engineering in California", consentVersion: adviserConsentVersion, ...extra }) });
}
function services(overrides: Partial<AdviserTurnServices> = {}): AdviserTurnServices {
  return { enabled: true, reserve: async () => ({ status: "reserved", conversationId, leaseId }), preferences: async () => ({}), previousRecommendationIds: async () => [], generate: async () => ({ answer, inputTokens: 30, outputTokens: 20 }), complete: async () => true, release: async () => {}, usage: async () => ({ used: 1, limit: 20, remaining: 19, resetsAt: "2026-11-01T00:00:00.000Z" }), ...overrides };
}
test("adviser API rejects unauthenticated, cross-origin, extra identity and missing consent before provider calls", async () => {
  assert.equal((await handleAdviserTurn(request(), null)).status, 401);
  assert.equal((await handleAdviserTurn(request({}, "https://evil.test"), services())).status, 403);
  let called = false;
  const store = services({ generate: async () => { called = true; throw new Error(); } });
  for (const extra of [{ userId: "victim" }, { consentVersion: null }, { message: "x".repeat(2001) }, { requestId: "nope" }]) assert.equal((await handleAdviserTurn(request(extra), store)).status, 400);
  assert.equal(called, false);
});
test("disabled adviser preserves public tools and never reserves capacity", async () => {
  const response = await handleAdviserTurn(request(), services({ enabled: false, reserve: async () => { throw new Error("Must not reserve"); } }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "disabled");
});
test("successful response is persisted before returning and uses lease bound to reservation", async () => {
  const steps: string[] = [];
  const response = await handleAdviserTurn(request(), services({
    reserve: async (input) => { steps.push("reserve"); assert.match(input.bodyHash, /^[0-9a-f]{64}$/); return { status: "reserved", conversationId, leaseId }; },
    generate: async () => { steps.push("generate"); return { answer, inputTokens: 30, outputTokens: 20 }; },
    complete: async (input) => { steps.push("complete"); assert.equal(input.leaseId, leaseId); return true; },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(steps, ["reserve", "generate", "complete"]);
});
test("generation receives only a bounded set of safe prior recommendation IDs", async () => {
  let received: number[] | undefined;
  const response = await handleAdviserTurn(request(), services({
    previousRecommendationIds: async () => [110635, -1, 110644, 110653, 110583, 110635, 4.5, 0],
    generate: async (_message, _preferences, _signal, ids) => { received = ids; return { answer, inputTokens: 0, outputTokens: 0 }; },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, [110635, 110644, 110653, 110583]);
});
test("completed idempotent retry reuses persisted answer without inference or another commit", async () => {
  const response = await handleAdviserTurn(request(), services({ reserve: async () => ({ status: "completed", conversationId, answer }), generate: async () => { throw new Error("No duplicate inference"); }, complete: async () => { throw new Error("No duplicate charge"); } }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).answer, answer);
});
test("provider errors, failed persistence and cancellation release only their lease and redact diagnostics", async () => {
  for (const fail of ["provider", "commit"]) {
    const released: string[][] = [];
    const response = await handleAdviserTurn(request(), services({
      generate: async () => { if (fail === "provider") throw new Error("secret-key private prompt upstream body"); return { answer, inputTokens: 30, outputTokens: 20 }; },
      complete: async () => false,
      release: async (...args) => { released.push(args); },
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(released, [[requestId, leaseId]]);
    assert.doesNotMatch(await response.text(), /secret-key|private prompt|upstream body/);
  }
});
test("quota and in-flight states do not run generation and return recoverable errors", async () => {
  for (const status of ["quota", "pending", "busy", "capacity", "deleted"] as const) {
    const response = await handleAdviserTurn(request(), services({ reserve: async () => ({ status }), generate: async () => { throw new Error("No call after refusal"); } }));
    assert.ok([429, 409, 503, 410].includes(response.status));
    assert.equal((await response.json()).code, status);
  }
});
