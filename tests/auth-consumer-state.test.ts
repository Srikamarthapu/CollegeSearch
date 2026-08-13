import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthConsumerState } from "../app/components/auth/auth-consumer-state.ts";

test("only a currently verified signed-in identity enables account actions", () => {
  assert.deepEqual(
    resolveAuthConsumerState({
      hasUser: true,
      status: "signed-in",
      verification: "verified",
    }),
    {
      canUseAccount: true,
      hasLastVerifiedIdentity: true,
      state: "verified-signed-in",
    },
  );

  for (const decision of [
    resolveAuthConsumerState({
      hasUser: true,
      status: "signed-in",
      verification: "checking",
    }),
    resolveAuthConsumerState({
      hasUser: true,
      status: "signed-in",
      verification: "failed",
    }),
    resolveAuthConsumerState({
      hasUser: false,
      status: "signed-out",
      verification: "verified",
    }),
    resolveAuthConsumerState({
      hasUser: false,
      status: "verification-error",
      verification: "failed",
    }),
  ]) {
    assert.equal(decision.canUseAccount, false);
  }
});

test("a checking or failed prior identity is labeled as last verified", () => {
  assert.deepEqual(
    resolveAuthConsumerState({
      hasUser: true,
      status: "signed-in",
      verification: "checking",
    }),
    {
      canUseAccount: false,
      hasLastVerifiedIdentity: true,
      state: "checking-last-verified",
    },
  );
  assert.deepEqual(
    resolveAuthConsumerState({
      hasUser: true,
      status: "signed-in",
      verification: "failed",
    }),
    {
      canUseAccount: false,
      hasLastVerifiedIdentity: true,
      state: "last-verified-unavailable",
    },
  );
});

test("unknown, failed signed-out, and inconsistent states fail closed", () => {
  for (const input of [
    {
      hasUser: false,
      status: "loading" as const,
      verification: "checking" as const,
    },
    {
      hasUser: false,
      status: "signed-out" as const,
      verification: "failed" as const,
    },
    {
      hasUser: false,
      status: "signed-in" as const,
      verification: "verified" as const,
    },
  ]) {
    const decision = resolveAuthConsumerState(input);
    assert.equal(decision.canUseAccount, false);
    assert.equal(
      decision.state,
      input.status === "loading" ? "checking" : "unavailable",
    );
  }
});

test("verified signed-out and unconfigured states remain distinct", () => {
  assert.equal(
    resolveAuthConsumerState({
      hasUser: false,
      status: "signed-out",
      verification: "verified",
    }).state,
    "verified-signed-out",
  );
  assert.equal(
    resolveAuthConsumerState({
      hasUser: false,
      status: "unconfigured",
      verification: "unconfigured",
    }).state,
    "unconfigured",
  );
});
