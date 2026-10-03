import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_SAVED_COLLEGES_STORAGE_KEY,
  SAVED_COLLEGES_STORAGE_KEY,
  type SavedCollegeStorage,
} from "../app/lib/local-saves.ts";
import {
  applySavedCollegeOutbox,
  clearSavedCollegeMutationIfSatisfied,
  clearSavedCollegeIdsAtKey,
  readGuestSavedCollegeIds,
  readSavedCollegeIdsAtKey,
  readSavedCollegeOutbox,
  savedCollegeUserCacheKey,
  savedCollegeUserOutboxKey,
  savedCollegeUserMutationKey,
  writeSavedCollegeIdsAtKey,
  writeSavedCollegeMutation,
  writeSavedCollegeOutbox,
} from "../app/lib/saved-college-storage.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

class MemoryStorage implements SavedCollegeStorage {
  values = new Map<string, string>();
  failReads = false;
  failReadKeys = new Set<string>();
  failRemoves = false;
  failWrites = false;
  failWriteKeys = new Set<string>();
  operations: Array<{ key: string; operation: "get" | "remove" | "set" }> = [];

  getItem(key: string) {
    this.operations.push({ key, operation: "get" });
    if (this.failReads || this.failReadKeys.has(key)) {
      throw new Error("read blocked");
    }
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.operations.push({ key, operation: "set" });
    if (this.failWrites || this.failWriteKeys.has(key)) {
      throw new Error("write blocked");
    }
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.operations.push({ key, operation: "remove" });
    if (this.failRemoves) throw new Error("remove blocked");
    this.values.delete(key);
  }
}

test("guest saves, user caches, and user outboxes remain isolated by key", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101, 202, 303]);
  const cacheA = savedCollegeUserCacheKey(USER_A);
  const cacheB = savedCollegeUserCacheKey(USER_B);
  const outboxA = savedCollegeUserOutboxKey(USER_A);
  const outboxB = savedCollegeUserOutboxKey(USER_B);

  assert.equal(
    savedCollegeUserCacheKey(USER_A.toUpperCase()),
    cacheA,
    "scoped UUID keys have one canonical representation",
  );
  assert.equal(new Set([SAVED_COLLEGES_STORAGE_KEY, cacheA, cacheB, outboxA, outboxB]).size, 5);

  writeSavedCollegeIdsAtKey(SAVED_COLLEGES_STORAGE_KEY, [303], knownIds, storage);
  writeSavedCollegeIdsAtKey(cacheA, [101], knownIds, storage);
  writeSavedCollegeIdsAtKey(cacheB, [202], knownIds, storage);
  writeSavedCollegeOutbox(USER_A, [{ action: "remove", unitId: 101 }], knownIds, storage);
  writeSavedCollegeOutbox(USER_B, [{ action: "save", unitId: 303 }], knownIds, storage);

  assert.deepEqual(readGuestSavedCollegeIds(knownIds, storage).ids, [303]);
  assert.deepEqual(readSavedCollegeIdsAtKey(cacheA, knownIds, storage).ids, [101]);
  assert.deepEqual(readSavedCollegeIdsAtKey(cacheB, knownIds, storage).ids, [202]);
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage).mutations, [
    { action: "remove", unitId: 101 },
  ]);
  assert.deepEqual(readSavedCollegeOutbox(USER_B, knownIds, storage).mutations, [
    { action: "save", unitId: 303 },
  ]);
});

test("guest reads preserve the legacy College Compass save key", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101, 202]);
  storage.values.set(
    LEGACY_SAVED_COLLEGES_STORAGE_KEY,
    JSON.stringify([101, 999]),
  );

  assert.deepEqual(readGuestSavedCollegeIds(knownIds, storage), {
    ids: [101],
    storageAvailable: true,
  });

  storage.values.set(SAVED_COLLEGES_STORAGE_KEY, JSON.stringify([202]));
  assert.deepEqual(
    readGuestSavedCollegeIds(knownIds, storage).ids,
    [202],
    "the canonical CollegeSearch key takes precedence after migration",
  );
});

