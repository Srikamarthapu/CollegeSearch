import manifest from "../../data/college-actions.json" with { type: "json" };

export type CollegeAction = {
  label: string;
  publisherSourceUrl: string;
  checkedOn: string;
  status: string;
  url?: string;
  note?: string;
};
const actionsByUnitId = new Map(
  manifest.colleges.map((college) => [college.unitId, college.actions] as const),
);

export function collegeActions(unitId: number): Record<"admissions" | "deadlines" | "programs" | "netPriceCalculator", CollegeAction> | null {
  return actionsByUnitId.get(unitId) ?? null;
}
