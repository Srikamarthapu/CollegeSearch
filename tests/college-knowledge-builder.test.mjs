import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildCollegeKnowledge } from "../scripts/lib/college-knowledge.mjs";

const root = process.cwd();
const datasetBytes = await readFile(path.join(root, "data", "colleges.json"));
const dataset = JSON.parse(datasetBytes.toString("utf8"));
const releaseId = "sha256:" + createHash("sha256").update(datasetBytes).digest("hex");
const marker = JSON.parse(await readFile(path.join(root, "data", "college-knowledge-release.json"), "utf8"));
const original = JSON.parse(await readFile(path.join(root, "tests", "fixtures", "original-college-identities.json"), "utf8"));

test("knowledge compiler binds the raw catalog release and preserves saved identities", async () => {
  const first = buildCollegeKnowledge(dataset, releaseId);
  const second = buildCollegeKnowledge(dataset, releaseId);
  assert.equal(marker.releaseId, releaseId);
  assert.deepEqual(first, second);
  assert.equal(first.catalog.length, dataset.colleges.length);
  assert.ok(first.catalog.length >= 100);
  const byId = new Map(first.catalog.map((row) => [row.unit_id, row]));
  for (const identity of original) {
    assert.equal(byId.get(identity.unitId)?.slug, identity.slug, "existing UNITID/slug must remain stable");
  }
});

test("compiled facts and passages have institution-bound registered provenance", () => {
  const seed = buildCollegeKnowledge(dataset, releaseId);
  const sources = new Map(seed.sources.map((source) => [source.source_id, source]));
  const bindings = new Set(seed.bindings.map((binding) => binding.unit_id + ":" + binding.source_id));
  const collegeCount = dataset.colleges.length;
  const expectedPrimary = new Map();
  const majorCount = dataset.colleges.reduce((count, college) => count + college.majors.length, 0);
  const observationCount = dataset.colleges.reduce((count, college) =>
    count + Object.values(college.observations).filter(Boolean).length +
      Object.values(college.alternateObservations).filter(Boolean).length, 0);
  for (const college of dataset.colleges) {
    for (const [metricKey, observation] of Object.entries(college.observations)) {
      if (observation) expectedPrimary.set(college.unitId + ":" + metricKey + ":" + observation.sourceField, true);
    }
    for (const [metricKey, observation] of Object.entries(college.alternateObservations)) {
      if (observation) expectedPrimary.set(college.unitId + ":" + metricKey + ":" + observation.sourceField, false);
    }
  }
  assert.equal(seed.facts.length, observationCount + majorCount * 3);
  assert.ok(seed.passages.length >= collegeCount);
  assert.ok(seed.passages.length < collegeCount + majorCount);
  assert.ok(seed.passages.every((passage) => passage.content.length <= 2_000));
  const passagesByCollege = new Map();
  for (const passage of seed.passages) {
    const rows = passagesByCollege.get(passage.unit_id) ?? [];
    rows.push(passage);
    passagesByCollege.set(passage.unit_id, rows);
  }
  for (const college of dataset.colleges) {
    for (const major of college.majors) {
      assert.ok(passagesByCollege.get(college.unitId).some((passage) =>
        passage.source_id === major.sourceId && passage.cohort === major.cohort &&
        passage.reporting_year === major.reportingYear && passage.period_label === major.periodLabel &&
        passage.content.includes(major.name) && major.sourceField.split(" + ")
          .filter((field) => field.startsWith("CIP")).every((field) => passage.source_field.includes(field))),
      `${college.name}: every program field retains its own source, year, degree cohort, and locator`);
    }
  }
  assert.equal(seed.passages.filter((passage) => passage.embedding !== null).length, 0);

  for (const row of [...seed.facts, ...seed.passages]) {
    assert.ok(bindings.has(row.unit_id + ":" + row.source_id));
    const source = sources.get(row.source_id);
    assert.ok(source, "source registry row exists");
    const urls = [source.source_url, source.source_page, source.artifact_url, ...source.source_urls];
    if ("evidence_url" in row) assert.ok(urls.includes(row.evidence_url));
    else assert.ok(urls.includes(row.source_url));
  }
  for (const passage of seed.passages) {
    const digest = createHash("sha256").update(passage.content, "utf8").digest("hex");
    assert.equal(passage.content_sha256, digest);
    assert.equal(passage.embedding_content_sha256, null);
  }
  for (const fact of seed.facts) {
    const valueCount = [fact.value_numeric, fact.value_boolean, fact.value_text].filter((value) => value !== null).length;
    assert.equal(valueCount, ["suppressed", "unavailable"].includes(fact.status) ? 0 : 1);
    if (fact.metric_key.startsWith("major")) assert.equal(fact.is_primary, true);
    else assert.equal(fact.is_primary, expectedPrimary.get(fact.unit_id + ":" + fact.metric_key + ":" + fact.source_field));
  }
  assert.ok(seed.passages.some((passage) => passage.content.includes("not a major-specific admission or completion rate")));
});

test("release marker check succeeds only for the exact raw source bytes", async () => {
  const markerPath = path.join(root, "data", "college-knowledge-release.json");
  const stored = JSON.parse(await readFile(markerPath, "utf8"));
  assert.deepEqual(stored, { releaseId });
});
