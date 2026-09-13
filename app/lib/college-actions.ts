import manifest from "../../data/college-actions.json" with { type: "json" };

export type CollegeAction = {
  label: string;
  publisherSourceUrl: string;
  checkedOn: string;
  status: string;
  url?: string;
  note?: string;
};
export function collegeActions(unitId: number): Record<"admissions" | "deadlines" | "programs" | "netPriceCalculator", CollegeAction> | null {
  return manifest.colleges.find((college) => college.unitId === unitId)?.actions ?? null;
}
