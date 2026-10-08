import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { College } from "../app/lib/college-data.ts";
import {
  DEFAULT_DIRECTORY_SORT,
  EMPTY_DIRECTORY_FILTERS,
  FEATURED_DIRECTORY_UNIT_IDS,
  hasCompleteDirectoryData,
  parseDirectoryFilters,
  reconcileDirectorySelection,
  sortDirectoryColleges,
  serializeDirectoryFilters,
} from "../app/lib/college-directory-state.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: College[] };
const options = {
  majorOptions: [...new Set(dataset.colleges.flatMap((college) => college.majors.map((major) => major.name)))].sort(),
  states: [...new Set(dataset.colleges.map((college) => college.state))].sort(),
  ownerships: ["Public", "Private nonprofit", "Private for-profit"].filter((ownership) =>
    dataset.colleges.some((college) => college.ownership === ownership),
  ),
  settings: [...new Set(dataset.colleges.map((college) => college.setting))].filter((setting) => setting !== "Setting unavailable").sort(),
};

test("the directory exposes and preserves all 38 current federal broad fields", () => {
  assert.equal(options.majorOptions.length, 38);
  for (const major of options.majorOptions) {
    const parsed = parseDirectoryFilters(new URLSearchParams(new URLSearchParams({ major }).toString()), options);
    assert.equal(parsed.major, major);
    const roundTrip = parseDirectoryFilters(serializeDirectoryFilters({ ...EMPTY_DIRECTORY_FILTERS, major }), options);
    assert.equal(roundTrip.major, major);
  }
});

test("directory URL state supports territories, all ownership classes, institution level, and comparison state", () => {
  assert.deepEqual(["AS", "GU", "MP", "PR", "VI"].filter((state) => options.states.includes(state)), ["AS", "GU", "MP", "PR", "VI"]);
  assert.ok(options.ownerships.includes("Private for-profit"));
  assert.deepEqual(options.ownerships, ["Public", "Private nonprofit", "Private for-profit"]);
  const filters = {
    ...EMPTY_DIRECTORY_FILTERS,
    major: options.majorOptions[0],
    stateCode: "GU",
    ownership: "Private for-profit",
    institutionLevel: "Two-year" as const,
    setting: "Rural",
  };
  const parsed = parseDirectoryFilters(serializeDirectoryFilters(filters, [100654, 110486]), options);
  assert.equal(parsed.major, filters.major);
  assert.equal(parsed.stateCode, "GU");
  assert.equal(parsed.ownership, "Private for-profit");
  assert.equal(parsed.institutionLevel, "Two-year");
  assert.equal(parsed.setting, "Rural");
  assert.equal(serializeDirectoryFilters(filters, [100654, 110486]).get("compare"), "100654,110486");
});

test("the default directory sort uses the documented editorial featured set, then stable alphabetical order", () => {
  assert.equal(EMPTY_DIRECTORY_FILTERS.sort, DEFAULT_DIRECTORY_SORT);
  assert.deepEqual(FEATURED_DIRECTORY_UNIT_IDS.slice(0, 3), [
    110635,
    110662,
    243744,
  ]);
  assert.equal(
    parseDirectoryFilters(new URLSearchParams(), options).sort,
    DEFAULT_DIRECTORY_SORT,
  );

  const sorted = sortDirectoryColleges(
    dataset.colleges,
    DEFAULT_DIRECTORY_SORT,
    "",
  );
  assert.deepEqual(
    sorted.slice(0, FEATURED_DIRECTORY_UNIT_IDS.length).map((college) => college.unitId),
    FEATURED_DIRECTORY_UNIT_IDS,
  );

  const remainingNames = sorted
    .slice(FEATURED_DIRECTORY_UNIT_IDS.length)
    .map((college) => college.name);
  assert.deepEqual(
    remainingNames,
    [...remainingNames].sort((left, right) =>
      left.localeCompare(right, "en", { sensitivity: "base" }),
    ),
  );
  assert.equal(serializeDirectoryFilters(EMPTY_DIRECTORY_FILTERS).has("sort"), false);
});

test("default sorting keeps search match order and explicit alphabetical URLs survive the new default", () => {
  const featuredSearchMatches = dataset.colleges.filter((college) =>
    [110635, 243744].includes(college.unitId),
  );
  const result = sortDirectoryColleges(
    featuredSearchMatches,
    DEFAULT_DIRECTORY_SORT,
    "",
    new Map([[243744, 0], [110635, 1]]),
  );
  assert.deepEqual(result.map((college) => college.unitId), [243744, 110635]);

  const explicitNameSort = { ...EMPTY_DIRECTORY_FILTERS, sort: "name" };
  const serialized = serializeDirectoryFilters(explicitNameSort);
  assert.equal(serialized.get("sort"), "name");
  assert.equal(parseDirectoryFilters(serialized, options).sort, "name");
});

test("published tuition sorting is explicit while legacy net-price URLs retain their meaning", () => {
  const tuitionSort = parseDirectoryFilters(
    new URLSearchParams({ sort: "tuition" }),
    options,
  );
  assert.equal(tuitionSort.sort, "tuition");
  const byTuition = sortDirectoryColleges(dataset.colleges, "tuition", "");
  const tuitionValues = byTuition
    .map((college) => college.observations.tuitionOutOfState.value)
    .filter((value): value is number => value !== null);
  assert.deepEqual(tuitionValues, [...tuitionValues].sort((left, right) => left - right));

  const legacyNetPriceSort = parseDirectoryFilters(
    new URLSearchParams({ sort: "price" }),
    options,
  );
  assert.equal(legacyNetPriceSort.sort, "price");
  const byNetPrice = sortDirectoryColleges(dataset.colleges, "price", "");
  const netPriceValues = byNetPrice
    .map((college) => college.observations.averageNetPrice.value)
    .filter((value): value is number => value !== null);
  assert.deepEqual(netPriceValues, [...netPriceValues].sort((left, right) => left - right));
});

test("complete directory records include the tuition metric shown as the card headline", () => {
  const missingTuition = dataset.colleges.find(
    (college) => college.unitId === 188915,
  );
  const complete = dataset.colleges.find(
    (college) => college.unitId === 110635,
  );
  assert.ok(missingTuition);
  assert.ok(complete);
  assert.equal(missingTuition.observations.tuitionOutOfState.value, null);
  assert.equal(hasCompleteDirectoryData(missingTuition), false);
  assert.equal(hasCompleteDirectoryData(complete), true);
});

test("directory selection removes rejected IDs without dropping newer choices", () => {
  assert.deepEqual(
    reconcileDirectorySelection(
      [99999999, 110635],
      [99999999, 110635],
      [110635],
    ),
    [110635],
  );
  assert.deepEqual(
    reconcileDirectorySelection(
      [99999999, 110635, 243744],
      [99999999, 110635],
      [110635],
    ),
    [110635, 243744],
  );
});
