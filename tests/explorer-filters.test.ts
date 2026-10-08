import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { College } from "../app/lib/college-data.ts";
import { projectCollegesForClient } from "../app/lib/college-client-record.ts";
import { attachCostEvidence } from "./helpers/college-cost-fixture.ts";
import {
  matchesAdvancedExplorerFilters,
  matchesEnrollmentBand,
} from "../app/lib/explorer-filters.ts";

const dataset = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
) as { colleges: College[] };
const colleges = projectCollegesForClient(attachCostEvidence(dataset.colleges));

test("undergraduate-size bands are mutually exclusive at their boundaries", () => {
  assert.equal(matchesEnrollmentBand(9_999, "small"), true);
  assert.equal(matchesEnrollmentBand(10_000, "small"), false);
  assert.equal(matchesEnrollmentBand(10_000, "medium"), true);
  assert.equal(matchesEnrollmentBand(24_999, "medium"), true);
  assert.equal(matchesEnrollmentBand(25_000, "medium"), false);
  assert.equal(matchesEnrollmentBand(25_000, "large"), true);
  assert.equal(matchesEnrollmentBand(null, "large"), false);
  assert.equal(matchesEnrollmentBand(25_000, "unexpected-band"), false);
});

test("advanced filters apply exact evidence thresholds and exclude missing values", () => {
  const filtered = colleges.filter((college) =>
    matchesAdvancedExplorerFilters(college, {
      maxTuition: 70_000,
      maxTuitionOnly: null,
      enrollmentBand: "large",
      minGraduation: 0.75,
      minEarnings: 75_000,
      setting: "City",
    }),
  );

  assert.ok(filtered.length > 0);
  assert.ok(
    filtered.every(
      (college) =>
        college.setting === "City" &&
        (college.observations.tuitionOutOfState.value ?? Infinity) <= 70_000 &&
        (college.observations.undergraduateEnrollment.value ?? 0) >= 25_000 &&
        (college.observations.graduationRate.value ?? 0) >= 0.75 &&
        (college.observations.medianEarnings.value ?? 0) >= 75_000,
    ),
  );
});

test("tuition-only thresholds read published tuition while legacy thresholds keep combined tuition", () => {
  const base = colleges[0];
  assert.ok(base);
  const college = {
    ...base,
    observations: {
      ...base.observations,
      tuitionOutOfState: { ...base.observations.tuitionOutOfState, value: 24_000 },
    },
    costs: {
      ...base.costs,
      tuitionOutOfState: { ...base.costs.tuitionOutOfState, value: 25_000 },
    },
  };
  const noOtherFilters = {
    maxTuition: null,
    maxTuitionOnly: 25_000,
    enrollmentBand: "" as const,
    minGraduation: null,
    minEarnings: null,
    setting: "",
  };

  assert.equal(matchesAdvancedExplorerFilters(college, noOtherFilters), true);
  assert.equal(
    matchesAdvancedExplorerFilters(college, { ...noOtherFilters, maxTuitionOnly: 24_999 }),
    false,
  );
  assert.equal(
    matchesAdvancedExplorerFilters(college, { ...noOtherFilters, maxTuition: 23_999, maxTuitionOnly: null }),
    false,
  );
  assert.equal(
    matchesAdvancedExplorerFilters(college, { ...noOtherFilters, maxTuition: 24_000, maxTuitionOnly: null }),
    true,
  );

  const missingTuitionOnly = {
    ...college,
    costs: {
      ...college.costs,
      tuitionOutOfState: { ...college.costs.tuitionOutOfState, value: null },
    },
  };
  assert.equal(
    matchesAdvancedExplorerFilters(missingTuitionOnly, noOtherFilters),
    false,
  );
});
