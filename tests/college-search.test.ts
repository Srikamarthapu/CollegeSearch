import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectCollegesForClient } from "../app/lib/college-client-record.ts";
import { filterCollegesByQuery } from "../app/lib/college-search.ts";
import type { College } from "../app/lib/college-data.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: College[] };
const clientColleges = projectCollegesForClient(dataset.colleges);

test("exact short aliases take precedence over broad substring matches", () => {
  const matches = filterCollegesByQuery(clientColleges, "Cal");
  assert.deepEqual(matches.map((college) => college.unitId), [110635]);
});

test("canonical aliases and one-edit misspellings resolve college identity", () => {
  assert.equal(filterCollegesByQuery(clientColleges, "Caltech")[0]?.unitId, 110404);
  assert.equal(filterCollegesByQuery(clientColleges, "stanfrd")[0]?.unitId, 243744);
});

test("short field aliases filter by actual broad-field evidence", () => {
  const matches = filterCollegesByQuery(clientColleges, "cs");
  assert.ok(matches.length > 0);
  assert.ok(
    matches.every((college) =>
      college.majors.some(
        (major) => major.name === "Computing & Information Sciences",
      ),
    ),
  );
});

test("combined fuzzy field and location queries preserve both intents", () => {
  const matches = filterCollegesByQuery(
    clientColleges,
    "computer scince in California",
  );
  assert.ok(matches.length > 0);
  assert.ok(matches.every((college) => college.state === "CA"));
  assert.ok(
    matches.every((college) =>
      college.majors.some(
        (major) => major.name === "Computing & Information Sciences",
      ),
    ),
  );
});
