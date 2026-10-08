import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_SAVED_COLLEGES_STORAGE_KEY,
  SAVED_COLLEGES_STORAGE_KEY,
  readSavedCollegeIds,
  sanitizeSavedCollegeIds,
  subscribeToSavedCollegeChanges,
  writeSavedCollegeIds,
  type SavedCollegeStorage,
} from "../app/lib/local-saves.ts";

class MemoryStorage implements SavedCollegeStorage {
  values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string) {
    if (this.failReads) throw new Error("blocked");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("blocked");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("saved college IDs are positive, unique integers from the known release", () => {
  const knownIds = new Set([110635, 243744]);

  assert.deepEqual(
    sanitizeSavedCollegeIds(
      [110635, 110635, -1, 1.5, "243744", 243744, 999999],
      knownIds,
    ),
    [110635, 243744],
  );
  assert.deepEqual(sanitizeSavedCollegeIds({ ids: [110635] }, knownIds), []);
});

test("reads the canonical list first and safely falls back to the legacy key", () => {
  const storage = new MemoryStorage();
  const knownIds = new Set([110635, 243744]);
  storage.values.set(
    LEGACY_SAVED_COLLEGES_STORAGE_KEY,
    JSON.stringify([243744, 999999]),
  );

  assert.deepEqual(readSavedCollegeIds(knownIds, storage), {
    ids: [243744],
    storageAvailable: true,
  });

  storage.values.set(SAVED_COLLEGES_STORAGE_KEY, JSON.stringify([]));
  assert.deepEqual(readSavedCollegeIds(knownIds, storage).ids, []);
});

test("blocked or malformed storage never crashes the save flow", () => {
  const storage = new MemoryStorage();
  storage.values.set(SAVED_COLLEGES_STORAGE_KEY, "not-json");
  assert.deepEqual(readSavedCollegeIds(undefined, storage), {
    ids: [],
    storageAvailable: true,
  });
  assert.equal(storage.values.has(SAVED_COLLEGES_STORAGE_KEY), false);

  storage.failReads = true;
  assert.deepEqual(readSavedCollegeIds(undefined, storage), {
    ids: [],
    storageAvailable: false,
  });

  storage.failReads = false;
  storage.failWrites = true;
  assert.deepEqual(writeSavedCollegeIds([110635], undefined, storage), {
    ids: [110635],
    storageAvailable: false,
    persisted: false,
  });
});

test("writes migrate the legacy key and notify same-tab and other-tab listeners", () => {
  const storage = new MemoryStorage();
  storage.values.set(LEGACY_SAVED_COLLEGES_STORAGE_KEY, "[243744]");
  const eventTarget = new EventTarget();
  const fakeWindow = Object.assign(eventTarget, { localStorage: storage });
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });

  try {
    const updates: number[][] = [];
    const unsubscribe = subscribeToSavedCollegeChanges((result) => {
      updates.push(result.ids);
    });

    const written = writeSavedCollegeIds([110635, 110635, -2]);
    assert.deepEqual(written, {
      ids: [110635],
      storageAvailable: true,
      persisted: true,
    });
    assert.equal(storage.values.get(SAVED_COLLEGES_STORAGE_KEY), "[110635]");
    assert.equal(storage.values.has(LEGACY_SAVED_COLLEGES_STORAGE_KEY), false);
    assert.deepEqual(updates, [[110635]], "custom event updates this tab");

    storage.values.set(SAVED_COLLEGES_STORAGE_KEY, "[243744]");
    const storageEvent = new Event("storage");
    Object.defineProperty(storageEvent, "key", {
      value: SAVED_COLLEGES_STORAGE_KEY,
    });
    fakeWindow.dispatchEvent(storageEvent);
    assert.deepEqual(updates, [[110635], [243744]], "storage event updates other tabs");

    unsubscribe();
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
