import assert from "node:assert/strict";
import test from "node:test";
import actions from "../data/college-actions.json" with { type: "json" };
import catalog from "../data/college-catalog.json" with { type: "json" };

const actionTypes = ["admissions", "deadlines", "programs", "netPriceCalculator"];
const expectedOverallVerified = { admissions: 93, deadlines: 87, programs: 95, netPriceCalculator: 89 };
const catalogById = new Map(catalog.institutions.map((institution) => [institution.unitId, institution]));
const newUnitIds = new Set(catalog.institutions.filter((institution) => !institution.retainedFromExistingCatalog).map((institution) => institution.unitId));

test("college resources cover the reviewed 100 identities with complete, explicit status rows", () => {
  assert.equal(actions.colleges.length, 100);
  assert.equal(new Set(actions.colleges.map((college) => college.unitId)).size, 100);
  assert.deepEqual(new Set(actions.colleges.map((college) => college.unitId)), new Set(catalogById.keys()));

  const overallVerified = Object.fromEntries(actionTypes.map((type) => [type, 0]));
  const newVerified = Object.fromEntries(actionTypes.map((type) => [type, 0]));
  const newUnavailable = Object.fromEntries(actionTypes.map((type) => [type, 0]));

  for (const college of actions.colleges) {
    const identity = catalogById.get(college.unitId);
    assert.ok(identity, `resource row UNITID ${college.unitId} is in the reviewed catalog`);
    assert.equal(college.slug, identity.slug, `resource row UNITID ${college.unitId} retains its canonical slug`);
    assert.deepEqual(Object.keys(college.actions).sort(), [...actionTypes].sort());
    for (const type of actionTypes) {
      const action = college.actions[type];
      assert.match(action.label, /\S/);
      assert.match(action.publisherSourceUrl, /^https:\/\//);
      assert.match(action.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
      if (action.status === "verified") {
        assert.match(action.url, /^https:\/\//, `${college.unitId} ${type} has a verified destination`);
        overallVerified[type] += 1;
        if (newUnitIds.has(college.unitId)) newVerified[type] += 1;
      } else {
        assert.equal(action.status, "unavailable", `${college.unitId} ${type} has a recognized status`);
        assert.equal("url" in action, false, `${college.unitId} ${type} does not expose an unverified destination`);
        assert.match(action.note, /\S/, `${college.unitId} ${type} explains why it is unavailable`);
        if (newUnitIds.has(college.unitId)) newUnavailable[type] += 1;
      }
      if (newUnitIds.has(college.unitId)) assert.equal(action.checkedOn, "2026-10-04");
    }
  }

  assert.deepEqual(overallVerified, expectedOverallVerified);
  assert.deepEqual(newVerified, { admissions: 48, deadlines: 42, programs: 47, netPriceCalculator: 41 });
  assert.deepEqual(newUnavailable, { admissions: 2, deadlines: 8, programs: 3, netPriceCalculator: 9 });
});
