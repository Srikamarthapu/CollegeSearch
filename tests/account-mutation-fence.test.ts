import assert from "node:assert/strict";
import test from "node:test";
import { createAccountMutationFence, guardAccountStorage } from "../app/lib/account-mutation-fence.ts";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("freezing blocks matching callbacks until unfreeze without authorizing guest or another account", () => {
  const fence = createAccountMutationFence(a, () => "active");
  assert.equal(fence.canWrite(a), true);
  assert.equal(fence.freeze(b), false);
  assert.equal(fence.freeze("guest"), false);
  assert.equal(fence.freeze(a), true);
  assert.equal(fence.canWrite(a), false);
  assert.equal(fence.isForgotten(a), false, "a failed deletion may resume with all original data");
  fence.activate(b);
  assert.equal(fence.canWrite(b), true);
  assert.equal(fence.unfreeze(a), true);
  assert.equal(fence.canWrite(a), false, "unfreeze must not restore the old owner over a new account");
  assert.equal(fence.canWrite(b), true);
});

test("confirmed forget blocks the exact account permanently and never invalidates the new owner", () => {
  const fence = createAccountMutationFence(a, () => "active");
  fence.freeze(a);
  assert.equal(fence.forget(a), true);
  fence.unfreeze(a);
  assert.equal(fence.canWrite(a), false);
  fence.activate(b);
  assert.equal(fence.forget(a), false);
  assert.equal(fence.canWrite(b), true);
  assert.equal(fence.isForgotten(b), false);
});

test("receipt read failures pause changes and are never treated as confirmed deletion", () => {
  let state: "active" | "deleted" | "unavailable" = "unavailable";
  const fence = createAccountMutationFence(a, () => state);
  assert.equal(fence.canWrite(a), false);
  assert.equal(fence.isForgotten(a), false);
  state = "active";
  assert.equal(fence.canWrite(a), true);
  state = "deleted";
  assert.equal(fence.canWrite(a), false);
  assert.equal(fence.isForgotten(a), true);
});

test("freezing while a remote write completes preserves outbox and prevents subsequent cache/ack writes", async () => {
  const { syncSavedCollegeAccountCycle } = await import("../app/lib/saved-college-account-cycle.ts");
  const { savedCollegeUserCacheKey, savedCollegeUserMutationKey } = await import("../app/lib/saved-college-storage.ts");
  const fence = createAccountMutationFence(a, () => "active");
  const records = new Map<string, string>([[savedCollegeUserMutationKey(a, 101), JSON.stringify({ version: 2, action: "save" })]]);
  const storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
  let remoteWrites = 0;
  await assert.rejects(syncSavedCollegeAccountCycle({
    userId: a, knownIds: new Set([101]), lockManager: { request: async (_name, _options, callback) => callback() },
    storage: guardAccountStorage(storage, () => fence.canWrite(a)),
    remote: { listOwned: async () => [101], removeOwned: async () => { remoteWrites += 1; }, upsertOwned: async () => { remoteWrites += 1; fence.freeze(a); } },
  }));
  assert.equal(remoteWrites, 1, "an already admitted remote operation can finish while controls are paused");
  assert.equal(records.has(savedCollegeUserCacheKey(a)), false);
  assert.equal(records.has(savedCollegeUserMutationKey(a, 101)), true);
  fence.unfreeze(a);
  await syncSavedCollegeAccountCycle({
    userId: a, knownIds: new Set([101]), lockManager: { request: async (_name, _options, callback) => callback() },
    storage: guardAccountStorage(storage, () => fence.canWrite(a)),
    remote: { listOwned: async () => [101], removeOwned: async () => {}, upsertOwned: async () => {} },
  });
  assert.equal(records.get(savedCollegeUserCacheKey(a)), "[101]");
  assert.equal(records.has(savedCollegeUserMutationKey(a, 101)), false);
});
