import assert from "node:assert/strict";
import test from "node:test";
import { AdviserQueueGateClosedError, processOneQueuedAdviserJob, type QueueJobLease } from "../app/lib/adviser/queue-orchestrator.ts";

const job: QueueJobLease = { userId: "u1", requestId: "r1", leaseId: "l1" };

function fake(overrides: Partial<Parameters<typeof processOneQueuedAdviserJob<typeof job, string>>[0]> = {}) {
  const calls = { pause: 0, acquire: 0, claim: 0, generate: 0, complete: 0, retry: 0, release: 0 };
  const services = {
    enabled: () => true,
    pause: async () => { calls.pause += 1; },
    acquire: async () => { calls.acquire += 1; return "worker-lease"; },
    claim: async () => { calls.claim += 1; return job; },
    generate: async () => { calls.generate += 1; return "answer"; },
    complete: async () => { calls.complete += 1; return true; },
    retry: async () => { calls.retry += 1; return { status: "retried" }; },
    release: async () => { calls.release += 1; },
    ...overrides,
  };
  return { calls, services };
}

test("worker orchestration commits a generated result and releases its global lease", async () => {
  const { calls, services } = fake();
  assert.deepEqual(await processOneQueuedAdviserJob(services), { status: "completed" });
  assert.equal(calls.generate, 1);
  assert.equal(calls.complete, 1);
  assert.equal(calls.retry, 0);
  assert.equal(calls.release, 1);
});

test("provider failure retries the durable job and releases its global lease", async () => {
  const { calls, services } = fake({ generate: async () => { calls.generate += 1; throw new Error("provider unavailable"); } });
  assert.deepEqual(await processOneQueuedAdviserJob(services), { status: "retried" });
  assert.equal(calls.complete, 0);
  assert.equal(calls.retry, 1);
  assert.equal(calls.release, 1);
});

test("a stale completion is routed through durable retry", async () => {
  const { calls, services } = fake({ complete: async () => { calls.complete += 1; return false; } });
  assert.deepEqual(await processOneQueuedAdviserJob(services), { status: "retried" });
  assert.equal(calls.generate, 1);
  assert.equal(calls.retry, 1);
  assert.equal(calls.release, 1);
});

test("a closed provider gate pauses dispatch without acquiring or generating", async () => {
  const { calls, services } = fake({ enabled: () => false });
  assert.deepEqual(await processOneQueuedAdviserJob(services), { status: "disabled" });
  assert.equal(calls.pause, 1);
  assert.equal(calls.acquire, 0);
  assert.equal(calls.claim, 0);
  assert.equal(calls.generate, 0);
});

test("a crash while claiming still releases the global lease for expiry recovery", async () => {
  const { calls, services } = fake({ claim: async () => { calls.claim += 1; throw new Error("claim failed"); } });
  await assert.rejects(processOneQueuedAdviserJob(services), /claim failed/);
  assert.equal(calls.generate, 0);
  assert.equal(calls.release, 1);
});

test("a gate closed after claim avoids generation and releases the global lease", async () => {
  let checks = 0;
  const { calls, services } = fake({ enabled: () => ++checks === 1 });
  assert.deepEqual(await processOneQueuedAdviserJob(services), { status: "disabled" });
  assert.equal(calls.generate, 0);
  assert.equal(calls.pause, 1);
  assert.equal(calls.release, 1);
});

test("a gate closed while preparing a claimed job pauses without calling the provider", async () => {
  const { calls, services } = fake({ generate: async () => { calls.generate += 1; throw new AdviserQueueGateClosedError(); } });
  assert.deepEqual(await processOneQueuedAdviserJob(services), { status: "disabled" });
  assert.equal(calls.retry, 0);
  assert.equal(calls.pause, 1);
  assert.equal(calls.release, 1);
});
