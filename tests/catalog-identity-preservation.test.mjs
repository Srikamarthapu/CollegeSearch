import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const original = JSON.parse(await readFile(new URL("./fixtures/original-college-identities.json", import.meta.url), "utf8"));
const dataset = JSON.parse(await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"));

test("catalog additions preserve every original saved ID and bookmarked profile", () => {
  const byId = new Map(dataset.colleges.map((college) => [college.unitId, college]));
  assert.equal(original.length, 50, "the immutable baseline contains the original release");
  assert.equal(byId.size, dataset.colleges.length, "no duplicate institution IDs");
  assert.equal(new Set(dataset.colleges.map((college) => college.slug)).size, dataset.colleges.length, "no duplicate profile URLs");
  for (const college of original) {
    assert.equal(byId.get(college.unitId)?.slug, college.slug, `preserve saved institution ${college.unitId} and /colleges/${college.slug}`);
  }
});
