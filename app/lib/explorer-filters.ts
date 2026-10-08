import type { ClientCollege } from "@/app/lib/college-client-record";

export type EnrollmentBand = "" | "small" | "medium" | "large";

export type AdvancedExplorerFilters = {
  maxTuition: number | null;
  maxTuitionOnly: number | null;
  enrollmentBand: EnrollmentBand;
  minGraduation: number | null;
  minEarnings: number | null;
  setting: string;
};

function atMost(value: number | null, limit: number | null) {
  return limit === null || (value !== null && value <= limit);
}

function atLeast(value: number | null, minimum: number | null) {
  return minimum === null || (value !== null && value >= minimum);
}

export function matchesEnrollmentBand(
  value: number | null,
  band: string,
) {
  if (!band) return true;
  if (value === null) return false;
  if (band === "small") return value < 10_000;
  if (band === "medium") return value >= 10_000 && value < 25_000;
  if (band === "large") return value >= 25_000;
  return false;
}

export function matchesAdvancedExplorerFilters(
  college: ClientCollege,
  filters: AdvancedExplorerFilters,
) {
  return (
    atMost(
      college.observations.tuitionOutOfState.value,
      filters.maxTuition,
    ) &&
    atMost(
      college.costs.tuitionOutOfState.value,
      filters.maxTuitionOnly,
    ) &&
    matchesEnrollmentBand(
      college.observations.undergraduateEnrollment.value,
      filters.enrollmentBand,
    ) &&
    atLeast(
      college.observations.graduationRate.value,
      filters.minGraduation,
    ) &&
    atLeast(college.observations.medianEarnings.value, filters.minEarnings) &&
    (!filters.setting || college.setting === filters.setting)
  );
}
