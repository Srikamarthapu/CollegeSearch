import assert from "node:assert/strict";
import { collegeCostFixtures } from "./helpers/college-cost-fixture.ts";
import test from "node:test";
import {
  primaryTuitionMetric,
  cardTuitionMetrics,
  tuitionMetrics,
  combinedTuitionMetrics,
} from "../app/lib/tuition-labels.ts";

const colleges = collegeCostFixtures();

test("private college cost displays use one sourced standard price", () => {
  for (const college of colleges.filter((item) => item.ownership !== "Public")) {
    const metrics = combinedTuitionMetrics(college);
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].label, "Published tuition + required fees");
    assert.equal(metrics[0].observation, college.observations.tuitionOutOfState);
  }
});

test("federal in-district charges are not relabeled as verified in-state charges", () => {
  for (const college of colleges.filter((item) => item.ownership === "Public")) {
    const metrics = combinedTuitionMetrics(college);
    assert.equal(metrics.length, 2);
    const federal = college.observations.tuitionInState.sourceField === "TUITIONFEE_IN" && college.observations.tuitionInState.publisher === "U.S. Department of Education";
    assert.equal(metrics[0].label, federal ? "In-district tuition + required fees" : "In-state tuition + required fees");
    assert.equal(metrics[1].label, "Out-of-state tuition + required fees");
  }
});

test("the profile headline tuition metric states the public residency basis", () => {
  for (const college of colleges) {
    const metric = primaryTuitionMetric(college);
    assert.equal(metric.observation, college.costs.tuitionOutOfState);
    assert.equal(
      metric.label,
      college.ownership === "Public"
        ? "Out-of-state tuition"
        : "Published tuition",
    );
  }
});

test("cards lead with in-state tuition and retain a separate sourced out-of-state price", () => {
  const berkeley = colleges.find((college) => college.unitId === 110635)!;
  const metrics = cardTuitionMetrics(berkeley);
  assert.deepEqual(metrics.map(({ label, observation }) => [label, observation.value]), [
    ["In-state tuition", 14_202],
    ["Out-of-state tuition", 53_472],
  ]);
  assert.equal(metrics[0].observation, berkeley.costs.tuitionInState);
  assert.equal(metrics[1].observation, berkeley.costs.tuitionOutOfState);

  const stanford = colleges.find((college) => college.unitId === 243744)!;
  assert.deepEqual(cardTuitionMetrics(stanford), [
    { label: "Published tuition", observation: stanford.costs.tuitionOutOfState },
  ]);
  assert.equal(cardTuitionMetrics(stanford)[0].observation.value, 67_731);
});

test("cards do not replace missing in-state tuition with out-of-state or fee-inclusive charges", () => {
  const berkeley = colleges.find((college) => college.unitId === 110635)!;
  const missingResident = { ...berkeley, costs: {
    ...berkeley.costs,
    tuitionInState: { ...berkeley.costs.tuitionInState, value: null, periodLabel: "2024-2025" },
  } };
  const [resident, nonresident] = cardTuitionMetrics(missingResident);
  assert.equal(resident.observation.value, null);
  assert.equal(resident.observation.periodLabel, "2024-2025");
  assert.equal(nonresident.observation.value, 53_472);
  assert.equal(nonresident.observation.periodLabel, "2026-2027");
});

 test("tuition-only fields never substitute combined charges and fee allowances retain their basis", () => {
 for (const college of colleges) { const metrics = tuitionMetrics(college); assert.ok(metrics.some(m => m.observation === college.costs.tuitionOutOfState)); assert.ok(metrics.every(m => m.observation !== college.observations.tuitionOutOfState)); }
 const stanford = colleges.find(c => c.unitId === 243744)!; assert.equal(stanford.costs.tuitionOutOfState.value, 67731); assert.equal(stanford.costs.feesOutOfState.value, 2610); assert.equal(tuitionMetrics(stanford)[1].label, "Student fees allowance");
 const berkeley=colleges.find(c=>c.unitId===110635)!; assert.equal(berkeley.costs.tuitionInState.value,14202); assert.equal(berkeley.costs.tuitionOutOfState.value,53472);
});
