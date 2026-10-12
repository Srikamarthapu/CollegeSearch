import assert from "node:assert/strict";
import test from "node:test";
import { AdviserApiError, AdviserSessionVerificationError, canRetryAdviserVerification, classifyPollError, copyPendingJobForRetry, createPollLoop, isAdviserAuthIssueForUser, isCurrentPendingRequest, reconcilePendingHistory, shouldRestoreMissingRequest } from "../app/lib/adviser/polling.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("visibility changes cannot start a second status read while one is in flight", async () => {
  const visible = true;
  let nextTimer = 0;
  let polls = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const pending = deferred<boolean>();
  const loop = createPollLoop(async () => { polls += 1; return await pending.promise; }, {
    isVisible: () => visible,
    setTimer: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (timer) => { timers.delete(timer as unknown as number); },
  });

  loop.start();
  assert.equal(timers.size, 1);
  const firstTimer = timers.values().next().value!;
  timers.clear();
  firstTimer.callback();
  await Promise.resolve();
  assert.equal(polls, 1);

  loop.visibilityChanged();
  loop.visibilityChanged();
  assert.equal(timers.size, 0);
  assert.equal(polls, 1);

  pending.resolve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.size, 1);
  assert.equal(timers.values().next().value?.delay, 1800);
  loop.stop();
  assert.equal(timers.size, 0);
});

test("hidden pages pause scheduled reads and resume with a single timer", () => {
  let visible = true;
  let nextTimer = 0;
  const timers = new Map<number, () => void>();
  const loop = createPollLoop(async () => true, {
    isVisible: () => visible,
    setTimer: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimer: (timer) => { timers.delete(timer as unknown as number); },
  });
  loop.start();
  visible = false;
  loop.visibilityChanged();
  assert.equal(timers.size, 0);
  visible = true;
  loop.visibilityChanged();
  assert.equal(timers.size, 1);
  loop.stop();
});

test("poll errors stop on auth and missing requests but retry transient failures only", () => {
  assert.equal(classifyPollError(new AdviserApiError(401, "Sign in again.")), "unauthorized");
  assert.equal(classifyPollError(new AdviserSessionVerificationError()), "verify-session");
  assert.equal(classifyPollError(new AdviserApiError(404, "Request unavailable.")), "missing");
  assert.equal(classifyPollError(new AdviserApiError(400, "Invalid request.")), "rejected");
  assert.equal(classifyPollError(new AdviserApiError(429, "Rate limited.")), "retry");
  assert.equal(classifyPollError(new AdviserApiError(503, "Unavailable.")), "retry");
  assert.equal(classifyPollError(new TypeError("Network offline")), "retry");
});

test("history reconciliation clears only the pending request and revision it observed", () => {
  const first = { requestId: "request-a", status: "queued" };
  assert.deepEqual(reconcilePendingHistory({
    current: first,
    incoming: null,
    revisionAtStart: 4,
    currentRevision: 4,
    requestIdAtStart: "request-a",
  }), { value: first, applied: false });
  assert.deepEqual(reconcilePendingHistory({
    current: first,
    incoming: null,
    revisionAtStart: 4,
    currentRevision: 4,
    requestIdAtStart: "request-a",
    clearMissingRequest: true,
  }), { value: null, applied: true });

  const newer = { requestId: "request-b", status: "queued" };
  assert.deepEqual(reconcilePendingHistory({
    current: newer,
    incoming: null,
    revisionAtStart: 4,
    currentRevision: 5,
    requestIdAtStart: "request-a",
  }), { value: newer, applied: false });
  assert.deepEqual(reconcilePendingHistory({
    current: newer,
    incoming: first,
    revisionAtStart: 4,
    currentRevision: 4,
    requestIdAtStart: "request-a",
  }), { value: newer, applied: false });
});

test("a missing request draft is restored only when its own history refresh clears it", () => {
  const clearedByThisRefresh = {
    requestId: "request-a",
    responseRequestId: null,
    requestIdAtStart: "request-a",
    requestIdAfterResponse: null,
    revisionAtStart: 8,
    revisionAfterResponse: 9,
    currentRequestId: null,
    currentRevision: 9,
    applied: true,
  };
  assert.equal(shouldRestoreMissingRequest(clearedByThisRefresh), true);
  assert.equal(shouldRestoreMissingRequest({ ...clearedByThisRefresh, currentRequestId: "request-b" }), false);
  assert.equal(shouldRestoreMissingRequest({ ...clearedByThisRefresh, currentRevision: 10 }), false);
  assert.equal(shouldRestoreMissingRequest({ ...clearedByThisRefresh, applied: false }), false);
  assert.equal(shouldRestoreMissingRequest({ ...clearedByThisRefresh, responseRequestId: "request-b" }), false);

  assert.equal(isCurrentPendingRequest({
    requestId: "request-a", revisionAtStart: 8, currentRequestId: "request-a", currentRevision: 8,
  }), true);
  assert.equal(isCurrentPendingRequest({
    requestId: "request-a", revisionAtStart: 8, currentRequestId: "request-b", currentRevision: 9,
  }), false);
});

test("verification pauses are scoped to the owning user and retry preserves the pending message", () => {
  const issue = { userId: "user-a", kind: "unauthorized" as const, message: "Sign in again." };
  assert.equal(isAdviserAuthIssueForUser(issue, "user-a"), true);
  assert.equal(isAdviserAuthIssueForUser(issue, "user-b"), false);
  assert.equal(canRetryAdviserVerification(issue, "user-a"), false);

  const verificationIssue = { userId: "user-a", kind: "verification" as const, message: "Retry verification." };
  assert.equal(isAdviserAuthIssueForUser(verificationIssue, "user-a"), true);
  assert.equal(isAdviserAuthIssueForUser(verificationIssue, "user-b"), false);
  assert.equal(canRetryAdviserVerification(verificationIssue, "user-a"), true);
  assert.equal(canRetryAdviserVerification(verificationIssue, "user-b"), false);

  const pending = { requestId: "request-a", conversationId: "conversation-a", message: "Keep this draft while verification is retried.", status: "queued" as const };
  const retried = copyPendingJobForRetry(pending);
  assert.notEqual(retried, pending);
  assert.deepEqual(retried, pending);
  assert.equal(copyPendingJobForRetry(null), null);
});

test("history reconciliation adopts a newer server job and respects local deletion suppression", () => {
  const incoming = { requestId: "request-b", status: "running" };
  assert.deepEqual(reconcilePendingHistory({
    current: null,
    incoming,
    revisionAtStart: 2,
    currentRevision: 2,
    requestIdAtStart: null,
  }), { value: incoming, applied: true });
  assert.deepEqual(reconcilePendingHistory({
    current: null,
    incoming,
    revisionAtStart: 2,
    currentRevision: 2,
    requestIdAtStart: null,
    isSuppressed: (requestId) => requestId === incoming.requestId,
  }), { value: null, applied: false });
});
