import assert from "node:assert/strict";
import test from "node:test";

import {
  SavedCollegeAccountCycleError,
  syncSavedCollegeAccountCycle,
} from "../app/lib/saved-college-account-cycle.ts";
import type { SavedCollegeLockManager } from "../app/lib/saved-college-lock.ts";
import type { SavedCollegeRemoteStore } from "../app/lib/saved-college-sync.ts";
import {
  readSavedCollegeOutbox,
  savedCollegeUserCacheKey,
  savedCollegeUserMutationKey,
  writeSavedCollegeMutation,
} from "../app/lib/saved-college-storage.ts";
import type { SavedCollegeStorage } from "../app/lib/local-saves.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const knownIds = new Set([101, 202]);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

class MemoryStorage implements SavedCollegeStorage {
  readonly values = new Map<string, string>();
  failCacheWrites = false;
  failMutationRemoves = false;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    if (
      this.failMutationRemoves &&
      key.startsWith("college-search-saved-user-outbox:")
    ) {
      throw new Error("mutation removal blocked");
    }
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    if (
      this.failCacheWrites &&
      key.startsWith("college-search-saved-user-cache:")
    ) {
      throw new Error("cache write blocked");
    }
    this.values.set(key, value);
  }
}

class SerialLockManager implements SavedCollegeLockManager {
  #tails = new Map<string, Promise<unknown>>();

  request<T>(
    name: string,
    _options: { mode: "exclusive" },
    callback: () => Promise<T> | T,
  ) {
    const prior = this.#tails.get(name) ?? Promise.resolve();
    const next = prior.then(callback, callback);
    this.#tails.set(name, next.catch(() => undefined));
    return next;
  }
}

function mutableRemote(initialIds: readonly number[] = []) {
  const ids = new Set(initialIds);
  const calls: string[] = [];
  const remote: SavedCollegeRemoteStore = {
    async listOwned() {
      calls.push("list");
      return [...ids];
    },
    async removeOwned(_userId, unitIds) {
      calls.push(`remove:${unitIds.join(",")}`);
      unitIds.forEach((unitId) => ids.delete(unitId));
    },
    async upsertOwned(_userId, unitIds) {
      calls.push(`upsert:${unitIds.join(",")}`);
      unitIds.forEach((unitId) => ids.add(unitId));
    },
  };
  return { calls, ids, remote };
}

test("two tabs serialize the same unit and preserve the newer intent", async () => {
  const storage = new MemoryStorage();
  const lockManager = new SerialLockManager();
  const firstWriteStarted = deferred<void>();
  const releaseFirstWrite = deferred<void>();
  const remoteIds = new Set<number>();
  const events: string[] = [];
  let upsertCount = 0;
  const remote: SavedCollegeRemoteStore = {
    async listOwned() {
      events.push(`list:${[...remoteIds].join(",")}`);
      return [...remoteIds];
    },
    async removeOwned(_userId, unitIds) {
      events.push(`remove:${unitIds.join(",")}`);
      unitIds.forEach((unitId) => remoteIds.delete(unitId));
    },
    async upsertOwned(_userId, unitIds) {
      upsertCount += 1;
      events.push(`upsert:start:${unitIds.join(",")}`);
      if (upsertCount === 1) {
        firstWriteStarted.resolve();
        await releaseFirstWrite.promise;
      }
      unitIds.forEach((unitId) => remoteIds.add(unitId));
      events.push(`upsert:end:${unitIds.join(",")}`);
    },
  };

  assert.equal(
    writeSavedCollegeMutation(
      USER_ID,
      { action: "save", unitId: 101 },
      knownIds,
      storage,
    ).persisted,
    true,
  );
  const first = syncSavedCollegeAccountCycle({
    knownIds,
    lockManager,
    remote,
    storage,
    userId: USER_ID,
  });
  await firstWriteStarted.promise;

  // Tab B replaces the same per-unit record while tab A's idempotent save is
  // in flight, then waits for the same account lock.
  assert.equal(
    writeSavedCollegeMutation(
      USER_ID,
      { action: "remove", unitId: 101 },
      knownIds,
      storage,
    ).persisted,
    true,
  );
  const second = syncSavedCollegeAccountCycle({
    knownIds,
    lockManager,
    remote,
    storage,
    userId: USER_ID,
  });
  releaseFirstWrite.resolve();

  const firstResult = await first;
  assert.deepEqual(firstResult.syncedIds, [101]);
  assert.deepEqual(firstResult.displayIds, []);
  assert.deepEqual(firstResult.remainingMutations, [
    { action: "remove", unitId: 101 },
  ]);
  assert.equal(firstResult.settled, false);

  const secondResult = await second;
  assert.deepEqual(secondResult.syncedIds, []);
  assert.deepEqual(secondResult.displayIds, []);
  assert.deepEqual(secondResult.remainingMutations, []);
  assert.equal(secondResult.settled, true);
  assert.deepEqual([...remoteIds], []);
  assert.deepEqual(events, [
    "list:",
    "upsert:start:101",
    "upsert:end:101",
    "list:101",
    "remove:101",
  ]);
});

