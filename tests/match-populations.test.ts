import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { register } from "tsx/esm/api";
import type { College } from "../app/lib/college-data";
import { projectEligibleMatchColleges } from "../app/match/college-artifact.ts";
import { toMatchCollege } from "../app/match/college-record.ts";
import { matchBounds, rankMatches, scoreCollege, type MatchCollege } from "../app/match/scoring.ts";
import { initialMatchWorksheet, parseMatchWorksheet, serializeMatchWorksheet } from "../app/match/url-state.ts";

register();

const source = JSON.parse(readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8")) as { colleges: College[] };
const generatedMatchDirectory = JSON.parse(
  readFileSync(new URL("../data/college-match-directory.json", import.meta.url), "utf8"),
) as {
  schemaVersion: number;
  releaseId: string;
  cacheVersion: string;
  sourceHashes: Record<string, string>;
  colleges: MatchCollege[];
};
const eligibleSource = source.colleges.filter(
  (college) => college.institutionLevel === "Four-year" && college.undergraduateOffering,
);
const legacyProjection = eligibleSource.map(toMatchCollege);
const colleges = projectEligibleMatchColleges(source.colleges);
const generatedColleges = generatedMatchDirectory.colleges;
const publicCollege = colleges.find((college) => college.ownership === "Public")!;
const preferences = { ...initialMatchWorksheet().preferences, maxNetPrice: 60000, weights: { major: 0, location: 0, price: 4, size: 0, setting: 0, graduation: 0, earnings: 0 } };

test("build-time MatchCollege projection preserves every eligible source record", () => {
  assert.deepEqual(colleges, legacyProjection);
  assert.equal(colleges.length, eligibleSource.length);
  assert.deepEqual(
    colleges.map(({ unitId }) => unitId),
    eligibleSource.map(({ unitId }) => unitId),
  );
});

test("generated MatchCollege artifact preserves the full projection and source version", () => {
  assert.equal(generatedMatchDirectory.schemaVersion, 1);
  assert.equal(generatedMatchDirectory.releaseId, generatedMatchDirectory.sourceHashes["colleges.json"]);
  assert.ok(generatedMatchDirectory.cacheVersion);
  assert.deepEqual(generatedColleges, JSON.parse(JSON.stringify(legacyProjection)));
});

test("Find My Fit API uses runtime artifacts instead of full catalog modules", () => {
  const route = readFileSync(new URL("../app/api/match/route.ts", import.meta.url), "utf8");
  assert.match(route, /college-match-directory\.json/);
  assert.match(route, /college-runtime-summary\.json/);
  assert.doesNotMatch(route, /from ["']@\/app\/lib\/college-data/);
  assert.doesNotMatch(route, /from ["']@\/app\/lib\/college-directory/);
  assert.doesNotMatch(route, /toMatchCollege/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("generated records preserve existing ranked Find My Fit results", async () => {
  const sourceResults = rankMatches(legacyProjection, preferences, 5);
  const projectedResults = rankMatches(generatedColleges, preferences, 5);
  assert.deepEqual(
    JSON.parse(JSON.stringify(projectedResults)),
    JSON.parse(JSON.stringify(sourceResults)),
  );

  const { NextRequest } = await import("next/server");
  const { POST } = await import("../app/api/match/route.ts");
  const response = await POST(
    new NextRequest("https://example.test/api/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        preferences,
        activeCriteria: ["price"],
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json() as {
    releaseId: string;
    results: unknown[];
  };
  assert.equal(payload.releaseId, generatedMatchDirectory.releaseId);
  const sourceApiResults = rankMatches(legacyProjection, preferences, 10);
  assert.deepEqual(
    payload.results,
    JSON.parse(JSON.stringify(sourceApiResults)),
  );

  const invalidResponse = await POST(
    new NextRequest("https://example.test/api/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences, activeCriteria: [] }),
    }),
  );
  assert.equal(invalidResponse.status, 400);
});

test("matching uses one exact federal graduation and enrollment population", () => {
  assert.ok(colleges.length >= 2_000);
  assert.ok(colleges.every((college) => eligibleSource.some((sourceCollege) => sourceCollege.unitId === college.unitId)));
  assert.equal(new Set(colleges.map((college) => college.graduationRate.cohort)).size, 1);
  assert.equal(new Set(colleges.map((college) => college.enrollment.cohort)).size, 1);
  assert.ok(colleges.every((college) => college.graduationRate.comparabilityKey === "completion.four-year-institution.150-percent"));
  assert.ok(colleges.every((college) => college.enrollment.comparabilityKey === "undergraduate-enrollment.degree-certificate-seeking"));
  assert.ok(colleges.every((college, index) => college.medianEarnings.value === eligibleSource[index].observations.medianEarnings.value), "current earnings are not replaced by a different historical horizon");
});

test("a public in-state average cannot contribute price points for unknown or nonresident students", () => {
  for (const residencyState of ["unknown", "international", publicCollege.state === "CA" ? "NY" : "CA"]) {
    const result = scoreCollege(publicCollege, { ...preferences, residencyState }, matchBounds(colleges));
    assert.equal(result.components[0].score, null);
    assert.equal(result.usedWeight, 0);
    assert.match(result.components[0].note, /excluded from the score/);
  }
  const result = scoreCollege(publicCollege, { ...preferences, residencyState: publicCollege.state }, matchBounds(colleges));
  assert.equal(result.components[0].score, 1);
  assert.match(result.components[0].note, /past cohort average, not your aid offer/);
  assert.ok(result.components[0].note.includes(publicCollege.netPrice.cohort));
});

test("mismatched future graduation cohorts and earnings horizons are excluded consistently", () => {
  const changed = { ...colleges[1], graduationRate: { ...colleges[1].graduationRate, cohort: "different entering cohort" }, medianEarnings: { ...colleges[1].medianEarnings, comparabilityKey: "different horizon" } };
  const candidates = [colleges[0], changed];
  for (const college of candidates) {
    const result = scoreCollege(college, { ...preferences, weights: { ...preferences.weights, price: 0, graduation: 3, earnings: 3 } }, matchBounds(candidates));
    assert.equal(result.usedWeight, 0);
    assert.ok(result.components.every((component) => component.score === null));
  }
});

test("residency survives shared preferences and rejects unknown states", () => {
  const initial = initialMatchWorksheet();
  initial.preferences.residencyState = "CA";
  initial.hasStudentInput = true;
  const options = { majorOptions: [], stateOptions: [] };
  assert.deepEqual(parseMatchWorksheet(serializeMatchWorksheet("", initial), options), initial);
  assert.equal(parseMatchWorksheet("?residency=ZZ", options).preferences.residencyState, "unknown");
});
