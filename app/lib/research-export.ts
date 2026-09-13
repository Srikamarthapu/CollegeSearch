import type { ClientCollege } from "./college-client-record";
import { RESEARCH_CHECKLIST, STUDENT_LIST_ROLES, type ResearchNotebookData } from "./research-notebook.ts";

// Spreadsheet software can execute formulas even in quoted CSV cells.
export function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function researchCsv(colleges: ClientCollege[], notebooks: Record<number, ResearchNotebookData>, siteOrigin: string) {
  const origin = new URL(siteOrigin);
  if (!["https:", "http:"].includes(origin.protocol)) throw new Error("A full website origin is required for portable profile links.");
  const metricKeys = ["averageNetPrice", "admitRate", "graduationRate", "undergraduateEnrollment", "medianEarnings", "tuitionOutOfState"] as const;
  const labels = ["Average annual net price (USD)", "Overall admit rate (fraction)", "Completion rate (fraction; definitions differ)", "Undergraduate enrollment", "Median earnings (USD)", "Out-of-state tuition + required fees (USD)"];
  const header = ["College", "City", "State", "College profile", ...labels.flatMap((label) => [label, `${label}: period`, `${label}: source`]), "Research notes (browser only)", "Research steps checked", "List category (student assigned, not an admissions estimate)"];
  const rows = colleges.map((college) => [college.name, college.city, college.state, new URL(`/colleges/${college.slug}`, origin.origin).href,
    ...metricKeys.flatMap((key) => {
      const metric = college.observations[key];
      return [metric.value === null ? "Not reported" : String(metric.value), metric.periodLabel, metric.sourceUrl];
    }),
    notebooks[college.unitId]?.notes ?? "",
    RESEARCH_CHECKLIST.filter((item) => notebooks[college.unitId]?.checked.includes(item.id)).map((item) => item.label).join("; "),
    STUDENT_LIST_ROLES.find((role) => role.value === notebooks[college.unitId]?.listRole)?.label ?? "Not assessed",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
