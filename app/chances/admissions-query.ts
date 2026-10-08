import { normalizeSearchText } from "../lib/college-search.ts";

export function normalizeAdmissionsQuery(value: string) {
  return normalizeSearchText(value);
}

export function admissionsQueryChanged(current: string, next: string) {
  return normalizeAdmissionsQuery(current) !== normalizeAdmissionsQuery(next);
}
