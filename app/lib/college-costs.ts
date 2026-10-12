import type { Observation } from "./college-data";

export type CollegeCosts = {
  tuitionInState: Observation;
  tuitionOutOfState: Observation;
  feesInState: Observation;
  feesOutOfState: Observation;
  feeBasis: "required" | "allowance";
};

export function assertCollegeCosts(costs: CollegeCosts, name: string) {
  if (!["required", "allowance"].includes(costs.feeBasis)) throw new Error(`${name}: invalid fee basis.`);
  for (const key of ["tuitionInState", "tuitionOutOfState", "feesInState", "feesOutOfState"] as const) {
    const observation = costs[key];
    if (!observation || observation.unit !== "usd" ||
      !["reported", "derived", "suppressed", "unavailable", "stale"].includes(observation.status) ||
      !["snapshot", "provisional", "finalized"].includes(observation.finality) ||
      !Number.isInteger(observation.reportingYear) || observation.reportingYear < 1900 ||
      (observation.value !== null && (!Number.isFinite(observation.value) || observation.value < 0)) ||
      (observation.value === null) !== ["unavailable", "suppressed"].includes(observation.status) ||
      !observation.sourceField || !observation.periodLabel || !observation.definition ||
      !observation.comparabilityKey || !observation.cohort || !observation.publisher ||
      !observation.sourceId || !observation.sourceName || !/^https:\/\//.test(observation.sourceUrl) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(observation.accessedOn)) {
      throw new Error(`${name}: incomplete or invalid ${key} evidence.`);
    }
  }
}
