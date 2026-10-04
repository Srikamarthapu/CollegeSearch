import type { College, CollegeDataset, Observation } from "../college-data";
import type { AdviserPreferences } from "./contracts.ts";

export type AdviserCitation = {
  sourceId: string; name: string; publisher: string; url: string;
  year: number; period: string; cohort: string; definition: string; checkedOn: string; field: string;
};
export type AdviserFact = { key: string; label: string; display: string; citation: AdviserCitation };
export type AdviserRecommendation = {
  unitId: number; slug: string; name: string; city: string; state: string; ownership: string;
  reasons: string[]; tradeoffs: string[]; facts: AdviserFact[];
  fields: Array<{ name: string; qualification: string; citation: AdviserCitation }>;
};

const labels: Record<string, string> = {
  undergraduateEnrollment: "Undergraduates", averageNetPrice: "Historical average net price / year",
  admitRate: "Historical overall admission rate", graduationRate: "Graduation rate",
  tuitionOutOfState: "Nonresident tuition & required fees / year", tuitionInState: "Resident tuition & required fees / year",
};
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function usableAdviserObservation(value: Observation | null | undefined): value is Observation & { value: number } {
  return !!value && typeof value.value === "number" && Number.isFinite(value.value) &&
    (value.status === "reported" || value.status === "derived");
}

export function adviserTuition(college: College, preferences: AdviserPreferences): { key: "tuitionInState" | "tuitionOutOfState"; observation: Observation; label: string } | null {
  if (college.ownership !== "Public") {
    const observation = college.observations.tuitionOutOfState;
    return usableAdviserObservation(observation) ? { key: "tuitionOutOfState", observation, label: "Published tuition & required fees / year" } : null;
  }
  if (!preferences.residencyState) return null;
  const key = college.state === preferences.residencyState ? "tuitionInState" : "tuitionOutOfState";
  const observation = college.observations[key];
  if (!usableAdviserObservation(observation) || (key === "tuitionInState" && observation.comparabilityKey === "tuition-fees.in-district")) return null;
  return { key, observation, label: labels[key] };
}

export function adviserNetPriceApplies(college: College, preferences: AdviserPreferences): boolean {
  const observation = college.observations.averageNetPrice;
  return usableAdviserObservation(observation) &&
    (college.ownership !== "Public" || preferences.residencyState === college.state);
}

export function publicCollegeCandidates(colleges: College[], preferences: AdviserPreferences, explicitIds: number[] = []): College[] {
  return colleges.filter((college) => {
    if (explicitIds.length && !explicitIds.includes(college.unitId)) return false;
    if (preferences.states.length && !preferences.states.includes(college.state)) return false;
    if (preferences.ownership && college.ownership !== preferences.ownership) return false;
    if (preferences.fields.length && !preferences.fields.every((field) => college.majors.some((major) => major.name === field && (major.bachelorsAvailable || major.associatesAvailable === true)))) return false;
    // Numeric campus-size and price constraints are applied by the fact SQL RPC.
    return true;
  });
}

function citation(observation: Observation): AdviserCitation {
  return { sourceId: observation.sourceId, name: observation.sourceName, publisher: observation.publisher,
    url: observation.sourceUrl, year: observation.reportingYear, period: observation.periodLabel,
    cohort: observation.cohort, definition: observation.definition, checkedOn: observation.accessedOn, field: observation.sourceField };
}

function fact(key: string, observation: Observation, label = labels[key]): AdviserFact | null {
  if (!usableAdviserObservation(observation)) return null;
  return { key, label, display: observation.unit === "usd" ? currency.format(observation.value) :
    observation.unit === "ratio" ? percent.format(observation.value) : observation.value.toLocaleString("en-US"),
  citation: citation(observation) };
}

