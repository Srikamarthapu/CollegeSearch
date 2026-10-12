import type { College } from "../lib/college-data.ts";
import { toMatchCollege } from "./college-record.ts";
import type { MatchCollege } from "./scoring.ts";

/**
 * Project the existing Find My Fit population for build-time use.
 * Keep this eligibility rule in sync with the previous API projection:
 * four-year institutions with undergraduate offerings only.
 */
export function projectEligibleMatchColleges(
  colleges: readonly College[],
): MatchCollege[] {
  return colleges
    .filter(
      (college) =>
        college.institutionLevel === "Four-year" &&
        college.undergraduateOffering,
    )
    .map(toMatchCollege);
}
