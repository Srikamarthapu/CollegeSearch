import type { College, Observation } from "../lib/college-data";
import type { MatchCollege, MatchMetric } from "./scoring.ts";
import { collegeActions } from "../lib/college-actions.ts";

function metric(observation: Observation): MatchMetric {
  const { value, periodLabel, publisher, cohort, definition, comparabilityKey } = observation;
  return { value, periodLabel, publisher, cohort, definition, comparabilityKey };
}

/** Rankings use the same federal completion and enrollment populations.
 * Institution-specific current figures remain on the full college record. */
export function toMatchCollege(college: College): MatchCollege {
  const calculator = collegeActions(college.unitId)?.netPriceCalculator;
  const comparable = (key: "graduationRate" | "undergraduateEnrollment", expected: string) => {
    const primary = college.observations[key];
    const alternate = college.alternateObservations[key];
    if (primary.comparabilityKey === expected) return primary;
    if (alternate?.comparabilityKey === expected) return alternate;
    return { ...primary, value: null };
  };
  return {
    netPriceCalculator: calculator?.status === "verified" && calculator.url ? { url: calculator.url, note: calculator.note, checkedOn: calculator.checkedOn } : undefined,
    unitId: college.unitId, slug: college.slug, name: college.name,
    city: college.city, state: college.state, ownership: college.ownership, setting: college.setting,
    majors: college.majors.map(({ name, share, periodLabel }) => ({ name, share, periodLabel })),
    admitRate: metric(college.observations.admitRate),
    netPrice: metric(college.observations.averageNetPrice),
    graduationRate: metric(comparable("graduationRate", "completion.four-year-institution.150-percent")),
    enrollment: metric(comparable("undergraduateEnrollment", "undergraduate-enrollment.degree-certificate-seeking")),
    medianEarnings: metric(college.observations.medianEarnings),
  };
}
