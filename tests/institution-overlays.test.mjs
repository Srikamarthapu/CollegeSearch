import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  artifactBytesForHash,
  resolveInstitutionOverlayObservationSourceId,
  sha256Hex,
  validateInstitutionOverlays,
} from "../scripts/lib/institution-overlays.mjs";

function observation({
  value,
  unit,
  status = "reported",
  comparabilityKey,
  sourceField,
  sourceId,
}) {
  return {
    value,
    reportingYear: 2025,
    unit,
    periodLabel: "Fall 2025",
    status,
    finality: "snapshot",
    comparabilityKey,
    sourceField,
    cohort: "Fall 2025 first-time, first-year degree-seeking applicants",
    definition: `Fixture definition for ${comparabilityKey}`,
    ...(sourceId ? { sourceId } : {}),
  };
}

function derivedAdmissionsFixture() {
  return {
    sources: [
      {
        id: "fixture-cds-2025-26",
        publisher: "Fixture University",
        sourceName: "Fixture Common Data Set 2025-26",
        sourcePage: "https://example.edu/common-data-set",
        accessedOn: "2026-08-09",
        finality: "snapshot",
        publicationStatus: "published",
        revisionStatus: "current when reviewed",
        cohort: "Fall 2025 admissions and enrollment",
        notes: "A minimal validator fixture.",
      },
    ],
    colleges: [
      {
        unitId: 123456,
        sourceId: "fixture-cds-2025-26",
        observations: {
          applicants: observation({
            value: 1_000,
            unit: "count",
            comparabilityKey: "admissions.first-year.applicants",
            sourceField: "CDS C1 applicants",
          }),
          admits: observation({
            value: 200,
            unit: "count",
            comparabilityKey: "admissions.first-year.admits",
            sourceField: "CDS C1 admits",
          }),
          enrollees: observation({
            value: 100,
            unit: "count",
            comparabilityKey: "admissions.first-year.enrollees",
            sourceField: "CDS C1 enrollees",
          }),
          admitRate: observation({
            value: 0.2,
            unit: "ratio",
            status: "derived",
            comparabilityKey: "admissions.first-year.rate",
            sourceField: "CDS C1: 200 admits divided by 1,000 applicants",
          }),
          yieldRate: observation({
            value: 0.5,
            unit: "ratio",
            status: "derived",
            comparabilityKey: "admissions.first-year.yield",
            sourceField: "CDS C1: 100 enrollees divided by 200 admits",
          }),
        },
      },
    ],
  };
}

function multiSourceOverlayFixture() {
  const dataset = derivedAdmissionsFixture();
  const admissionsSourceId = dataset.sources[0].id;
  const outcomesSourceId = "fixture-outcomes-2025-26";
  const admissionsHash = "a".repeat(64);
  Object.assign(dataset.sources[0], {
    sourceUrl: "https://example.edu/admissions.pdf",
    artifactUrl: "https://example.edu/admissions.pdf",
    artifactSha256: admissionsHash,
    artifactKind: "pdf",
    allowedArtifactHosts: ["example.edu"],
    review: {
      status: "approved",
      reviewedOn: "2026-08-09",
      approvedSha256: admissionsHash,
      method: "manual",
      notes: "The admissions fixture was manually reviewed.",
    },
  });
  const outcomesHash = "b".repeat(64);
  dataset.sources.push({
    ...dataset.sources[0],
    id: outcomesSourceId,
    sourceName: "Fixture Outcomes Profile 2025-26",
    sourcePage: "https://example.edu/outcomes-profile",
    sourceUrl: "https://example.edu/outcomes.pdf",
    artifactUrl: "https://example.edu/outcomes.pdf",
    artifactSha256: outcomesHash,
    review: {
      ...dataset.sources[0].review,
      approvedSha256: outcomesHash,
      notes: "The outcomes fixture was manually reviewed.",
    },
    cohort: "Fall 2025 undergraduate enrollment",
    notes: "A second independently reviewed source fixture.",
  });

  const college = dataset.colleges[0];
  college.sourceIds = [admissionsSourceId, outcomesSourceId];
  for (const observationRecord of Object.values(college.observations)) {
    observationRecord.sourceId = admissionsSourceId;
  }
  college.observations.undergraduateEnrollment = observation({
    value: 5_000,
    unit: "count",
    comparabilityKey: "undergraduate-enrollment.total",
    sourceField: "Official enrollment profile total",
    sourceId: outcomesSourceId,
  });

  return dataset;
}