test("an invalid outbox stops before every network and cache operation", async () => {
  const storage = new MemoryStorage();
  const { calls, remote } = mutableRemote([101]);
  storage.values.set(savedCollegeUserMutationKey(USER_ID, 101), "not-json");

  await assert.rejects(
    syncSavedCollegeAccountCycle({
      knownIds,
      lockManager: new SerialLockManager(),
      remote,
      storage,
      userId: USER_ID,
    }),
    (error: unknown) => {
      assert.ok(error instanceof SavedCollegeAccountCycleError);
      assert.equal(error.stage, "outbox-read");
      assert.equal(error.remoteReadSucceeded, false);
      assert.equal(error.storageAvailable, true);
      return true;
    },
  );

  assert.deepEqual(calls, []);
  assert.equal(storage.values.has(savedCollegeUserCacheKey(USER_ID)), false);
  assert.equal(
    storage.values.get(savedCollegeUserMutationKey(USER_ID, 101)),
    "not-json",
  );
});

test("cache and acknowledgement failures retain exact pending records", async (t) => {
  await t.test("cache failure retains the pending record", async () => {
    const storage = new MemoryStorage();
    const { ids, remote } = mutableRemote();
    writeSavedCollegeMutation(
      USER_ID,
      { action: "save", unitId: 101 },
      knownIds,
      storage,
    );
    storage.failCacheWrites = true;

    await assert.rejects(
      syncSavedCollegeAccountCycle({
        knownIds,
        lockManager: new SerialLockManager(),
        remote,
        storage,
        userId: USER_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SavedCollegeAccountCycleError);
        assert.equal(error.stage, "cache-write");
        assert.equal(error.remoteReadSucceeded, true);
        assert.equal(error.storageAvailable, false);
        return true;
      },
    );

    assert.deepEqual([...ids], [101], "remote operation remains idempotently applied");
    assert.deepEqual(
      readSavedCollegeOutbox(USER_ID, knownIds, storage).mutations,
      [{ action: "save", unitId: 101 }],
    );
  });

  await t.test("ack failure retains the pending record", async () => {
    const storage = new MemoryStorage();
    const { ids, remote } = mutableRemote();
    writeSavedCollegeMutation(
      USER_ID,
      { action: "save", unitId: 101 },
      knownIds,
      storage,
    );
    storage.failMutationRemoves = true;

    await assert.rejects(
      syncSavedCollegeAccountCycle({
        knownIds,
        lockManager: new SerialLockManager(),
        remote,
        storage,
        userId: USER_ID,
      }),
      (error: unknown) => {
        assert.ok(error instanceof SavedCollegeAccountCycleError);
        assert.equal(error.stage, "outbox-ack");
        assert.equal(error.remoteReadSucceeded, true);
        assert.equal(error.storageAvailable, false);
        return true;
      },
    );

    assert.deepEqual([...ids], [101]);
    assert.deepEqual(
      readSavedCollegeOutbox(USER_ID, knownIds, storage).mutations,
      [{ action: "save", unitId: 101 }],
    );
  });
});

test("a no-op authoritative read still persists the complete account cache", async () => {
  const storage = new MemoryStorage();
  const { calls, remote } = mutableRemote([101]);
  const stages: string[] = [];
  const snapshots: unknown[] = [];

  const result = await syncSavedCollegeAccountCycle({
    knownIds,
    lockManager: new SerialLockManager(),
    onRemoteSnapshot(snapshot) {
      snapshots.push(snapshot);
    },
    onStage(event) {
      stages.push(
        `${event.stage}:${event.status}:${event.remoteReadSucceeded}`,
      );
    },
    remote,
    storage,
    userId: USER_ID.toUpperCase(),
  });

  assert.deepEqual(calls, ["list"]);
  assert.deepEqual(result.syncedIds, [101]);
  assert.deepEqual(result.displayIds, [101]);
  assert.deepEqual(result.processedMutations, []);
  assert.deepEqual(result.remainingMutations, []);
  assert.equal(result.remoteReadSucceeded, true);
  assert.equal(result.settled, true);
  assert.equal(storage.values.get(savedCollegeUserCacheKey(USER_ID)), "[101]");
  assert.ok(stages.includes("remote-read:succeeded:true"));
  assert.ok(stages.includes("cache-write:succeeded:true"));
  assert.deepEqual(snapshots, [
    {
      displayIds: [101],
      pendingMutations: [],
      syncedIds: [101],
    },
  ]);
});
