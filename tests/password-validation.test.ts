import assert from "node:assert/strict";
import test from "node:test";
import { newPasswordError } from "../app/lib/password-validation.ts";

test("new passwords respect minimum length and the provider's UTF-8 byte limit without truncation", () => {
  assert.ok(newPasswordError("short"));
  assert.equal(newPasswordError("a".repeat(72)), null);
  assert.match(newPasswordError("a".repeat(73))!, /72 bytes/);
  assert.equal(newPasswordError("🔐".repeat(18)), null);
  assert.match(newPasswordError("🔐".repeat(19))!, /72 bytes/);
});
