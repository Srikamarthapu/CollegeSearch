import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatObservation,
  observationSourceKind,
  projectCollegesForClient,
} from "../app/lib/college-client-record.ts";
import type { College } from "../app/lib/college-data.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: College[] };
const projected = projectCollegesForClient(dataset.colleges);

test("the client projection preserves every explorer evidence field", () => {
  assert.equal(projected.length, dataset.colleges.length);

  for (const [index, college] of dataset.colleges.entries()) {
    const clientCollege = projected[index];
    assert.equal(clientCollege.unitId, college.unitId);
    assert.deepEqual(clientCollege.aliases, college.aliases);
    assert.deepEqual(
      clientCollege.majors,
      college.majors.map(({ name, share }) => ({ name, share })),
    );

    for (const metric of [
      "admitRate",
      "averageNetPrice",
      "graduationRate",
      "undergraduateEnrollment",
      "medianEarnings",
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

  assert.ok(serialized.length < 125_000, "projection stays compact");
  assert.doesNotMatch(serialized, /"sourceField"|"definition"|"cohort"/);
  assert.doesNotMatch(serialized, /"alternateObservations"|"release"/);
});