/** Render factual language from reviewed observations, never from generated prose. */
export function buildAdviserRecommendation(college: College, preferences: AdviserPreferences, dataset: CollegeDataset): AdviserRecommendation {
  const reasons: string[] = [];
  const tradeoffs: string[] = [];
  const selectedFields = college.majors.filter((major) => preferences.fields.includes(major.name as typeof preferences.fields[number]));
  if (selectedFields.length) reasons.push(`Reports degree programs in ${selectedFields.map((major) => `${major.name} (${major.degreeLevel === "bachelors-and-associate" ? "bachelor's and associate" : major.degreeLevel === "associate" ? "associate" : "bachelor's"})`).join(" and ")} (broad federal fields).`);
  if (preferences.states.includes(college.state)) reasons.push(`Located in ${college.city}, ${college.state}, within your selected states.`);
  if (preferences.ownership === college.ownership) reasons.push(`Matches your ${college.ownership.toLowerCase()} college preference.`);
  const enrollment = college.observations.undergraduateEnrollment;
  if (preferences.size && usableAdviserObservation(enrollment)) {
    const matches = preferences.size === "small" ? enrollment.value < 5000 : preferences.size === "medium" ? enrollment.value >= 5000 && enrollment.value <= 15000 : enrollment.value > 15000;
    if (matches) reasons.push(`Its reported undergraduate enrollment is within your ${preferences.size} campus range.`);
  }
  const tuition = adviserTuition(college, preferences);
  const facts: AdviserFact[] = [];
  for (const key of ["undergraduateEnrollment", "admitRate", "graduationRate"] as const) {
    const item = fact(key, college.observations[key]);
    if (item) facts.push(item);
  }
  if (tuition) {
    const item = fact(tuition.key, tuition.observation, tuition.label);
    if (item) facts.push(item);
  } else if (college.ownership === "Public") {
    tradeoffs.push(preferences.residencyState === college.state ? "A comparable resident tuition figure is not verified here; the federal in-district figure may differ. Check the college's cost page." : "Choose your residency state before comparing public-college tuition.");
  }
  if (adviserNetPriceApplies(college, preferences)) {
    const item = fact("averageNetPrice", college.observations.averageNetPrice);
    if (item) facts.push(item);
  } else if (college.ownership === "Public") tradeoffs.push("The federal public-college average net price describes students paying resident tuition; it is not shown as your expected price.");
  if (preferences.annualBudget !== null) {
    const selected = preferences.budgetBasis === "tuition" ? tuition?.observation : preferences.budgetBasis === "average-net-price" && adviserNetPriceApplies(college, preferences) ? college.observations.averageNetPrice : null;
    if (usableAdviserObservation(selected) && selected.value <= preferences.annualBudget) reasons.push(`Its published ${preferences.budgetBasis === "tuition" ? "tuition and required fees" : "historical average net price"} is within the amount you entered for that measure.`);
  }
  tradeoffs.push("Tuition excludes housing, food, travel and other expenses. Historical net price is not an individual aid estimate.");
  if (!usableAdviserObservation(college.observations.admitRate)) tradeoffs.push("An overall admission rate is not available in the reviewed data.");
  if (selectedFields.length) tradeoffs.push("Broad fields do not confirm a specific major, concentration, delivery option or major-specific admission rate. Verify the exact program with the college.");
  const fields = selectedFields.map((major) => {
    const source = dataset.release.sources.find((entry) => entry.id === major.sourceId);
    if (!source) throw new Error("Unbound program evidence.");
    return { name: major.name, qualification: major.evidence, citation: {
      sourceId: source.id, name: source.sourceName, publisher: source.publisher, url: source.sourceUrl,
      year: major.reportingYear, period: major.periodLabel, cohort: major.cohort, definition: major.definition,
      checkedOn: source.accessedOn, field: major.sourceField,
    } };
  });
  return { unitId: college.unitId, slug: college.slug, name: college.name, city: college.city, state: college.state,
    ownership: college.ownership, reasons, tradeoffs, facts, fields };
}
