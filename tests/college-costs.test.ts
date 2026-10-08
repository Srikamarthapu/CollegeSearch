import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertCollegeCosts } from "../app/lib/college-costs.ts";
import { collegeCostFixtures } from "./helpers/college-cost-fixture.ts";
const colleges = collegeCostFixtures();
const overrides = JSON.parse(readFileSync(new URL("../data/college-cost-overrides.json", import.meta.url), "utf8"));

test("every catalog college has valid separate tuition and fee evidence without manufactured fallback", () => {
  assert.equal(colleges.length, 3912);
  for (const college of colleges) assertCollegeCosts(college.costs, college.name);
  const unknown = colleges.find(c => c.costs.tuitionOutOfState.value === null);
  assert.ok(unknown, "Unavailable separate tuition remains explicitly missing");
  assert.equal(unknown.costs.tuitionOutOfState.status, "unavailable");
});

test("official full budgets sum to their components and identify extra expenses", () => {
  for (const row of overrides.colleges) {
    assert.equal(row.budget.rows.reduce((total: number, item: [string, number]) => total + item[1], 0), row.budget.total);
    assert.match(row.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(row.budget.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(row.budget.sourceUrl, /^https:\/\//);
  }
  const stanford = overrides.colleges.find((row: {unitId: number}) => row.unitId === 243744);
  assert.equal(stanford.budget.total, 97545);
  assert.match(stanford.budget.notes, /Travel varies/);
  assert.match(stanford.budget.notes, /one-time/);
  assert.equal(stanford.costs.feeBasis, "allowance");
  const berkeley = overrides.colleges.find((row: {unitId: number}) => row.unitId === 110635);
  assert.equal(berkeley.costs.tuitionOutOfState.value, (7101 + 19635) * 2);
  assert.equal(berkeley.costs.feesOutOfState.value, (693 + 936 + 236 + 141) * 2);
  assert.equal(berkeley.budget.total + berkeley.budget.nonresidentSupplement, 93944);
});

test("invalid cost evidence fails closed", () => {
  const good = colleges[0].costs;
  assert.throws(() => assertCollegeCosts({...good, tuitionOutOfState: {...good.tuitionOutOfState, value: -1}}, "Example"));
  assert.throws(() => assertCollegeCosts({...good, tuitionOutOfState: {...good.tuitionOutOfState, value: null, status: "reported"}}, "Example"));
  assert.throws(() => assertCollegeCosts({...good, tuitionOutOfState: {...good.tuitionOutOfState, sourceUrl: "javascript:alert(1)"}}, "Example"));
});
