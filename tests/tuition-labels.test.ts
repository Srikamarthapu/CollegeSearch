import assert from "node:assert/strict";
import { collegeCostFixtures } from "./helpers/college-cost-fixture.ts";
import test from "node:test";
import {
  primaryTuitionMetric,
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

test("the default card tuition metric states the public residency basis", () => {
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

 test("tuition-only fields never substitute combined charges and fee allowances retain their basis", () => {
 for (const college of colleges) { const metrics = tuitionMetrics(college); assert.ok(metrics.some(m => m.observation === college.costs.tuitionOutOfState)); assert.ok(metrics.every(m => m.observation !== college.observations.tuitionOutOfState)); }
 const stanford = colleges.find(c => c.unitId === 243744)!; assert.equal(stanford.costs.tuitionOutOfState.value, 67731); assert.equal(stanford.costs.feesOutOfState.value, 2610); assert.equal(tuitionMetrics(stanford)[1].label, "Student fees allowance");
 const berkeley=colleges.find(c=>c.unitId===110635)!; assert.equal(berkeley.costs.tuitionInState.value,14202); assert.equal(berkeley.costs.tuitionOutOfState.value,53472);
});
