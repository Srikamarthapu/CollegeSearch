import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CollegeDataset } from "../app/lib/college-data";
import { assertCollegeEvidence } from "../app/lib/college-evidence.ts";

const dataset = JSON.parse(readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8")) as CollegeDataset;

test("all published primary and alternate observations have registered evidence", () => {
  assert.doesNotThrow(() => assertCollegeEvidence(dataset));
});

test("invalid facts cannot silently render as reliable college evidence", () => {
  const mutations: Array<(copy: CollegeDataset) => void> = [
    (copy) => { copy.colleges[0].observations.admitRate.unit = "usd"; },
    (copy) => { copy.colleges[0].observations.admitRate.status = "invented" as never; },
    (copy) => { copy.colleges[0].observations.admitRate.accessedOn = "2026-02-31"; },
    (copy) => { copy.colleges[0].observations.admitRate.sourceId = "unknown-source"; },
    (copy) => { copy.colleges[0].observations.admitRate.sourceUrl = "https://unrelated.example/"; },
    (copy) => { copy.colleges[0].observations.admitRate.publisher = "Another university"; },
    (copy) => { copy.colleges[0].observations.admitRate.value = 1.5; },
    (copy) => { copy.colleges[0].observations.admitRate.value = null; },
    (copy) => { copy.colleges[0].observations.averageNetPrice.value = -1; },
    (copy) => { copy.colleges[0].observations.undergraduateEnrollment.value = 2.5; },
    (copy) => { copy.colleges[0].alternateObservations.admitRate = { ...copy.colleges[0].observations.admitRate, sourceId: "another-college" }; },
    (copy) => { copy.colleges[0].majors[0].sourceId = "unknown-source"; },
    (copy) => { copy.colleges[0].majors[0].sourceField = "PCIP11 + CIP52BACHL"; },
    (copy) => { copy.colleges[0].majors[0].deliveryMode = "all-programs-online" as never; },
    (copy) => { copy.release.sources.push(copy.release.sources[0]); },
    (copy) => { copy.colleges[1].slug = copy.colleges[0].slug; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(dataset);
    mutate(copy);
    assert.throws(() => assertCollegeEvidence(copy));
  }
});

test("honest unavailable and suppressed facts remain allowed", () => {
  for (const status of ["unavailable", "suppressed"] as const) {
    const copy = structuredClone(dataset);
    copy.colleges[0].observations.admitRate = { ...copy.colleges[0].observations.admitRate, value: null, status };
    assert.doesNotThrow(() => assertCollegeEvidence(copy));
  }
});
