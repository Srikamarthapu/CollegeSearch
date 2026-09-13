import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { College } from "../app/lib/college-data";
import { toMatchCollege } from "../app/match/college-record.ts";
import { matchBounds, scoreCollege } from "../app/match/scoring.ts";
import { initialMatchWorksheet, parseMatchWorksheet, serializeMatchWorksheet } from "../app/match/url-state.ts";

const source = JSON.parse(readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8")) as { colleges: College[] };
const colleges = source.colleges.map(toMatchCollege);
const publicCollege = colleges.find((college) => college.ownership === "Public")!;
const preferences = { ...initialMatchWorksheet().preferences, maxNetPrice: 60000, weights: { major: 0, location: 0, price: 4, size: 0, setting: 0, graduation: 0, earnings: 0 } };

test("matching uses one exact federal graduation and enrollment population", () => {
  assert.equal(colleges.length, 50);
  assert.equal(new Set(colleges.map((college) => college.graduationRate.cohort)).size, 1);
  assert.equal(new Set(colleges.map((college) => college.enrollment.cohort)).size, 1);
  assert.ok(colleges.every((college) => college.graduationRate.comparabilityKey === "completion.four-year-institution.150-percent"));
  assert.ok(colleges.every((college) => college.enrollment.comparabilityKey === "undergraduate-enrollment.degree-certificate-seeking"));
  assert.ok(colleges.every((college, index) => college.medianEarnings.value === source.colleges[index].observations.medianEarnings.value), "current earnings are not replaced by a different historical horizon");
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
