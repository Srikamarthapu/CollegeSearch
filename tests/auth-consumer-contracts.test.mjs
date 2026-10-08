import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accountPageUrl = new URL(
  "../app/account/AccountPageClient.tsx",
  import.meta.url,
);
const accountControlUrl = new URL(
  "../app/components/auth/AuthAccountControl.tsx",
  import.meta.url,
);
const passwordFormUrl = new URL(
  "../app/auth/update-password/UpdatePasswordForm.tsx",
  import.meta.url,
);

test("all account consumers use the shared verification trust decision", async () => {
  for (const url of [accountPageUrl, accountControlUrl, passwordFormUrl]) {
    const source = await readFile(url, "utf8");
    assert.match(source, /resolveAuthConsumerState/);
  }
});

test("the account page gates account-scoped actions on current verification", async () => {
  const source = await readFile(accountPageUrl, "utf8");

  assert.match(source, /decision\.canUseAccount && canImportGuestSaves/);
  assert.match(source, /decision\.canUseAccount && syncPhase === "error"/);
  assert.match(
    source,
    /decision\.canUseAccount \? \([\s\S]*?href="\/auth\/update-password"/,
  );
  assert.match(source, /last-verified-unavailable/);
  assert.match(source, /Retry verification/);
});

test("password mutation has both a runtime trust gate and a disabled control", async () => {
  const source = await readFile(passwordFormUrl, "utf8");
  const runtimeGate = source.indexOf(
    "if (!activeAuth.canUseAccount || !activeAuth.userId)",
  );
  const passwordMutation = source.indexOf(
    "passwordClient.auth.updateUser({ password })",
  );

  assert.ok(runtimeGate >= 0, "expected a runtime verified-account gate");
  assert.ok(passwordMutation > runtimeGate, "gate must precede password mutation");
  assert.match(source, /createVerifiedSupabaseMutationClient/);
  assert.match(source, /data\.user\?\.id !== activeAuth\.userId/);
  assert.match(source, /disabled=\{busy \|\| !decision\.canUseAccount\}/);
  assert.match(source, /Password changes are paused/);
  assert.match(source, /Retry verification/);
});

test("terminal account state offers retry and local-session clearing", async () => {
  const source = await readFile(accountControlUrl, "utf8");

  assert.match(source, /decision\.state === "unavailable"/);
  assert.match(source, /Retry verification/);
  assert.match(source, /Clear this session/);
  assert.match(source, /verificationError/);
});
