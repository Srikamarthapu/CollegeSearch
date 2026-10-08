import assert from "node:assert/strict";
import test from "node:test";

import { resolveSupabasePublicConfig } from "../app/lib/supabase/config.ts";

const URL = "https://project-ref.supabase.co";

function legacyJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

test("public Supabase config accepts publishable and legacy anon keys", () => {
  for (const key of [
    "sb_publishable_public-example",
    legacyJwt({ role: "anon" }),
  ]) {
    assert.deepEqual(resolveSupabasePublicConfig(URL, key), {
      configured: true,
      publishableKey: key,
      url: URL,
    });
  }
});

test("public Supabase config rejects privileged keys before a browser client can exist", () => {
  for (const key of [
    "sb_secret_should-never-ship",
    legacyJwt({ role: "service_role" }),
    legacyJwt({ role: "supabase_admin" }),
  ]) {
    const result = resolveSupabasePublicConfig(URL, key);
    assert.equal(result.configured, false);
    assert.equal(result.reason, "unsafe-publishable-key");
  }
});

test("malformed or missing public settings fail closed", () => {
  assert.equal(
    resolveSupabasePublicConfig(URL, "not-a-supabase-public-key").configured,
    false,
  );
  assert.deepEqual(resolveSupabasePublicConfig(undefined, undefined), {
    configured: false,
    missing: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ],
    reason: "missing",
  });
});
