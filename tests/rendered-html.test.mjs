import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        host: "localhost",
        "x-forwarded-proto": "http",
      },
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

test("server-renders the College Compass product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>College Compass<\/title>/i);
  assert.match(html, /Build a college list you can/);
  assert.match(html, /Search 50 verified colleges/);
  assert.match(html, /Official data, visible sources/);
  assert.match(html, /College Scorecard/);
  assert.match(html, /core federal reporting year/i);
  assert.match(html, />2024</);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("the published starting cohort has complete, traceable core evidence", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
  );

  assert.equal(payload.release.institutionCount, 50);
  assert.equal(payload.colleges.length, 50);
  assert.equal(payload.release.publisher, "U.S. Department of Education");
  assert.equal(payload.release.sourceName, "College Scorecard");
  assert.equal(payload.release.institutionMetricsYear, 2024);
  assert.match(payload.release.sourceUrl, /^https:\/\/collegescorecard\.ed\.gov\//);
  assert.match(
    payload.release.notes,
    /institution-wide unless explicitly labeled otherwise/i,
  );

  const unitIds = payload.colleges.map((college) => college.unitId);
  assert.equal(new Set(unitIds).size, 50);

  const ucCampuses = payload.colleges.filter((college) =>
    college.aliases.some((alias) => alias.startsWith("UC ")),
  );
  assert.equal(ucCampuses.length, 9);

  for (const college of payload.colleges) {
    assert.ok(Number.isInteger(college.unitId), `${college.name} has a UNITID`);
    assert.ok(college.name, "College name is present");
    assert.ok(college.city && college.state, `${college.name} has a location`);
    assert.ok(
      college.admitRate >= 0 && college.admitRate <= 1,
      `${college.name} has a valid admit rate`,
    );
    assert.ok(
      college.graduationRate >= 0 && college.graduationRate <= 1,
      `${college.name} has a valid graduation rate`,
    );
    assert.ok(
      college.averageNetPrice >= 0,
      `${college.name} has a non-negative net price`,
    );
    assert.ok(
      college.undergraduateEnrollment > 0,
      `${college.name} has undergraduate enrollment`,
    );
    assert.ok(college.majors.length > 0, `${college.name} has major evidence`);
    assert.ok(
      college.majors.every(
        (major) =>
          major.evidence === "Recent degree completions" &&
          major.share > 0 &&
          major.share <= 1,
      ),
      `${college.name} uses the expected major-evidence label`,
    );
  }
});
