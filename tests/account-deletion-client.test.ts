import assert from "node:assert/strict";
import test from "node:test";
import { acquireDeletionFreeze, waitForAccountCleanup } from "../app/lib/account-deletion-client.ts";

test("a failed second freeze cannot release the first deletion's active write fence", () => {
  const frozen = new Set<string>();
  const ports = {
    freeze(scope: string) { if (frozen.has(scope)) return false; frozen.add(scope); return true; },
    unfreeze(scope: string) { frozen.delete(scope); },
  };
  const firstRelease = acquireDeletionFreeze("account-a", ports.freeze, ports.unfreeze);
  const secondRelease = acquireDeletionFreeze("account-a", ports.freeze, ports.unfreeze);
  assert.equal(secondRelease, null);
  // The second attempt's finally path has no release callback to call.
  assert.equal(frozen.has("account-a"), true);
  firstRelease?.();
  assert.equal(frozen.has("account-a"), false);
});

test("a captured release is idempotent and cannot clear a later deletion's freeze", () => {
  const frozen = new Set<string>();
  const freeze = (scope: string) => { if (frozen.has(scope)) return false; frozen.add(scope); return true; };
  const unfreeze = (scope: string) => { frozen.delete(scope); };
  const release = acquireDeletionFreeze("account-a", freeze, unfreeze);
  release?.();
  acquireDeletionFreeze("account-a", freeze, unfreeze);
  release?.();
  assert.equal(frozen.has("account-a"), true);
});

test("a scope-mismatched acquisition never unfreezes another account", () => {
  let releases = 0;
  assert.equal(acquireDeletionFreeze("stale-account", () => false, () => { releases += 1; }), null);
  assert.equal(releases, 0);
});

test("completed and partial cleanup results reach the UI unchanged", async () => {
  const partial = { status: "partial", failedKeys: ["local-copy"] };
  assert.deepEqual(await waitForAccountCleanup(Promise.resolve(partial), 20), { status: "finished", result: partial });
  assert.deepEqual(await waitForAccountCleanup(Promise.resolve({ status: "complete" }), 20), { status: "finished", result: { status: "complete" } });
});

test("an indefinitely occupied cleanup lock no longer blocks the confirmed-delete result", async () => {
  let finish!: (value: string) => void;
  const cleanup = new Promise<string>((resolve) => { finish = resolve; });
  assert.deepEqual(await waitForAccountCleanup(cleanup, 5), { status: "waiting" });
  // Timing out the UI wait does not cancel or interfere with safe eventual erasure.
  finish("erased later");
  assert.equal(await cleanup, "erased later");
});

test("cleanup failure is still reported as failure, including after a timeout race", async () => {
  await assert.rejects(waitForAccountCleanup(Promise.reject(new Error("Storage unavailable")), 20), /Storage unavailable/);
  let reject!: (reason: Error) => void;
  const cleanup = new Promise<void>((_resolve, fail) => { reject = fail; });
  assert.deepEqual(await waitForAccountCleanup(cleanup, 5), { status: "waiting" });
  reject(new Error("Later storage failure"));
  await assert.rejects(cleanup, /Later storage failure/);
});
