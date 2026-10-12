import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("local-save-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "http://localhost"), {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("student decision surfaces render an explicit browser-local save action", async () => {
  for (const pathname of [
    "/colleges/university-of-california-berkeley",
    "/chances?colleges=110635",
  ]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, `${pathname} renders`);
    const html = await response.text();
    assert.match(html, /Save locally/, `${pathname} offers a local save action`);
    assert.match(
      html,
      /Saved colleges stay in this browser; account sync is not active\./,
      `${pathname} keeps the account-sync boundary visible`,
    );
  }
});

test("match results offer local saves once preferences produce a shortlist", async () => {
  const source = await readFile(
    new URL("../app/match/MatchTool.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<LocalSaveButton/);
  assert.match(source, /unitId=\{result\.college\.unitId\}/);
  assert.match(source, /collegeName=\{result\.college\.name\}/);
});

test("account saves are rendered immediately but never sent before the outbox persists", async () => {
  const source = await readFile(
    new URL("../app/components/saved/SavedCollegesProvider.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /viewState\.scopeKind === "account"[\s\S]*!session \|\| !sessionIsCurrent\(session\)[\s\S]*return;[\s\S]*publishIds\(nextIds\);[\s\S]*const pendingWrite = persistMutations\(\s*session\.userId,\s*changed,\s*session\.storage,\s*\);[\s\S]*if \(!pendingWrite\.persisted\)[\s\S]*return;[\s\S]*void flushSession\(session\)/,
  );
});

test("the provider delegates each locked account cycle to the tested sync primitive", async () => {
  const source = await readFile(
    new URL("../app/components/saved/SavedCollegesProvider.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /await syncSavedCollegeAccountCycle\(\{/);
  assert.match(source, /lockManager: session\.lockManager/);
  assert.match(source, /storage: guardAccountStorage\(session\.storage, \(\) => sessionIsCurrent\(session\)\)/);
  assert.match(source, /remote: guardedRemote/);
  for (const operation of ["listOwned", "removeOwned", "upsertOwned"]) {
    assert.match(
      source,
      new RegExp(
        `async ${operation}\\([^)]*\\) \\{[\\s\\S]*?if \\(!sessionIsCurrent\\(session\\)\\) throw new Error\\("Stale account scope\\."\\);[\\s\\S]*?await session\\.remote\\.${operation}\\([^;]*\\);[\\s\\S]*?if \\(!sessionIsCurrent\\(session\\)\\) throw new Error\\("Stale account scope\\."\\);`,
      ),
    );
  }
  assert.doesNotMatch(source, /new SavedCollegeMutationQueue/);
  assert.doesNotMatch(source, /withSavedCollegeAccountLock/);
  assert.doesNotMatch(source, /clearSavedCollegeMutationIfSatisfied/);
});

test("guest save updates use the canonical writer that removes the legacy key", async () => {
  const source = await readFile(
    new URL("../app/components/saved/SavedCollegesProvider.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /writeSavedCollegeIds\(\s*nextIds,\s*knownIds,/);
  assert.match(
    source,
    /writeSavedCollegeIds\(\s*remainingGuestIds,\s*knownIds,\s*session\.storage,/,
  );
  assert.doesNotMatch(
    source,
    /writeSavedCollegeIdsAtKey\(\s*SAVED_COLLEGES_STORAGE_KEY/,
  );
});
