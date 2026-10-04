import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EMPTY_DIRECTORY_FILTERS,
  parseDirectoryFilters,
  serializeDirectoryFilters,
} from "../app/lib/college-directory-state.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: Array<{ majors: Array<{ name: string }>; state: string; ownership: string; setting: string }> };
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
