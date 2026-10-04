import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { College } from "../app/lib/college-data";
import { tuitionMetrics } from "../app/lib/tuition-labels.ts";

const colleges = JSON.parse(readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8")).colleges as College[];

test("private college cost displays use one sourced standard price", () => {
  for (const college of colleges.filter((item) => item.ownership !== "Public")) {
    const metrics = tuitionMetrics(college);
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].label, "Published tuition + required fees");
    assert.equal(metrics[0].observation, college.observations.tuitionOutOfState);
  }
});

test("federal in-district charges are not relabeled as verified in-state charges", () => {
  for (const college of colleges.filter((item) => item.ownership === "Public")) {
    const metrics = tuitionMetrics(college);
    assert.equal(metrics.length, 2);
    const federal = college.observations.tuitionInState.sourceField === "TUITIONFEE_IN" && college.observations.tuitionInState.publisher === "U.S. Department of Education";
    assert.equal(metrics[0].label, federal ? "In-district tuition + required fees" : "In-state tuition + required fees");
    assert.equal(metrics[1].label, "Out-of-state tuition + required fees");
  }
});