test("institution overlays satisfy lineage and arithmetic invariants", async () => {
  const dataset = JSON.parse(
    await readFile(new URL("../data/institution-overlays.json", import.meta.url), "utf8"),
  );
  const summary = validateInstitutionOverlays(dataset);

  assert.equal(summary.sourceCount, dataset.sources.length);
  assert.equal(summary.collegeCount, dataset.colleges.length);
  assert.ok(summary.observationCount >= dataset.colleges.length * 5);
  assert.equal(summary.artifactCount, dataset.sources.length);
  assert.equal(summary.multiSourceCollegeCount, 2);
  for (const source of dataset.sources) {
    assert.equal(source.review.status, "approved");
    assert.equal(source.review.approvedSha256, source.artifactSha256);
    assert.ok(source.allowedArtifactHosts.length > 0);
  }
});

test("the generated release exactly reflects every reviewed overlay", async () => {
  const [overlays, generated] = await Promise.all([
    readFile(new URL("../data/institution-overlays.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/colleges.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const generatedSources = new Map(
    generated.release.sources.map((source) => [source.id, source]),
  );
  const generatedColleges = new Map(
    generated.colleges.map((college) => [college.unitId, college]),
  );

  for (const source of overlays.sources) {
    assert.deepEqual(generatedSources.get(source.id), source);
  }
  for (const overlay of overlays.colleges) {
    const college = generatedColleges.get(overlay.unitId);
    assert.ok(college, `generated college ${overlay.unitId} exists`);
    for (const [metric, expected] of Object.entries(overlay.observations)) {
      const actual = college.observations[metric];
      for (const [field, value] of Object.entries(expected)) {
        assert.deepEqual(
          actual[field],
          value,
          `UNITID ${overlay.unitId} ${metric}.${field} matches the reviewed overlay`,
        );
      }
      assert.equal(
        actual.sourceId,
        resolveInstitutionOverlayObservationSourceId(overlay, expected),
      );
    }
  }
});

test("a complete derived-admissions fixture passes validation", () => {
  assert.doesNotThrow(() => validateInstitutionOverlays(derivedAdmissionsFixture()));
});

test("a college can bind different metrics to explicitly declared reviewed sources", () => {
  const dataset = multiSourceOverlayFixture();
  const summary = validateInstitutionOverlays(dataset);
  const college = dataset.colleges[0];

  assert.equal(summary.multiSourceCollegeCount, 1);
  assert.equal(
    resolveInstitutionOverlayObservationSourceId(
      college,
      college.observations.admitRate,
    ),
    "fixture-cds-2025-26",
  );
  assert.equal(
    resolveInstitutionOverlayObservationSourceId(
      college,
      college.observations.undergraduateEnrollment,
    ),
    "fixture-outcomes-2025-26",
  );
});

test("multi-source overlays require explicit, declared, and used metric lineage", () => {
  const missingMetricLineage = multiSourceOverlayFixture();
  delete missingMetricLineage.colleges[0].observations.applicants.sourceId;
  assert.throws(
    () => validateInstitutionOverlays(missingMetricLineage),
    /applicants needs an explicit sourceId in a multi-source overlay/,
  );

  const undeclaredMetricLineage = multiSourceOverlayFixture();
  undeclaredMetricLineage.colleges[0].observations.undergraduateEnrollment.sourceId =
    "undeclared-source";
  assert.throws(
    () => validateInstitutionOverlays(undeclaredMetricLineage),
    /undergraduateEnrollment sourceId undeclared-source is not declared in college sourceIds/,
  );

  const unusedDeclaredSource = multiSourceOverlayFixture();
  unusedDeclaredSource.colleges[0].observations.undergraduateEnrollment.sourceId =
    "fixture-cds-2025-26";
  assert.throws(
    () => validateInstitutionOverlays(unusedDeclaredSource),
    /declares unused source fixture-outcomes-2025-26/,
  );
});

test("derived metrics cannot combine operands from different artifacts", () => {
  const dataset = multiSourceOverlayFixture();
  dataset.colleges[0].observations.admitRate.sourceId =
    "fixture-outcomes-2025-26";

  assert.throws(
    () => validateInstitutionOverlays(dataset),
    /admit-rate inputs must share sourceId/,
  );
});

test("multi-source declarations reject ambiguous or unregistered source sets", () => {
  const missingDefault = multiSourceOverlayFixture();
  missingDefault.colleges[0].sourceIds = [
    "fixture-outcomes-2025-26",
    "unregistered-source",
  ];
  assert.throws(
    () => validateInstitutionOverlays(missingDefault),
    /sourceIds references unknown source unregistered-source/,
  );

  const duplicate = multiSourceOverlayFixture();
  duplicate.colleges[0].sourceIds = [
    "fixture-cds-2025-26",
    "fixture-cds-2025-26",
  ];
  assert.throws(
    () => validateInstitutionOverlays(duplicate),
    /sourceIds contains duplicate source fixture-cds-2025-26/,
  );

  const redundantSingleSource = derivedAdmissionsFixture();
  redundantSingleSource.colleges[0].sourceIds = ["fixture-cds-2025-26"];
  assert.throws(
    () => validateInstitutionOverlays(redundantSingleSource),
    /sourceIds must declare at least two sources/,
  );

  const unreviewedArtifact = multiSourceOverlayFixture();
  const secondSource = unreviewedArtifact.sources[1];
  for (const field of [
    "artifactUrl",
    "artifactSha256",
    "artifactKind",
    "allowedArtifactHosts",
    "review",
  ]) {
    delete secondSource[field];
  }
  assert.throws(
    () => validateInstitutionOverlays(unreviewedArtifact),
    /multi-source overlay requires a refresh-verifiable, approved artifact for source fixture-outcomes-2025-26/,
  );
});

for (const [field, mismatchedValue] of [
  ["reportingYear", 2024],
  ["periodLabel", "Fall 2024"],
  ["cohort", "Fall 2024 first-time, first-year degree-seeking applicants"],
  ["finality", "finalized"],
]) {
  test(`admit-rate inputs reject a ${field} mismatch`, () => {
    const dataset = derivedAdmissionsFixture();
    dataset.colleges[0].observations.admitRate[field] = mismatchedValue;

    assert.throws(
      () => validateInstitutionOverlays(dataset),
      new RegExp(`admit-rate inputs must share ${field}`),
    );
  });

  test(`yield-rate inputs reject a ${field} mismatch`, () => {
    const dataset = derivedAdmissionsFixture();
    dataset.colleges[0].observations.yieldRate[field] = mismatchedValue;

    assert.throws(
      () => validateInstitutionOverlays(dataset),
      new RegExp(`yield-rate inputs must share ${field}`),
    );
  });
}

test("an observation cannot override its college source lineage", () => {
  const dataset = derivedAdmissionsFixture();
  dataset.colleges[0].observations.admitRate.sourceId = "different-source";

  assert.throws(
    () => validateInstitutionOverlays(dataset),
    /admitRate sourceId must match college sourceId fixture-cds-2025-26/,
  );
});

test("a derived rate cannot omit its source observations", () => {
  const missingApplicants = derivedAdmissionsFixture();
  delete missingApplicants.colleges[0].observations.applicants;
  assert.throws(
    () => validateInstitutionOverlays(missingApplicants),
    /derived admitRate requires applicants and admits/,
  );

  const missingEnrollees = derivedAdmissionsFixture();
  delete missingEnrollees.colleges[0].observations.enrollees;
  assert.throws(
    () => validateInstitutionOverlays(missingEnrollees),
    /derived yieldRate requires admits and enrollees/,
  );
});

test("HTML artifact hashing ignores volatile asset versions and edge challenges", () => {
  const first = new TextEncoder().encode(
    '<!-- This site is optimized with the Yoast SEO plugin v27.6 - https://yoast.com/product/yoast-seo-wordpress/ --><link href="app.css?ver=123"><main>stable evidence</main><script>(function(){function c(){var b=a.contentDocument;token="one"}</script></body>',
  );
  const second = new TextEncoder().encode(
    '<!-- This site is optimized with the Yoast SEO plugin v28.2 - https://yoast.com/product/yoast-seo-wordpress/ --><link href="app.css?ver=456.7"><main>stable evidence</main><script>(function(){function c(){var b=a.contentDocument;token="two"}</script></body>',
  );
  const changed = new TextEncoder().encode(
    '<!-- This site is optimized with the Yoast SEO plugin v28.2 - https://yoast.com/product/yoast-seo-wordpress/ --><link href="app.css?ver=456.7"><main>changed evidence</main><script>(function(){function c(){var b=a.contentDocument;token="two"}</script></body>',
  );
  const contentAfterChallenge = new TextEncoder().encode(
    '<link href="app.css?ver=456.7"><main>stable evidence</main><script>(function(){function c(){var b=a.contentDocument;token="two"}</script><footer>new evidence</footer></body>',
  );

  const normalize = (bytes) =>
    artifactBytesForHash(
      bytes,
      "html-without-volatile-assets-and-edge-challenge",
    );
  assert.equal(sha256Hex(normalize(first)), sha256Hex(normalize(second)));
  assert.notEqual(sha256Hex(normalize(first)), sha256Hex(normalize(changed)));
  assert.notEqual(
    sha256Hex(normalize(first)),
    sha256Hex(normalize(contentAfterChallenge)),
  );
});
