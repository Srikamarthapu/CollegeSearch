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

test("the saved shelf keeps its rendered state when browser persistence fails", async () => {
  const source = await readFile(
    new URL("../app/saved/SavedColleges.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const result = writeSavedCollegeIds\(next, knownIds\);[\s\S]*if \(!result\.persisted\) return;[\s\S]*setSavedIds\(result\.ids\)/,
  );
});
