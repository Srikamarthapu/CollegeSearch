import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { availableChancesCollegeOptions } from "../app/chances/college-options.ts";
import type { College } from "../app/lib/college-data.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: College[] };

const options = dataset.colleges.map(
  ({ unitId, name, aliases, city, state }) => ({
    unitId,
    name,
    aliases,
    city,
    state,
  }),
);

test("admit-rate selector resolves the aliases advertised in its search field", () => {
  assert.deepEqual(
    availableChancesCollegeOptions(options, [], "UCLA").map(
      (college) => college.unitId,
    ),
    [110662],
  );
  assert.deepEqual(
    availableChancesCollegeOptions(options, [], "USC").map(
      (college) => college.unitId,
    ),
    [123961],
  );
  assert.deepEqual(
    availableChancesCollegeOptions(options, [], "Caltech").map(
      (college) => college.unitId,
    ),
    [110404],
  );
});

test("admit-rate selector tolerates a one-edit college-name misspelling", () => {
  assert.deepEqual(
    availableChancesCollegeOptions(options, [], "caltec").map(
      (college) => college.unitId,
    ),
    [110404],
  );
  assert.deepEqual(
    availableChancesCollegeOptions(options, [], "stanfrd").map(
      (college) => college.unitId,
    ),
    [243744],
  );
});

test("admit-rate selector keeps selected colleges out of filtered options", () => {
  assert.deepEqual(
    availableChancesCollegeOptions(options, [110662], "UCLA"),
    [],
  );
});
