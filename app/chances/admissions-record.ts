import type { College } from "../lib/college-data.ts";
import {
  filterCollegeIdentitiesByQuery,
  normalizeSearchText,
  STATE_NAMES,
} from "../lib/college-search.ts";

export const ADMISSIONS_FEATURED_LIMIT = 12;
export const ADMISSIONS_SEARCH_LIMIT = 24;

export type ChancesCollege = {
  unitId: number;
  slug: string;
  name: string;
  aliases: string[];
  city: string;
  state: string;
  ownership: string;
  rate: number | null;
  periodLabel: string;
  finality: string;
  status: string;
  publisher: string;
  sourceName: string;
  sourceUrl: string;
  cohort: string;
  definition: string;
};

export function toChancesCollege(college: College): ChancesCollege {
  const observation = college.observations.admitRate;
  return {
    unitId: college.unitId,
    slug: college.slug,
    name: college.name,
    aliases: college.aliases,
    city: college.city,
    state: college.state,
    ownership: college.ownership,
    rate: observation.value,
    periodLabel: observation.periodLabel,
    finality: observation.finality,
    status: observation.status,
    publisher: observation.publisher,
    sourceName: observation.sourceName,
    sourceUrl: observation.sourceUrl,
    cohort: observation.cohort,
    definition: observation.definition,
  };
}

export function admissionsSearchResults(
  colleges: ChancesCollege[],
  query: string,
  featuredUnitIds: readonly number[],
  limit = ADMISSIONS_SEARCH_LIMIT,
) {
  const normalizedQuery = query.trim();
  const normalizedLocation = normalizeSearchText(normalizedQuery);
  const locationMatches = normalizedLocation
    ? colleges.filter((college) =>
        normalizeSearchText(college.city) === normalizedLocation ||
        normalizeSearchText(college.state) === normalizedLocation ||
        normalizeSearchText(STATE_NAMES[college.state] ?? "") === normalizedLocation)
    : [];
  const matches = normalizedQuery
    ? locationMatches.length > 0
      ? locationMatches
      : filterCollegeIdentitiesByQuery(colleges, normalizedQuery)
    : featuredUnitIds.slice(0, ADMISSIONS_FEATURED_LIMIT).flatMap((unitId) => {
        const college = colleges.find((item) => item.unitId === unitId);
        return college ? [college] : [];
      });
  return matches.slice(0, Math.max(0, Math.min(limit, ADMISSIONS_SEARCH_LIMIT)));
}

export function initialAdmissionsColleges(
  colleges: ChancesCollege[],
  requestedIds: readonly number[],
  featuredUnitIds: readonly number[],
) {
  const byId = new Map(colleges.map((college) => [college.unitId, college]));
  const selected = [...new Set(requestedIds)]
    .slice(0, 4)
    .flatMap((unitId) => {
      const college = byId.get(unitId);
      return college ? [college] : [];
    });
  const selectedIds = new Set(selected.map((college) => college.unitId));
  const featured = featuredUnitIds
    .filter((unitId) => !selectedIds.has(unitId))
    .slice(0, ADMISSIONS_FEATURED_LIMIT)
    .flatMap((unitId) => {
      const college = byId.get(unitId);
      return college ? [college] : [];
    });
  return [...selected, ...featured];
}
