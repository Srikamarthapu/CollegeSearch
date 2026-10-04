import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertCollegeMatchesCatalog,
  assertScorecardRowMatchesCatalog,
  collegeCatalog,
  collegeCatalogByUnitId,
} from "../scripts/lib/college-catalog.mjs";
import { censusRegionForState, usCensusRegionCodes } from "../scripts/lib/us-census-regions.mjs";
import { collegeCatalogCategories } from "../app/lib/catalog-categories.ts";

const originalIdentities = JSON.parse(
  await readFile(new URL("./fixtures/original-college-identities.json", import.meta.url), "utf8"),
);

test("reviewed catalog contains 100 unique institutions with explicit reasons", () => {
  assert.equal(collegeCatalog.length, 100);
  assert.equal(new Set(collegeCatalog.map((college) => college.unitId)).size, 100);
  assert.equal(new Set(collegeCatalog.map((college) => college.slug)).size, 100);
  assert.equal(new Set(collegeCatalog.map((college) => college.expectedName)).size, 100);
  assert.ok(collegeCatalog.every((college) => college.inclusionReason.length >= 20));
  assert.ok(collegeCatalog.every((college) => collegeCatalogCategories.includes(college.catalogCategory)));
  assert.deepEqual(
    Object.fromEntries(
      collegeCatalogCategories.map((category) => [
        category,
        collegeCatalog.filter((college) => college.catalogCategory === category).length,
      ]),
    ),
    {
      "existing-curated": 50,
      "csu-campus": 12,
      "major-public": 15,
      "regional-public": 13,
      "private-nonprofit": 10,
    },
  );
});

test("every original UNITID keeps its public slug", () => {
  for (const original of originalIdentities) {
    const current = collegeCatalogByUnitId.get(original.unitId);
    assert.ok(current, `retains UNITID ${original.unitId}`);
    assert.equal(current.slug, original.slug, `retains slug for UNITID ${original.unitId}`);
    assert.equal(current.retainedFromExistingCatalog, true);
  }
});

test("every state and DC maps explicitly to a Census region", () => {
  assert.equal(usCensusRegionCodes.length, 51);
  assert.deepEqual(
    Object.fromEntries(
      ["Northeast", "Midwest", "South", "West"].map((region) => [
        region,
        usCensusRegionCodes.filter((state) => censusRegionForState(state) === region).length,
      ]),
    ),
    { Northeast: 9, Midwest: 12, South: 17, West: 13 },
  );
  assert.throws(() => censusRegionForState("PR"), /No Census region/);
});

test("Scorecard identity checks allow bachelor's-level institutions and reject drift", () => {
  const pomona = collegeCatalogByUnitId.get(121345);
  assert.ok(pomona);
  assert.doesNotThrow(() => assertScorecardRowMatchesCatalog({
    UNITID: "121345",
    INSTNM: pomona.expectedName,
    STABBR: pomona.state,
    CONTROL: String(pomona.scorecardControl),
    MAIN: "1",
    CURROPER: "1",
    HIGHDEG: "3",
    NUMBRANCH: "1",
  }));
  assert.throws(() => assertScorecardRowMatchesCatalog({
    UNITID: "121345",
    INSTNM: pomona.expectedName,
    STABBR: "NY",
    CONTROL: String(pomona.scorecardControl),
    MAIN: "1",
    CURROPER: "1",
    HIGHDEG: "3",
    NUMBRANCH: "1",
  }), /identity or eligibility changed/);
  assert.throws(() => assertScorecardRowMatchesCatalog({
    UNITID: "121345",
    INSTNM: pomona.expectedName,
    STABBR: pomona.state,
    CONTROL: "3",
    MAIN: "1",
    CURROPER: "1",
    HIGHDEG: "4",
    NUMBRANCH: "1",
  }), /identity or eligibility changed/);
  assert.throws(() => assertScorecardRowMatchesCatalog({
    UNITID: "121345",
    INSTNM: pomona.expectedName,
    STABBR: pomona.state,
    CONTROL: String(pomona.scorecardControl),
    MAIN: "1",
    CURROPER: "1",
    HIGHDEG: "99",
    NUMBRANCH: "1",
  }), /identity or eligibility changed/);
});

test("generated rows must match their reviewed aliases, slug, and rationale", () => {
  const manifestEntry = collegeCatalog[0];
  const generated = {
    unitId: manifestEntry.unitId,
    name: manifestEntry.expectedName,
    slug: manifestEntry.slug,
    state: manifestEntry.state,
    ownership: manifestEntry.scorecardControl === 1 ? "Public" : "Private nonprofit",
    aliases: [...manifestEntry.aliases],
    catalogCategory: manifestEntry.catalogCategory,
    inclusionReason: manifestEntry.inclusionReason,
  };
  assert.equal(assertCollegeMatchesCatalog(generated), manifestEntry);
  assert.throws(
    () => assertCollegeMatchesCatalog({ ...generated, slug: "renamed-profile" }),
    /does not match the reviewed catalog manifest/,
  );
});
