import { attachCostEvidence } from "./helpers/college-cost-fixture.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatObservation,
  compactName,
  observationSourceKind,
  projectCollegesForClient,
} from "../app/lib/college-client-record.ts";
import type { College } from "../app/lib/college-data.ts";
import { toMatchCollege } from "../app/match/college-record.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: College[] };
const projected = projectCollegesForClient(attachCostEvidence(dataset.colleges));

test("display names skip federal missing-value aliases while keeping student-facing aliases", () => {
  const alabamaState = dataset.colleges.find((college) => college.unitId === 100724)!;
  const berkeley = dataset.colleges.find((college) => college.slug === "university-of-california-berkeley")!;
  assert.equal(compactName(projectCollegesForClient(attachCostEvidence([alabamaState]))[0]), "Alabama State University");
  assert.equal(compactName(projectCollegesForClient(attachCostEvidence([berkeley]))[0]), "UC Berkeley");

  const adventHealth = dataset.colleges.find((college) => college.unitId === 133872)!;
  assert.ok(adventHealth.aliases.includes("Florida Hospital College"));
  assert.equal(compactName(projectCollegesForClient(attachCostEvidence([adventHealth]))[0]), "AdventHealth University");
  assert.equal(toMatchCollege(adventHealth).name, "AdventHealth University");
});

test("the client projection preserves every explorer evidence field", () => {
  assert.equal(projected.length, dataset.colleges.length);

  for (const [index, college] of dataset.colleges.entries()) {
    const clientCollege = projected[index];
    assert.equal(clientCollege.unitId, college.unitId);
    assert.equal(clientCollege.setting, college.setting);
    assert.equal(clientCollege.catalogCategory, college.catalogCategory);
    assert.deepEqual(clientCollege.aliases, college.aliases);
    assert.deepEqual(
      clientCollege.majors,
      college.majors.map(({ name, share, bachelorsAvailable, associatesAvailable }) => ({
        name,
        share,
        bachelorsAvailable,
        associatesAvailable,
      })),
    );

    for (const metric of [
      "admitRate",
      "averageNetPrice",
      "graduationRate",
      "undergraduateEnrollment",
      "medianEarnings",
      "tuitionOutOfState",
    ] as const) {
      const source = college.observations[metric];
      const client = clientCollege.observations[metric];
      assert.deepEqual(client, {
        value: source.value,
        unit: source.unit,
        periodLabel: source.periodLabel,
        sourceId: source.sourceId,
        publisher: source.publisher,
        sourceUrl: source.sourceUrl,
      });
      assert.equal(formatObservation(client), formatObservation(source));
      assert.deepEqual(
        observationSourceKind(client),
        observationSourceKind(source),
      );
    }
  }
});

test("the browser projection does not copy profile-only provenance", () => {
  const serialized = JSON.stringify(projected);

  assert.ok(
    serialized.length / projected.length < 4_000,
    "the expanded evidence projection averages below 4 KB per college",
  );
  assert.ok(
    JSON.stringify(projected.slice(0, 24)).length < 100_000,
    "the first 24-college page stays below 100 KB",
  );
  assert.ok(
    Math.max(...projected.map((college) => JSON.stringify(college).length)) < 6_000,
    "individual college records stay below 6 KB",
  );
  assert.doesNotMatch(serialized, /"sourceField"|"definition"|"cohort"/);
  assert.doesNotMatch(serialized, /"alternateObservations"|"release"/);
});
