import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("auth dialog always releases its busy state after unexpected auth failures", async () => {
  const source = await readFile(
    new URL("../app/components/auth/AuthDialog.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const UNEXPECTED_AUTH_ERROR/);
  assert.match(
    source,
    /async function handleGoogleSignIn[\s\S]*try \{[\s\S]*signInWithOAuth[\s\S]*catch \{[\s\S]*UNEXPECTED_AUTH_ERROR[\s\S]*finally \{[\s\S]*setBusy\(false\)/,
  );
  assert.match(
    source,
    /async function handleSubmit[\s\S]*try \{[\s\S]*signInWithPassword[\s\S]*catch \{[\s\S]*UNEXPECTED_AUTH_ERROR[\s\S]*finally \{[\s\S]*setBusy\(false\)/,
  );
});

test("saved-only Explore never represents an unavailable account list as empty", async () => {
  const source = await readFile(
    new URL("../app/CollegeCompassApp.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /hydrated: savedListHydrated/);
  assert.match(source, /const savedListUnavailable = state\.savedOnly && !savedListHydrated/);
  assert.match(source, /CollegeSearch will not represent an unavailable account list as empty/);
  assert.match(source, /retrySync: retrySavedList/);
});

test("auth callback routes convert unexpected exchange failures into safe redirects", async () => {
  for (const route of [
    "../app/auth/callback/route.ts",
    "../app/auth/recovery-callback/route.ts",
  ]) {
    const source = await readFile(new URL(route, import.meta.url), "utf8");
    assert.match(
      source,
      /try \{[\s\S]*exchangeCodeForSession[\s\S]*catch \{[\s\S]*exchangeFailed = true/,
    );
    assert.match(source, /auth-code-error\?reason=exchange/);
  }
});

test("repeated save and comparison controls name their college", async () => {
  const explorer = await readFile(
    new URL("../app/CollegeCompassApp.tsx", import.meta.url),
    "utf8",
  );
  const saved = await readFile(
    new URL("../app/saved/SavedColleges.tsx", import.meta.url),
    "utf8",
  );

  for (const source of [explorer, saved]) {
    assert.match(source, /`Add \$\{college\.name\} to comparison`/);
    assert.match(source, /`Remove \$\{college\.name\} from comparison`/);
    assert.match(source, /`Remove \$\{college\.name\} from saved colleges`/);
  }
  assert.match(explorer, /`Save \$\{college\.name\}`/);
});

test("admit-rate cards name the college in remove controls", async () => {
  const source = await readFile(
    new URL("../app/chances/ChancesTool.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /`Remove \$\{college\.name\} from admit-rate context`/,
  );
});
