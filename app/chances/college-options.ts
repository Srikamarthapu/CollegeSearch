import {
  filterCollegeIdentitiesByQuery,
  type CollegeSearchIdentity,
} from "../lib/college-search.ts";

export function availableChancesCollegeOptions<
  T extends CollegeSearchIdentity,
>(colleges: T[], selectedIds: readonly number[], query: string) {
  const selected = new Set(selectedIds);
  return filterCollegeIdentitiesByQuery(
    colleges.filter((college) => !selected.has(college.unitId)),
    query,
  );
}
