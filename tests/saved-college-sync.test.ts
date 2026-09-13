import assert from "node:assert/strict";
import test from "node:test";

import {
  SavedCollegeMutationQueue,
  sanitizeSavedCollegeMutations,
  syncSavedCollegeMutations,
  type SavedCollegeRemoteStore,
} from "../app/lib/saved-college-sync.ts";
import {
  writeSavedCollegeMutation,
} from "../app/lib/saved-college-storage.ts";
import type { SavedCollegeStorage } from "../app/lib/local-saves.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, reject, resolve };
}

function createRemote(overrides: Partial<SavedCollegeRemoteStore> = {}) {
  const calls: Array<
    | { operation: "list"; userId: string }
    | { operation: "remove" | "upsert"; unitIds: number[]; userId: string }
  > = [];
  const remote: SavedCollegeRemoteStore = {
    async listOwned(userId) {
      calls.push({ operation: "list", userId });
      return [];
    },
    async removeOwned(userId, unitIds) {
      calls.push({ operation: "remove", unitIds: [...unitIds], userId });
    },
    async upsertOwned(userId, unitIds) {
      calls.push({ operation: "upsert", unitIds: [...unitIds], userId });
    },
    ...overrides,
  };
  return { calls, remote };
}

test("mutation sanitization keeps the last intent and drops unknown colleges", () => {
  const knownIds = new Set([101, 202]);

  assert.deepEqual(
    sanitizeSavedCollegeMutations(
      [
        { action: "save", unitId: 101 },
        { action: "remove", unitId: 101 },
        { action: "remove", unitId: 999 },
        { action: "save", unitId: 202 },
      ],
      knownIds,
    ),
    [
      { action: "remove", unitId: 101 },
      { action: "save", unitId: 202 },
    ],
  );
});

test("remote state is authoritative before local actions are applied", async () => {
  const knownIds = new Set([101, 202, 303, 404]);
  const { calls, remote } = createRemote();

  const result = await syncSavedCollegeMutations({
    knownIds,
    mutations: [
      { action: "remove", unitId: 101 },
      { action: "save", unitId: 303 },
      { action: "save", unitId: 999 },
    ],
    remote,
    syncedIds: [101, 202, 999],
    userId: USER_ID,
  });

  assert.deepEqual(calls, [
    { operation: "upsert", unitIds: [303], userId: USER_ID },
    { operation: "remove", unitIds: [101], userId: USER_ID },
  ]);
  assert.deepEqual(result, {
    removedIds: [101],
    savedIds: [303],
    syncedIds: [202, 303],
  });
});

test("duplicate add/remove actions collapse into idempotent final operations", async () => {
  const knownIds = new Set([101, 202, 303]);
  const { calls, remote } = createRemote();

  const result = await syncSavedCollegeMutations({
    knownIds,
    mutations: [
      { action: "save", unitId: 101 },
      { action: "save", unitId: 101 },
      { action: "save", unitId: 202 },
      { action: "remove", unitId: 202 },
      { action: "remove", unitId: 202 },
      { action: "remove", unitId: 303 },
      { action: "save", unitId: 303 },
    ],
    remote,
    syncedIds: [202],
    userId: USER_ID,
  });

  assert.deepEqual(calls, [
    { operation: "upsert", unitIds: [101, 303], userId: USER_ID },
    { operation: "remove", unitIds: [202], userId: USER_ID },
  ]);
  assert.deepEqual(result.syncedIds, [101, 303]);
});

test("sync rejects a non-UUID owner before any remote request", async () => {
  const { calls, remote } = createRemote();

  await assert.rejects(
    syncSavedCollegeMutations({
      knownIds: new Set([101]),
      mutations: [{ action: "save", unitId: 101 }],
      remote,
      syncedIds: [],
      userId: "not-a-verified-uuid",
    }),
    /valid verified user ID/i,
  );
  assert.deepEqual(calls, []);
});

test("save-remove-save during an in-flight save preserves the final save", async () => {
  const knownIds = new Set([101]);
  const firstRequest = deferred<void>();
  const upserts: number[][] = [];
  const removes: number[][] = [];
  const remote: SavedCollegeRemoteStore = {
    async listOwned() {
      return [];
    },
    async removeOwned(_userId, unitIds) {
      removes.push([...unitIds]);
    },
    async upsertOwned(_userId, unitIds) {
      upserts.push([...unitIds]);
      if (upserts.length === 1) await firstRequest.promise;
    },
  };
  const queue = new SavedCollegeMutationQueue({
    knownIds,
    remote,
    syncedIds: [],
    userId: USER_ID,
  });

  queue.enqueue({ action: "save", unitId: 101 });
  const flush = queue.flush();
  await Promise.resolve();
  queue.enqueue({ action: "remove", unitId: 101 });
  queue.enqueue({ action: "save", unitId: 101 });

  assert.deepEqual(queue.displayIds, [101]);
  assert.deepEqual(queue.pendingMutations, [{ action: "save", unitId: 101 }]);
  firstRequest.resolve();
  const result = await flush;

  assert.deepEqual(upserts, [[101]]);
  assert.deepEqual(removes, []);
  assert.deepEqual(result.syncedIds, [101]);
  assert.deepEqual(queue.syncedIds, [101]);
  assert.equal(queue.pendingCount, 0);
});

