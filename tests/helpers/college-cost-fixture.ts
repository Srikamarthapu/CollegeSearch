import { readFileSync } from "node:fs";
import type { College } from "../../app/lib/college-data";
import type { CollegeCosts } from "../../app/lib/college-costs";
const tuition = JSON.parse(readFileSync(new URL("../../data/college-tuition.json", import.meta.url), "utf8"));
const overrides = JSON.parse(readFileSync(new URL("../../data/college-cost-overrides.json", import.meta.url), "utf8"));
export function attachCostEvidence<T extends { unitId: number }>(colleges: T[]): Array<T & { costs: CollegeCosts }> {
  return colleges.map((college) => {
    const row = tuition.colleges.find((item: { unitId: number }) => item.unitId === college.unitId);
    if (!row) throw new Error(`Missing cost fixture ${college.unitId}`);
    const costs = overrides.colleges.find((item: { unitId: number }) => item.unitId === college.unitId)?.costs ?? {
      tuitionInState: row.tuition.inState, tuitionOutOfState: row.tuition.outOfState,
      feesInState: row.fees.inState, feesOutOfState: row.fees.outOfState, feeBasis: "required",
    };
    return { ...college, costs };
  });
}
export function collegeCostFixtures(): College[] {
  return attachCostEvidence(JSON.parse(readFileSync(new URL("../../data/colleges.json", import.meta.url), "utf8")).colleges);
}
