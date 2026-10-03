import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the same built Worker updates verification recency on later requests", async (t) => {
  const verification = JSON.parse(await readFile(new URL("../data/institution-source-verification.json", import.meta.url), "utf8"));
  const checked = Date.parse(verification.checkedAt);
  assert.ok(Number.isFinite(checked));
  const { default: worker } = await import("../dist/server/index.js");
  let clock = checked + 7 * 86_400_000;
  t.mock.method(Date, "now", () => clock);
  const render = () => worker.fetch(new Request("http://localhost/data-health", { headers: { accept: "text/html", host: "localhost", "x-forwarded-proto": "http" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  try {
    const current = await render();
    assert.equal(current.status, 200);
    assert.match(current.headers.get("cache-control"), /private/);
    assert.match(current.headers.get("cache-control"), /no-store/);
    const currentHtml = await current.text();
    assert.match(currentHtml, /data-verification-state="within_window"/);
    assert.match(currentHtml, /Artifact check within the eight-day review window/);
    assert.match(currentHtml, /does not update reporting periods or repeat manual factual review/);
    clock = checked + 9 * 86_400_000;
    const overdue = await render();
    assert.equal(overdue.status, 200);
    const overdueHtml = await overdue.text();
    assert.match(overdueHtml, /data-verification-state="stale"/);
    assert.match(overdueHtml, /Published artifact check is overdue for review/);
    assert.match(overdueHtml, /confirm important details with the college/);
  } finally { t.mock.restoreAll(); }
});
