import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CollegeDataset } from "../app/lib/college-data.ts";
import { emptyAdviserPreferences } from "../app/lib/adviser/contracts.ts";
import { adviserNetPriceApplies, adviserTuition, buildAdviserRecommendation, publicCollegeCandidates } from "../app/lib/adviser/evidence.ts";
const dataset = JSON.parse(readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8")) as CollegeDataset;
const federalPublic = dataset.colleges.find((college) => college.ownership === "Public" && college.observations.tuitionInState.comparabilityKey === "tuition-fees.in-district")!;
const privateCollege = dataset.colleges.find((college) => college.ownership === "Private nonprofit")!;

test("resident tuition never silently uses the federal in-district price", () => {
  assert.equal(adviserTuition(federalPublic, { ...emptyAdviserPreferences, residencyState: federalPublic.state }), null);
  assert.equal(adviserTuition(federalPublic, emptyAdviserPreferences), null);
  assert.equal(adviserTuition(federalPublic, { ...emptyAdviserPreferences, residencyState: "AK" })?.key, "tuitionOutOfState");
  assert.equal(adviserTuition(privateCollege, emptyAdviserPreferences)?.label, "Published tuition & required fees / year");
});

test("public net price requires matching residency; private price retains historical cohort", () => {
  assert.equal(adviserNetPriceApplies(federalPublic, emptyAdviserPreferences), false);
  assert.equal(adviserNetPriceApplies(federalPublic, { ...emptyAdviserPreferences, residencyState: federalPublic.state }), true);
  const response = buildAdviserRecommendation(privateCollege, emptyAdviserPreferences, dataset);
  const net = response.facts.find((entry) => entry.key === "averageNetPrice")!;
  assert.match(net.label, /Historical/);
  assert.equal(net.citation.cohort, privateCollege.observations.averageNetPrice.cohort);
});

test("college recommendation values and citations bind to that college's reviewed observations", () => {
  for (const college of dataset.colleges) {
    const response = buildAdviserRecommendation(college, { ...emptyAdviserPreferences, residencyState: college.state, fields: ["Engineering"] }, dataset);
    for (const fact of response.facts) {
      const observation = college.observations[fact.key as keyof typeof college.observations]!;
      assert.equal(fact.citation.sourceId, observation.sourceId);
      assert.equal(fact.citation.year, observation.reportingYear);
      assert.equal(fact.citation.url, observation.sourceUrl);
    }
    assert.ok(response.tradeoffs.some((text) => /not an individual aid estimate/.test(text)));
    if (!college.majors.some((major) => major.name === "Engineering")) assert.deepEqual(response.fields, []);
  }
});

test("catalog narrowing requires every requested broad field without inventing a specific major", () => {
  const preferences = { ...emptyAdviserPreferences, fields: ["Engineering", "Education"] as const, states: ["CA"] };
  const narrowed = publicCollegeCandidates(dataset.colleges, { ...preferences, fields: [...preferences.fields] });
  assert.ok(narrowed.length > 0);
  assert.ok(narrowed.every((college) => college.state === "CA" && preferences.fields.every((field) => college.majors.some((major) => major.name === field))));
  assert.deepEqual(publicCollegeCandidates(dataset.colleges, emptyAdviserPreferences, [999999999]), []);
});
