import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [ciWorkflow, liveWorkflow] = await Promise.all([
  readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
  readFile(
    new URL("../.github/workflows/live-data-verification.yml", import.meta.url),
    "utf8",
  ),
]);

const pinnedOfficialAction = /uses: actions\/(?:checkout|setup-node)@[0-9a-f]{40}/g;

test("the pull-request gate runs the complete deterministic verification sequence", () => {
  const commands = [
    "npm ci",
    "npm run typecheck",
    "npm run lint",
    "npm run data:verify-offline",
    "npm test",
    "npm audit --omit=dev",
    "git diff --exit-code",
  ];
  let previousIndex = -1;
  for (const command of commands) {
    const index = ciWorkflow.indexOf(`run: ${command}`);
    assert.ok(index > previousIndex, `${command} must appear in gate order`);
    previousIndex = index;
  }
  assert.match(ciWorkflow, /\n  pull_request:\n/);
  assert.doesNotMatch(ciWorkflow, /npm run data:verify-overlays\s*$/m);
});

test("both workflows are bounded, read-only, secret-free, and SHA-pinned", () => {
  for (const workflow of [ciWorkflow, liveWorkflow]) {
    assert.match(workflow, /permissions:\n  contents: read/);
    assert.match(workflow, /cancel-in-progress: true/);
    assert.match(workflow, /timeout-minutes: 30/);
    assert.doesNotMatch(workflow, /secrets\.|pull_request_target|contents: write|id-token: write/);
    assert.equal(workflow.match(pinnedOfficialAction)?.length, 2);
  }
});

test("live artifact availability is monitored outside the pull-request gate", () => {
  assert.match(liveWorkflow, /\n  schedule:\n/);
  assert.match(liveWorkflow, /\n  workflow_dispatch:\n/);
  assert.match(liveWorkflow, /npm run data:verify-overlays/);
  assert.match(liveWorkflow, /if: always\(\).*steps.verify.outcome/);
  assert.match(liveWorkflow, /uses: actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(liveWorkflow, /path: data\/institution-source-verification.json/);
  assert.doesNotMatch(liveWorkflow, /\n  (?:pull_request|push):\n/);
});
