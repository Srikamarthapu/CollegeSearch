import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMISSIONS_FEATURED_LIMIT,
  ADMISSIONS_SEARCH_LIMIT,
  admissionsSearchResults,
  initialAdmissionsColleges,
  toChancesCollege,
} from "../app/chances/admissions-record.ts";
import {
  admissionsQueryChanged,
  normalizeAdmissionsQuery,
} from "../app/chances/admissions-query.ts";
import type { College } from "../app/lib/college-data.ts";
import { FEATURED_DIRECTORY_UNIT_IDS } from "../app/lib/college-directory-state.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: College[] };
const admissionsColleges = dataset.colleges.map(toChancesCollege);

test("admissions search returns a bounded featured set and bounded directory matches", () => {
  const featured = admissionsSearchResults(
    admissionsColleges,
    "",
    FEATURED_DIRECTORY_UNIT_IDS,
  );
  assert.equal(featured.length, ADMISSIONS_FEATURED_LIMIT);
  assert.deepEqual(
    featured.map((college) => college.unitId),
    FEATURED_DIRECTORY_UNIT_IDS.slice(0, ADMISSIONS_FEATURED_LIMIT),
  );

  const california = admissionsSearchResults(
    admissionsColleges,
    "California",
    FEATURED_DIRECTORY_UNIT_IDS,
  );
  assert.equal(california.length, ADMISSIONS_SEARCH_LIMIT);
  assert.ok(california.length <= ADMISSIONS_SEARCH_LIMIT);
  assert.ok(california.every((college) => college.state === "CA"));

  const boston = admissionsSearchResults(
    admissionsColleges,
    "Boston",
    FEATURED_DIRECTORY_UNIT_IDS,
  );
  assert.ok(boston.length > 1);
  assert.ok(boston.every((college) => college.city === "Boston"));
});

test("admissions search preserves aliases and complete source facts", () => {
  const [ucla] = admissionsSearchResults(
    admissionsColleges,
    "UCLA",
    FEATURED_DIRECTORY_UNIT_IDS,
  );
  assert.equal(ucla.unitId, 110662);
  assert.equal(ucla.publisher, "University of California");
  assert.ok(ucla.sourceUrl.startsWith("https://"));
  assert.ok(ucla.definition.length > 0);
});

test("initial admissions data retains valid URL selections without shipping the catalog", () => {
  const initial = initialAdmissionsColleges(
    admissionsColleges,
    [188915, 99999999],
    FEATURED_DIRECTORY_UNIT_IDS,
  );
  assert.equal(initial[0].unitId, 188915);
  assert.equal(initial.some((college) => college.unitId === 99999999), false);
  assert.ok(initial.length <= ADMISSIONS_FEATURED_LIMIT + 4);
  assert.equal(new Set(initial.map((college) => college.unitId)).size, initial.length);
});

test("equivalent raw admissions queries do not invalidate the active search", () => {
  assert.equal(admissionsQueryChanged("UCLA", "ucla "), false);
  assert.equal(admissionsQueryChanged("New-York", "new york"), false);
  assert.equal(admissionsQueryChanged("UCLA", "USC"), true);
  assert.equal(normalizeAdmissionsQuery("  UC–Berkeley  "), "uc berkeley");
});
