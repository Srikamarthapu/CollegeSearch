export type PlannerTab = "colleges" | "deadlines";

export const plannerTabs: readonly PlannerTab[] = ["colleges", "deadlines"];

export function plannerTabFromHash(hash: string): PlannerTab {
  return hash.toLowerCase() === "#deadlines" ? "deadlines" : "colleges";
}

export function plannerTabFromKey(
  current: PlannerTab,
  key: string,
): PlannerTab | null {
  const index = plannerTabs.indexOf(current);
  if (key === "Home") return plannerTabs[0];
  if (key === "End") return plannerTabs[plannerTabs.length - 1];
  if (key === "ArrowRight") return plannerTabs[(index + 1) % plannerTabs.length];
  if (key === "ArrowLeft") {
    return plannerTabs[(index - 1 + plannerTabs.length) % plannerTabs.length];
  }
  return null;
}
