import assert from "node:assert/strict";
import test from "node:test";
import {
  createContentSecurityPolicy,
  getSupabaseConnectOrigin,
} from "../security-policy.ts";

const nonce = "0123456789abcdef0123456789abcdef";

test("Supabase CSP origins are reduced to a safe public origin", () => {
  assert.equal(getSupabaseConnectOrigin(""), null);
  assert.equal(
    getSupabaseConnectOrigin(" https://project.supabase.co/ "),
    "https://project.supabase.co",
  );
  assert.equal(
    getSupabaseConnectOrigin("https://auth.collegesearch.example:8443"),
    "https://auth.collegesearch.example:8443",
  );
  assert.equal(
    getSupabaseConnectOrigin("http://127.0.0.1:54321"),
    "http://127.0.0.1:54321",
  );
  assert.equal(
    getSupabaseConnectOrigin("http://[::1]:54321/"),
    "http://[::1]:54321",
  );
});

test("Supabase CSP origins reject header injection and non-origin URLs", () => {
  for (const value of [
    "not-a-url",
    "javascript:alert(1)",
    "http://project.supabase.co",
    "https://user:password@project.supabase.co",
    "https://project.supabase.co/auth/v1",
    "https://project.supabase.co/?next=evil",
    "https://project.supabase.co/#fragment",
    "https://project.supabase.co/; script-src *",
  ]) {
    assert.throws(
      () => getSupabaseConnectOrigin(value),
      /NEXT_PUBLIC_SUPABASE_URL/,
      value,
    );
  }
});

test("production CSP is strict for scripts and scoped for optional auth", () => {
  const policy = createContentSecurityPolicy({
    isDevelopment: false,
    nonce,
    supabaseUrl: "https://project.supabase.co/",
  });

  assert.match(
    policy,
    new RegExp(`script-src 'self' 'nonce-${nonce}'`),
  );
  assert.match(
    policy,
    new RegExp(`script-src-elem 'self' 'nonce-${nonce}'`),
  );
  assert.doesNotMatch(policy, /'strict-dynamic'/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
  assert.match(
    policy,
    /connect-src 'self' https:\/\/project\.supabase\.co(?:;|$)/,
  );
  assert.match(policy, /style-src-attr 'unsafe-inline'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /frame-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy, /publishable|service_role|sb_[a-z]+_/i);
});

test("development CSP permits only the extra runtime transports it needs", () => {
  const policy = createContentSecurityPolicy({
    isDevelopment: true,
    nonce,
    supabaseUrl: "",
  });

  assert.match(policy, /script-src[^;]*'unsafe-eval'/);
  assert.match(policy, /connect-src 'self' ws: wss:/);
});

test("CSP refuses a fixed-shape injection value as a nonce", () => {
  for (const value of ["short", "<script>not-a-nonce", `${nonce}'; img-src *`]) {
    assert.throws(
      () =>
        createContentSecurityPolicy({
          isDevelopment: false,
          nonce: value,
        }),
      /CSP nonce/,
    );
  }
});