test("account cache reports missing, valid-empty, valid, corrupt, and unavailable separately", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101, 202]);
  const cacheKey = savedCollegeUserCacheKey(USER_A);

  assert.deepEqual(readSavedCollegeIdsAtKey(cacheKey, knownIds, null), {
    ids: [],
    present: false,
    storageAvailable: false,
    valid: false,
  });
  assert.deepEqual(readSavedCollegeIdsAtKey(cacheKey, knownIds, storage), {
    ids: [],
    present: false,
    storageAvailable: true,
    valid: true,
  });

  storage.values.set(cacheKey, "[]");
  assert.deepEqual(readSavedCollegeIdsAtKey(cacheKey, knownIds, storage), {
    ids: [],
    present: true,
    storageAvailable: true,
    valid: true,
  });

  storage.values.set(cacheKey, JSON.stringify([101, 999, 202]));
  assert.deepEqual(readSavedCollegeIdsAtKey(cacheKey, knownIds, storage), {
    ids: [101, 202],
    present: true,
    storageAvailable: true,
    valid: true,
  });

  for (const corruptValue of ["not-json", JSON.stringify({ ids: [101] })]) {
    storage.values.set(cacheKey, corruptValue);
    assert.deepEqual(readSavedCollegeIdsAtKey(cacheKey, knownIds, storage), {
      ids: [],
      present: true,
      storageAvailable: true,
      valid: false,
    });
  }

  storage.failReadKeys.add(cacheKey);
  assert.deepEqual(readSavedCollegeIdsAtKey(cacheKey, knownIds, storage), {
    ids: [],
    present: false,
    storageAvailable: false,
    valid: false,
  });
});

test("scoped storage rejects empty, malformed, nil, and non-RFC UUIDs", () => {
  const invalidIds = [
    "",
    "not-a-uuid",
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-4111-7111-111111111111",
    "11111111-1111-9111-8111-111111111111",
  ];

  for (const userId of invalidIds) {
    assert.throws(() => savedCollegeUserCacheKey(userId), /valid verified user ID/i);
    assert.throws(() => savedCollegeUserOutboxKey(userId), /valid verified user ID/i);
  }
});

test("storage read, write, and remove failures are reported without throwing", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101]);
  const cacheKey = savedCollegeUserCacheKey(USER_A);

  storage.failReads = true;
  assert.deepEqual(readSavedCollegeIdsAtKey(cacheKey, knownIds, storage), {
    ids: [],
    present: false,
    storageAvailable: false,
    valid: false,
  });
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage), {
    mutations: [],
    present: false,
    storageAvailable: false,
    valid: false,
  });

  storage.failReads = false;
  storage.failWrites = true;
  assert.deepEqual(writeSavedCollegeIdsAtKey(cacheKey, [101], knownIds, storage), {
    ids: [101],
    persisted: false,
    storageAvailable: false,
  });
  assert.deepEqual(
    writeSavedCollegeOutbox(USER_A, [{ action: "save", unitId: 101 }], knownIds, storage),
    {
      mutations: [{ action: "save", unitId: 101 }],
      persisted: false,
      storageAvailable: false,
    },
  );

  storage.failWrites = false;
  storage.failRemoves = true;
  assert.equal(clearSavedCollegeIdsAtKey(cacheKey, storage), false);
  assert.deepEqual(writeSavedCollegeOutbox(USER_A, [], knownIds, storage), {
    mutations: [],
    persisted: true,
    storageAvailable: true,
  });
});

test("the outbox keeps only the latest valid intent for each known college", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101, 202]);
  const written = writeSavedCollegeOutbox(
    USER_A,
    [
      { action: "save", unitId: 101 },
      { action: "remove", unitId: 101 },
      { action: "save", unitId: 202 },
      { action: "save", unitId: 101 },
      { action: "remove", unitId: 999 },
    ],
    knownIds,
    storage,
  );

  assert.deepEqual(written, {
    mutations: [
      { action: "save", unitId: 101 },
      { action: "save", unitId: 202 },
    ],
    persisted: true,
    storageAvailable: true,
  });
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage), {
    mutations: written.mutations,
    present: true,
    storageAvailable: true,
    valid: true,
  });
});

test("outbox reads distinguish missing, corrupt, and unavailable records", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101, 202, 303]);
  const mutation101 = savedCollegeUserMutationKey(USER_A, 101);
  const mutation202 = savedCollegeUserMutationKey(USER_A, 202);
  const mutation303 = savedCollegeUserMutationKey(USER_A, 303);

  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage), {
    mutations: [],
    present: false,
    storageAvailable: true,
    valid: true,
  });

  storage.values.set(mutation101, JSON.stringify({ action: "save", version: 2 }));
  storage.values.set(mutation202, "not-json");
  storage.values.set(mutation303, JSON.stringify({ action: "remove", version: 1 }));
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage), {
    mutations: [{ action: "save", unitId: 101 }],
    present: true,
    storageAvailable: true,
    valid: false,
  });

  storage.failReadKeys.add(mutation202);
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage), {
    mutations: [],
    present: true,
    storageAvailable: false,
    valid: false,
  });
});

