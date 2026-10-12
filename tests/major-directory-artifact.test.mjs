import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { register } from "tsx/esm/api";

register();

const [
  { colleges, release },
  { projectCollegeBroadFields },
  majorData,
] = await Promise.all([
  import("../app/lib/college-data.ts"),
  import("../app/majors/major-artifact.ts"),
  import("../app/majors/major-data.ts"),
]);

const artifact = JSON.parse(
  readFileSync(new URL("../data/college-broad-fields.json", import.meta.url), "utf8"),
);

function legacyBroadFields() {
  const byName = new Map();
  for (const college of colleges) {
    for (const evidence of college.majors) {
      const records = byName.get(evidence.name) ?? [];
      records.push({ college, evidence });
      byName.set(evidence.name, records);
    }
  }

  return [...byName.entries()]
    .map(([name, records]) => ({
      name,
      slug: majorData.broadFieldSlug(name),
      records,
      periodLabels: [...new Set(records.map(({ evidence }) => evidence.periodLabel))],
      sourceIds: [...new Set(records.map(({ evidence }) => evidence.sourceId))],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function collegeSummary(college) {
  return {
    unitId: college.unitId,
    slug: college.slug,
    name: college.name,
    city: college.city,
    state: college.state,
    ownership: college.ownership,
    setting: college.setting,
    observations: { admitRate: college.observations.admitRate },
  };
}

function evidenceSummary(evidence) {
  return {
    share: evidence.share,
    bachelorsAvailable: evidence.bachelorsAvailable,
    associatesAvailable: evidence.associatesAvailable,
    periodLabel: evidence.periodLabel,
    sourceId: evidence.sourceId,
    sourceField: evidence.sourceField,
    cohort: evidence.cohort,
  };
}

test("generated broad-field artifact preserves the source projection and release identity", () => {
  const expected = projectCollegeBroadFields(
    colleges,
    release,
    artifact.releaseId,
    artifact.cacheVersion,
  );
  assert.equal(artifact.schemaVersion, 1);
  assert.ok(artifact.releaseId);
  assert.ok(artifact.cacheVersion);
  assert.deepEqual(artifact, JSON.parse(JSON.stringify(expected)));
});

test("major index and detail preserve all field records, counts, sources, and periods", () => {
  const legacyFields = legacyBroadFields();
  assert.equal(majorData.broadFields.length, legacyFields.length);
  assert.equal(majorData.colleges.length, colleges.length);
  assert.equal(majorData.broadFieldCollegeCount, colleges.length);

  for (let index = 0; index < legacyFields.length; index += 1) {
    const expected = legacyFields[index];
    const actual = majorData.broadFields[index];
    assert.equal(actual.name, expected.name);
    assert.equal(actual.slug, expected.slug);
    assert.deepEqual(actual.periodLabels, expected.periodLabels);
    assert.deepEqual(actual.sourceIds, expected.sourceIds);
    assert.deepEqual(
      actual.records.map(({ college, evidence }) => ({ college, evidence })),
      expected.records.map(({ college, evidence }) => ({
        college: collegeSummary(college),
        evidence: evidenceSummary(evidence),
      })),
    );

    const representedIds = new Set(expected.records.map(({ college }) => college.unitId));
    const expectedAbsent = colleges.filter((college) => !representedIds.has(college.unitId));
    const actualAbsent = majorData.collegesWithoutBroadField(actual);
    assert.equal(actual.records.length, expected.records.length, `${actual.name} coverage count`);
    assert.deepEqual(
      actualAbsent.map(({ unitId, slug, name, city, state }) => ({ unitId, slug, name, city, state })),
      expectedAbsent.map(({ unitId, slug, name, city, state }) => ({ unitId, slug, name, city, state })),
      `${actual.name} missing-record examples preserve catalog order`,
    );
  }

  const expectedSources = release.sources.filter((source) =>
    legacyFields.some((field) => field.sourceIds.includes(source.id)),
  );
  assert.deepEqual(
    majorData.broadFieldSources,
    expectedSources.map(({ id, publisher, sourceName, sourceUrl }) => ({ id, publisher, sourceName, sourceUrl })),
  );
  for (const field of legacyFields) {
    for (const { evidence } of field.records) {
      const expectedSource = release.sources.find((source) => source.id === evidence.sourceId) ?? null;
      assert.deepEqual(majorData.sourceForBroadFieldEvidence(evidence), expectedSource && {
        id: expectedSource.id,
        publisher: expectedSource.publisher,
        sourceName: expectedSource.sourceName,
        sourceUrl: expectedSource.sourceUrl,
      });
    }
  }
});

test("majors runtime entrypoints use the compact artifact instead of the source catalog", async () => {
  const paths = [
    "../app/majors/major-data.ts",
    "../app/majors/page.tsx",
    "../app/majors/[slug]/page.tsx",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.match(sources[0], /college-broad-fields\.json/);
  assert.doesNotMatch(sources[0], /import\s*\{[^}]*\bcolleges\b[^}]*\}\s*from\s*["']@\/app\/lib\/college-data/);
  assert.doesNotMatch(sources[1], /from\s*["']@\/app\/lib\/college-data/);
  assert.doesNotMatch(sources[2], /from\s*["']@\/app\/lib\/college-data/);
});
