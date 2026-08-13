import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseSavedCollegeStore } from "../app/lib/supabase/saved-colleges.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

type RecordedCall = { args: unknown[]; method: string };

function createFakeClient({
  data = [],
  error = null,
}: {
  data?: Array<{ unit_id: number }>;
  error?: { message?: string } | null;
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
    { args: ["saved_colleges"], method: "from" },
    { args: ["unit_id"], method: "select" },
    { args: ["user_id", USER_ID], method: "eq" },
  ]);
});

test("upsertOwned sends explicit owners and uses conflict-safe duplicate ignoring", async () => {
  const { calls, client } = createFakeClient();
  const store = createSupabaseSavedCollegeStore(client, USER_ID);

  await store.upsertOwned(USER_ID, [101, 202]);
  assert.deepEqual(calls, [
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
  ]);
});

test("removeOwned applies both the owner and unit filters before execution", async () => {
  const { calls, client } = createFakeClient();
  const store = createSupabaseSavedCollegeStore(client, USER_ID);

  await store.removeOwned(USER_ID, [101, 202]);
  assert.deepEqual(calls, [
    { args: ["saved_colleges"], method: "from" },
    { args: [], method: "delete" },
    { args: ["user_id", USER_ID], method: "eq" },
    { args: ["unit_id", [101, 202]], method: "in" },
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
