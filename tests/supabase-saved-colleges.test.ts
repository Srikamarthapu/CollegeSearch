import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseSavedCollegeStore, SavedCollegeSessionUnavailableError } from "../app/lib/supabase/saved-colleges.ts";
import { syncSavedCollegeAccountCycle, SavedCollegeAccountCycleError } from "../app/lib/saved-college-account-cycle.ts";
import { savedCollegeUserCacheKey, readSavedCollegeOutbox, writeSavedCollegeMutation } from "../app/lib/saved-college-storage.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

type RecordedCall = { args: unknown[]; method: string };

function createFakeClient({
  data = [],
  error = null,
  sessionChecks = [true],
}: {
  data?: Array<{ unit_id: number }>;
  error?: { message?: string } | null;
  sessionChecks?: Array<boolean | null | Error>;
} = {}) {
  const calls: RecordedCall[] = [];
  const response = { data, error };
  const then = <TResult1 = typeof response, TResult2 = never>(
    onfulfilled?: ((value: typeof response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise.resolve(response).then(onfulfilled, onrejected);
  const builder = {
    then,
    delete() {
      calls.push({ args: [], method: "delete" });
      return builder;
    },
    eq(...args: unknown[]) {
      calls.push({ args, method: "eq" });
      return builder;
    },
    in(...args: unknown[]) {
      calls.push({ args, method: "in" });
      return builder;
    },
    select(...args: unknown[]) {
      calls.push({ args, method: "select" });
      return builder;
    },
    upsert(...args: unknown[]) {
      calls.push({ args, method: "upsert" });
      return builder;
    },
  };
  const client = {
    async rpc(...args: unknown[]) {
      calls.push({ args, method: "rpc" });
      const result = sessionChecks.length > 1 ? sessionChecks.shift() : sessionChecks[0];
      return result instanceof Error ? { data: null, error: result } : { data: result, error: null };
    },
    from(...args: unknown[]) {
      calls.push({ args, method: "from" });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { calls, client };
}

test("listOwned selects only unit IDs and applies the exact owner filter", async () => {
  const { calls, client } = createFakeClient({
    data: [{ unit_id: 101 }, { unit_id: 202 }],
  });
  const store = createSupabaseSavedCollegeStore(client, USER_ID);

  assert.deepEqual(await store.listOwned(USER_ID), [101, 202]);
  assert.deepEqual(calls, [
    { args: ["account_session_active"], method: "rpc" },
    { args: ["saved_colleges"], method: "from" },
    { args: ["unit_id"], method: "select" },
    { args: ["user_id", USER_ID], method: "eq" },
    { args: ["account_session_active"], method: "rpc" },
  ]);
});

test("upsertOwned sends explicit owners and uses conflict-safe duplicate ignoring", async () => {
  const { calls, client } = createFakeClient();
  const store = createSupabaseSavedCollegeStore(client, USER_ID);

  await store.upsertOwned(USER_ID, [101, 202]);
  assert.deepEqual(calls, [
    { args: ["account_session_active"], method: "rpc" },
    { args: ["saved_colleges"], method: "from" },
    {
      args: [
        [
          { unit_id: 101, user_id: USER_ID },
          { unit_id: 202, user_id: USER_ID },
        ],
        {
          ignoreDuplicates: true,
          onConflict: "user_id,unit_id",
        },
      ],
      method: "upsert",
    },
    { args: ["account_session_active"], method: "rpc" },
  ]);
});

test("removeOwned applies both the owner and unit filters before execution", async () => {
  const { calls, client } = createFakeClient();
  const store = createSupabaseSavedCollegeStore(client, USER_ID);

  await store.removeOwned(USER_ID, [101, 202]);
  assert.deepEqual(calls, [
    { args: ["account_session_active"], method: "rpc" },
    { args: ["saved_colleges"], method: "from" },
    { args: [], method: "delete" },
    { args: ["user_id", USER_ID], method: "eq" },
    { args: ["unit_id", [101, 202]], method: "in" },
    { args: ["account_session_active"], method: "rpc" },
  ]);
});

test("empty mutations do not issue Supabase requests", async () => {
  const { calls, client } = createFakeClient();
  const store = createSupabaseSavedCollegeStore(client, USER_ID);

  await store.upsertOwned(USER_ID, []);
  await store.removeOwned(USER_ID, []);
  assert.deepEqual(calls, []);
});

test("Supabase adapter errors are surfaced without leaking query details", async () => {
  const { client } = createFakeClient({ error: { message: "permission denied" } });
  const store = createSupabaseSavedCollegeStore(client, USER_ID);

  await assert.rejects(store.listOwned(USER_ID), /permission denied/);
});

test("the adapter rejects a caller whose UUID differs from its bound token owner", async () => {
  const { calls, client } = createFakeClient();
  const store = createSupabaseSavedCollegeStore(client, USER_ID);
  const otherUser = "22222222-2222-4222-8222-222222222222";

  await assert.rejects(store.listOwned(otherUser), /account scope changed/i);
  await assert.rejects(store.upsertOwned(otherUser, [101]), /account scope changed/i);
  await assert.rejects(store.removeOwned(otherUser, [101]), /account scope changed/i);
  assert.deepEqual(calls, [], "scope mismatch stops before PostgREST");
});

test("revoked or unverified sessions cannot turn filtered rows into a successful read or mutation", async () => {
  for (const result of [false, null, new Error("verification offline")]) {
    const { calls, client } = createFakeClient({ sessionChecks: [result] });
    const store = createSupabaseSavedCollegeStore(client, USER_ID);
    await assert.rejects(store.listOwned(USER_ID), SavedCollegeSessionUnavailableError);
    await assert.rejects(store.removeOwned(USER_ID, [101]), SavedCollegeSessionUnavailableError);
    await assert.rejects(store.upsertOwned(USER_ID, [202]), SavedCollegeSessionUnavailableError);
    assert.ok(calls.every(call => call.method === "rpc"), "no table request is allowed before verification");
  }
});

test("revocation during a successful query fails before the result is acknowledged", async () => {
  for (const operation of ["listOwned", "removeOwned", "upsertOwned"] as const) {
    const { calls, client } = createFakeClient({ sessionChecks: [true, false] });
    const store = createSupabaseSavedCollegeStore(client, USER_ID);
    await assert.rejects(store[operation](USER_ID, [101]), SavedCollegeSessionUnavailableError);
    assert.ok(calls.some(call => call.method === "from"), "the query completed between the two checks");
  }
});

test("a verified empty account remains a valid empty snapshot", async () => {
  const { client } = createFakeClient();
  assert.deepEqual(await createSupabaseSavedCollegeStore(client, USER_ID).listOwned(USER_ID), []);
});

test("the full sync cycle preserves cached colleges and pending intent when revocation races a read or delete", async () => {
  for (const stage of ["remote-read", "remote-write"]) {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const knownIds = new Set([101, 202]);
    const cacheKey = savedCollegeUserCacheKey(USER_ID);
    storage.setItem(cacheKey, JSON.stringify([101, 202]));
    writeSavedCollegeMutation(USER_ID, { unitId: 101, action: "remove" }, knownIds, storage);
    const cacheBefore = storage.getItem(cacheKey);
    const pendingBefore = readSavedCollegeOutbox(USER_ID, knownIds, storage);
    const { client } = createFakeClient({ data: stage === "remote-read" ? [] : [{ unit_id: 101 }, { unit_id: 202 }], sessionChecks: stage === "remote-read" ? [true, false] : [true, true, true, false] });
    let snapshotCount = 0;
    await assert.rejects(syncSavedCollegeAccountCycle({ knownIds, storage, userId: USER_ID, remote: createSupabaseSavedCollegeStore(client, USER_ID), lockManager: { request: async (_name, _options, callback) => callback() }, onRemoteSnapshot: () => { snapshotCount += 1; } }), (error: unknown) => error instanceof SavedCollegeAccountCycleError && error.stage === stage && error.cause instanceof SavedCollegeSessionUnavailableError);
    assert.equal(storage.getItem(cacheKey), cacheBefore, "an unverified response cannot replace the cache");
    assert.deepEqual(readSavedCollegeOutbox(USER_ID, knownIds, storage), pendingBefore, "the student's exact pending remove is retained");
    assert.equal(snapshotCount, stage === "remote-read" ? 0 : 1, "only an independently verified read can be published");
  }
});