test("a failed remote write retains the local intent for a safe retry", async () => {
  let shouldFail = true;
  const remote: SavedCollegeRemoteStore = {
    async listOwned() {
      return [];
    },
    async removeOwned() {},
    async upsertOwned() {
      if (shouldFail) throw new Error("offline");
    },
  };
  const queue = new SavedCollegeMutationQueue({
    knownIds: new Set([101]),
    remote,
    syncedIds: [],
    userId: USER_ID,
  });
  queue.enqueue({ action: "save", unitId: 101 });

  await assert.rejects(queue.flush(), /offline/);
  assert.deepEqual(queue.displayIds, [101]);
  assert.deepEqual(queue.syncedIds, []);
  assert.deepEqual(queue.pendingMutations, [{ action: "save", unitId: 101 }]);

  shouldFail = false;
  await queue.flush();
  assert.deepEqual(queue.syncedIds, [101]);
  assert.equal(queue.pendingCount, 0);
});

test("enqueue starts no network work, allowing the outbox to persist before flush", async () => {
  const events: string[] = [];
  const storage: SavedCollegeStorage = {
    getItem() {
      return null;
    },
    removeItem() {},
    setItem() {
      events.push("outbox persisted");
    },
  };
  const remote: SavedCollegeRemoteStore = {
    async listOwned() {
      return [];
    },
    async removeOwned() {},
    async upsertOwned() {
      events.push("remote upsert");
    },
  };
  const knownIds = new Set([101]);
  const mutation = { action: "save" as const, unitId: 101 };
  const queue = new SavedCollegeMutationQueue({
    knownIds,
    remote,
    syncedIds: [],
    userId: USER_ID,
  });

  queue.enqueue(mutation);
  assert.deepEqual(events, [], "enqueue itself never starts a request");
  assert.deepEqual(
    writeSavedCollegeMutation(USER_ID, mutation, knownIds, storage),
    { persisted: true, storageAvailable: true },
  );
  await queue.flush();

  assert.deepEqual(events, ["outbox persisted", "remote upsert"]);
});

test("a failed commit acknowledgement retains the operation for idempotent retry", async () => {
  const upserts: number[][] = [];
  let failAcknowledgement = true;
  let acknowledgementCalls = 0;
  const remote: SavedCollegeRemoteStore = {
    async listOwned() {
      return [];
    },
    async removeOwned() {},
    async upsertOwned(_userId, unitIds) {
      upserts.push([...unitIds]);
    },
  };
  const queue = new SavedCollegeMutationQueue({
    knownIds: new Set([101]),
    onBatchCommitted() {
      acknowledgementCalls += 1;
      if (failAcknowledgement) throw new Error("cache write blocked");
    },
    pendingMutations: [{ action: "save", unitId: 101 }],
    remote,
    syncedIds: [],
    userId: USER_ID,
  });

  await assert.rejects(queue.flush(), /cache write blocked/);
  assert.deepEqual(queue.syncedIds, [101], "remote success remains authoritative");
  assert.deepEqual(queue.pendingMutations, [{ action: "save", unitId: 101 }]);

  failAcknowledgement = false;
  await queue.flush();
  assert.deepEqual(upserts, [[101], [101]], "retry uses an idempotent upsert");
  assert.equal(acknowledgementCalls, 2);
  assert.equal(queue.pendingCount, 0);
  assert.deepEqual(queue.syncedIds, [101]);
});

test("a partial save-then-remove failure retries the complete idempotent batch", async () => {
  const calls: Array<{ operation: "remove" | "upsert"; unitIds: number[] }> = [];
  let removeAttempts = 0;
  const remote: SavedCollegeRemoteStore = {
    async listOwned() {
      return [];
    },
    async removeOwned(_userId, unitIds) {
      calls.push({ operation: "remove", unitIds: [...unitIds] });
      removeAttempts += 1;
      if (removeAttempts === 1) throw new Error("remove request interrupted");
    },
    async upsertOwned(_userId, unitIds) {
      calls.push({ operation: "upsert", unitIds: [...unitIds] });
    },
  };
  const queue = new SavedCollegeMutationQueue({
    knownIds: new Set([101, 202]),
    pendingMutations: [
      { action: "save", unitId: 101 },
      { action: "remove", unitId: 202 },
    ],
    remote,
    syncedIds: [202],
    userId: USER_ID,
  });

  await assert.rejects(queue.flush(), /remove request interrupted/);
  assert.deepEqual(queue.syncedIds, [202]);
  assert.deepEqual(queue.displayIds, [101]);
  assert.deepEqual(queue.pendingMutations, [
    { action: "save", unitId: 101 },
    { action: "remove", unitId: 202 },
  ]);

  await queue.flush();
  assert.deepEqual(calls, [
    { operation: "upsert", unitIds: [101] },
    { operation: "remove", unitIds: [202] },
    { operation: "upsert", unitIds: [101] },
    { operation: "remove", unitIds: [202] },
  ]);
  assert.deepEqual(queue.syncedIds, [101]);
  assert.equal(queue.pendingCount, 0);
});