test("different tabs cannot overwrite pending intentions for other colleges", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101, 202]);

  writeSavedCollegeMutation(
    USER_A,
    { action: "save", unitId: 101 },
    knownIds,
    storage,
  );
  writeSavedCollegeMutation(
    USER_A,
    { action: "remove", unitId: 202 },
    knownIds,
    storage,
  );

  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage).mutations, [
    { action: "save", unitId: 101 },
    { action: "remove", unitId: 202 },
  ]);
  assert.notEqual(
    savedCollegeUserMutationKey(USER_A, 101),
    savedCollegeUserMutationKey(USER_A, 202),
  );

  writeSavedCollegeMutation(
    USER_A,
    { action: "remove", unitId: 101 },
    knownIds,
    storage,
  );
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage).mutations, [
    { action: "remove", unitId: 101 },
    { action: "remove", unitId: 202 },
  ]);
});

test("acknowledgement never clears a newer same-college intention", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101]);
  writeSavedCollegeMutation(
    USER_A,
    { action: "remove", unitId: 101 },
    knownIds,
    storage,
  );

  assert.deepEqual(
    clearSavedCollegeMutationIfSatisfied(
      USER_A,
      { action: "save", unitId: 101 },
      new Set([101]),
      storage,
    ),
    { cleared: true, storageAvailable: true },
  );
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage).mutations, [
    { action: "remove", unitId: 101 },
  ]);

  assert.deepEqual(
    clearSavedCollegeMutationIfSatisfied(
      USER_A,
      { action: "remove", unitId: 101 },
      new Set(),
      storage,
    ),
    { cleared: true, storageAvailable: true },
  );
  assert.deepEqual(readSavedCollegeOutbox(USER_A, knownIds, storage), {
    mutations: [],
    present: false,
    storageAvailable: true,
    valid: true,
  });
});

test("acknowledgement reports corrupt records without deleting them", () => {
  const storage = new MemoryStorage();
  const key = savedCollegeUserMutationKey(USER_A, 101);
  storage.values.set(key, JSON.stringify({ action: "invalid", version: 2 }));

  assert.deepEqual(
    clearSavedCollegeMutationIfSatisfied(
      USER_A,
      { action: "save", unitId: 101 },
      new Set([101]),
      storage,
    ),
    { cleared: false, storageAvailable: true },
  );
  assert.equal(storage.values.has(key), true);

  storage.values.set(key, "not-json");
  assert.deepEqual(
    clearSavedCollegeMutationIfSatisfied(
      USER_A,
      { action: "save", unitId: 101 },
      new Set([101]),
      storage,
    ),
    { cleared: false, storageAvailable: true },
  );
  assert.equal(storage.values.get(key), "not-json");
});

test("a pending mutation is synchronously durable before its writer returns", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([101]);
  const key = savedCollegeUserMutationKey(USER_A, 101);

  const result = writeSavedCollegeMutation(
    USER_A,
    { action: "save", unitId: 101 },
    knownIds,
    storage,
  );

  assert.deepEqual(result, { persisted: true, storageAvailable: true });
  assert.deepEqual(storage.operations, [{ key, operation: "set" }]);
  assert.equal(
    storage.values.get(key),
    JSON.stringify({ action: "save", version: 2 }),
  );
});

test("an offline remove remains a tombstone over a stale account cache", () => {
  const knownIds = new Set([101, 202, 303]);

  assert.deepEqual(
    applySavedCollegeOutbox(
      [101, 202],
      [
        { action: "remove", unitId: 101 },
        { action: "save", unitId: 303 },
      ],
      knownIds,
    ),
    [202, 303],
  );
  assert.deepEqual(
    applySavedCollegeOutbox(
      [101],
      [
        { action: "save", unitId: 101 },
        { action: "remove", unitId: 101 },
      ],
      knownIds,
    ),
    [],
    "the latest remove cannot be resurrected by a stale cached row",
  );
});
