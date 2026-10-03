import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { captureVerifiedSupabaseSession } from "../app/lib/supabase/verified-session.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function sourceClient({
  localUserId = USER_A,
  verifiedUserId = USER_A,
}: {
  localUserId?: string;
  verifiedUserId?: string;
} = {}) {
  return {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              access_token: `access-${localUserId}`,
              refresh_token: `refresh-${localUserId}`,
              user: { id: localUserId },
            },
          },
          error: null,
        };
      },
      async getUser() {
        return { data: { user: { id: verifiedUserId } }, error: null };
      },
    },
  } as unknown as SupabaseClient;
}

test("a verified identity and matching local token are captured together", async () => {
  assert.deepEqual(
    await captureVerifiedSupabaseSession(sourceClient(), USER_A.toUpperCase()),
    {
      accessToken: `access-${USER_A}`,
      refreshToken: `refresh-${USER_A}`,
      userId: USER_A,
    },
  );
});

test("a shared-client account switch fails before a token can be bound", async () => {
  await assert.rejects(
    captureVerifiedSupabaseSession(
      sourceClient({ localUserId: USER_B, verifiedUserId: USER_A }),
      USER_A,
    ),
    /could not be bound safely/i,
  );
  await assert.rejects(
    captureVerifiedSupabaseSession(
      sourceClient({ localUserId: USER_B, verifiedUserId: USER_B }),
      USER_A,
    ),
    /could not be bound safely/i,
  );
});

test("malformed expected identities fail before Auth is read", async () => {
  let authRead = false;
  const source = {
    auth: {
      async getUser() {
        authRead = true;
        throw new Error("must not run");
      },
    },
  } as unknown as SupabaseClient;

  await assert.rejects(
    captureVerifiedSupabaseSession(source, "not-a-user"),
    /could not be bound safely/i,
  );
  assert.equal(authRead, false);
});
