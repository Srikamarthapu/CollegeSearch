import { collegeActions } from "./college-actions.ts";
import type { ClientCollege } from "./college-client-record.ts";
import directoryArtifact from "../../data/college-directory-client.json" with { type: "json" };
import runtimeSummary from "../../data/college-runtime-summary.json" with { type: "json" };
import { COLLEGE_DIRECTORY_CACHE_VERSION } from "./college-directory-cache-version.ts";
import { BoundedLruCache } from "./bounded-lru-cache.ts";
import {
  filterCollegesByQuery,
  normalizeSearchText,
} from "./college-search.ts";
import { matchesEnrollmentBand } from "./explorer-filters.ts";
import {
  DIRECTORY_PAGE_SIZE,
  hasCompleteDirectoryData,
  sortDirectoryColleges,
  type DirectoryFilters,
} from "./college-directory-state.ts";

export const DIRECTORY_MAX_PAGE_SIZE = 48;
export {
  DIRECTORY_PAGE_SIZE,
  EMPTY_DIRECTORY_FILTERS,
  parseDirectoryFilters,
  serializeDirectoryFilters,
} from "./college-directory-state.ts";
export type { DirectoryFilters } from "./college-directory-state";

export type DirectoryCollegeIdentity = Pick<
  ClientCollege,
  "unitId" | "name" | "aliases" | "city" | "state"
> & {
  deadlineSourceUrl?: string;
  admissionsSourceUrl?: string;
};

export type DirectoryLookupCollege = ClientCollege & {
  deadlineSourceUrl?: string;
  admissionsSourceUrl?: string;
};

export type DirectoryFacets = {
  states: string[];
  ownerships: string[];
  institutionLevels: Array<"Four-year" | "Two-year">;
  settings: string[];
  majorOptions: string[];
  totalInstitutions: number;
  releaseId: string;
  evidenceCounts: {
    firstPartyAdmissions: number;
    reviewedCollegeAdmissions: number;
    reviewedInstitutionRecords: number;
  };
};

export type CollegeDirectoryPage = {
  items: ClientCollege[];
  selectedItems: ClientCollege[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  facets: DirectoryFacets;
};

type CachedDirectoryPage = Omit<CollegeDirectoryPage, "selectedItems">;

const colleges = directoryArtifact.colleges as ClientCollege[];
const collegeByUnitId = new Map(colleges.map((college) => [college.unitId, college]));
const majorOptions = runtimeSummary.directoryFacets.majorOptions;
const facets = runtimeSummary.directoryFacets as DirectoryFacets;

if (
  directoryArtifact.cacheVersion !== COLLEGE_DIRECTORY_CACHE_VERSION ||
  runtimeSummary.cacheVersion !== COLLEGE_DIRECTORY_CACHE_VERSION ||
  directoryArtifact.releaseId !== runtimeSummary.releaseId ||
  directoryArtifact.sourceHashes["colleges.json"] !== directoryArtifact.releaseId ||
  colleges.length !== runtimeSummary.institutionCount ||
  collegeByUnitId.size !== colleges.length ||
  runtimeSummary.unitIds.length !== colleges.length ||
  runtimeSummary.unitIds.some((unitId, index) => colleges[index]?.unitId !== unitId)
) {
  throw new Error(
    "The generated college directory artifact is stale or inconsistent. Run scripts/build-college-directory-artifact.mjs.",
  );
}

const publicDirectoryPageCache = new BoundedLruCache<CachedDirectoryPage>({
  maxEntries: 32,
  maxBytes: 6 * 1024 * 1024,
  maxEntryBytes: 512 * 1024,
  ttlMs: 30_000,
  measureBytes: (value) =>
    new TextEncoder().encode(JSON.stringify(value)).byteLength,
});

export function directoryFacets(): DirectoryFacets {
  return facets;
}

function matchesSelectivity(value: number | null, band: string) {
  if (!band) return true;
  if (value === null) return false;
  if (band === "very-high-reach") return value <= 0.1;
  if (band === "reach") return value > 0.1 && value <= 0.25;
  if (band === "competitive") return value > 0.25 && value <= 0.5;
  return value > 0.5;
}

function majorForCollege(college: ClientCollege, name: string) {
  return college.majors.find(
    (major) =>
      major.name === name &&
      (major.bachelorsAvailable || major.associatesAvailable),
  );
}

export function searchCollegeDirectory({
  filters,
  savedIds = [],
  selectedIds = [],
  offset = 0,
  limit = DIRECTORY_PAGE_SIZE,
}: {
  filters: DirectoryFilters;
  savedIds?: number[];
  selectedIds?: number[];
  offset?: number;
  limit?: number;
}): CollegeDirectoryPage {
  const safeOffset = Number.isSafeInteger(offset) ? Math.max(0, Math.min(offset, colleges.length)) : 0;
  const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, DIRECTORY_MAX_PAGE_SIZE)) : DIRECTORY_PAGE_SIZE;

  const cacheKey =
    savedIds.length === 0 &&
    !filters.savedOnly &&
    filters.query.length <= 120
      ? directoryPageCacheKey(filters, safeOffset, safeLimit)
      : null;
  let basePage = cacheKey ? publicDirectoryPageCache.get(cacheKey) : undefined;
  if (!basePage) {
    basePage = computeDirectoryPage({
      filters,
      savedIds,
      offset: safeOffset,
      limit: safeLimit,
    });
    if (cacheKey) publicDirectoryPageCache.set(cacheKey, basePage);
  }

  return {
    ...basePage,
    selectedItems: selectedDirectoryColleges(selectedIds),
  };
}

function directoryPageCacheKey(
  filters: DirectoryFilters,
  offset: number,
  limit: number,
) {
  return JSON.stringify([
    COLLEGE_DIRECTORY_CACHE_VERSION,
    normalizeSearchText(filters.query),
    filters.major,
    filters.stateCode,
    filters.ownership,
    filters.institutionLevel,
    filters.band,
    filters.maxPrice,
    filters.maxTuition,
    filters.maxTuitionOnly,
    filters.enrollmentBand,
    filters.minGraduation,
    filters.minEarnings,
    filters.setting,
    filters.ucOnly,
    filters.completeOnly,
    filters.sort,
    offset,
    limit,
  ]);
}

function computeDirectoryPage({
  filters,
  savedIds,
  offset,
  limit,
}: {
  filters: DirectoryFilters;
  savedIds: number[];
  offset: number;
  limit: number;
}): CachedDirectoryPage {
  const queryMatches = filterCollegesByQuery(colleges, filters.query, majorOptions);
  const queryIds = new Set(queryMatches.map((college) => college.unitId));
  const queryOrder = normalizeSearchText(filters.query)
    ? new Map(queryMatches.map((college, index) => [college.unitId, index]))
    : undefined;
  const savedSet = new Set(savedIds);
  const maxPrice = Number(filters.maxPrice) || null;
  const maxTuition = Number(filters.maxTuition) || null;
  const maxTuitionOnly = Number(filters.maxTuitionOnly) || null;
  const minGraduation = Number(filters.minGraduation) || null;
  const minEarnings = Number(filters.minEarnings) || null;

  const filtered = sortDirectoryColleges(
    colleges.filter((college) => {
      const admitRate = college.observations.admitRate.value;
      const netPrice = college.observations.averageNetPrice.value;
      const legacyTuition = college.observations.tuitionOutOfState.value;
      const tuitionOnly = college.costs.tuitionOutOfState.value;
      const enrollment = college.observations.undergraduateEnrollment.value;
      const graduation = college.observations.graduationRate.value;
      const earnings = college.observations.medianEarnings.value;
      return (
        queryIds.has(college.unitId) &&
        (!filters.major || Boolean(majorForCollege(college, filters.major))) &&
        (!filters.stateCode || college.state === filters.stateCode) &&
        (!filters.ownership || college.ownership === filters.ownership) &&
        (!filters.institutionLevel || college.institutionLevel === filters.institutionLevel) &&
        matchesSelectivity(admitRate, filters.band) &&
        (!maxPrice || (netPrice !== null && netPrice <= maxPrice)) &&
        (!maxTuition || (legacyTuition !== null && legacyTuition <= maxTuition)) &&
        (!maxTuitionOnly || (tuitionOnly !== null && tuitionOnly <= maxTuitionOnly)) &&
        matchesEnrollmentBand(enrollment, filters.enrollmentBand) &&
        (!minGraduation || (graduation !== null && graduation >= minGraduation)) &&
        (!minEarnings || (earnings !== null && earnings >= minEarnings)) &&
        (!filters.setting || college.setting === filters.setting) &&
        (!filters.ucOnly || isUniversityOfCalifornia(college)) &&
        (!filters.completeOnly || hasCompleteDirectoryData(college)) &&
        (!filters.savedOnly || savedSet.has(college.unitId))
      );
    }),
    filters.sort,
    filters.major,
    queryOrder,
  );

  const items = filtered.slice(offset, offset + limit);

  return {
    items,
    total: filtered.length,
    offset,
    limit,
    nextOffset: offset + items.length < filtered.length ? offset + items.length : null,
    facets: directoryFacets(),
  };
}

function selectedDirectoryColleges(selectedIds: number[]) {
  const normalizedSelected = [...new Set(selectedIds)]
    .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0 && collegeByUnitId.has(unitId))
    .slice(0, 4);
  const selectedSet = new Set(normalizedSelected);
  return colleges.filter((college) => selectedSet.has(college.unitId));
}

function isUniversityOfCalifornia(college: ClientCollege) {
  return college.observations.admitRate.sourceId.startsWith("uc-");
}

export function lookupDirectoryColleges({
  unitIds,
  offset = 0,
  limit = DIRECTORY_PAGE_SIZE,
}: {
  unitIds: number[];
  offset?: number;
  limit?: number;
}) {
  const safeIds = [...new Set(unitIds)].filter(
    (unitId) => Number.isSafeInteger(unitId) && unitId > 0,
  );
  const safeOffset = Number.isSafeInteger(offset) ? Math.max(0, Math.min(offset, safeIds.length)) : 0;
  const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(limit, DIRECTORY_MAX_PAGE_SIZE)) : DIRECTORY_PAGE_SIZE;
  const selectedIds = safeIds.slice(safeOffset, safeOffset + safeLimit);
  const items: DirectoryLookupCollege[] = selectedIds.flatMap((unitId) => {
    const college = collegeByUnitId.get(unitId);
    if (!college) return [];
    const actions = collegeActions(unitId);
    return [{
      ...college,
      deadlineSourceUrl: actions?.deadlines.status === "verified" ? actions.deadlines.url : undefined,
      admissionsSourceUrl: actions?.admissions.status === "verified" ? actions.admissions.url : undefined,
    }];
  });
  return {
    items,
    total: safeIds.length,
    offset: safeOffset,
    nextOffset: safeOffset + selectedIds.length < safeIds.length ? safeOffset + selectedIds.length : null,
    unknownUnitIds: selectedIds.filter((unitId) => !collegeByUnitId.has(unitId)),
  };
}

export function directoryCollegeIdentities(): DirectoryCollegeIdentity[] {
  return colleges.map((college) => {
    const actions = collegeActions(college.unitId);
    return {
      unitId: college.unitId,
      name: college.name,
      aliases: college.aliases,
      city: college.city,
      state: college.state,
      deadlineSourceUrl: actions?.deadlines.status === "verified" ? actions.deadlines.url : undefined,
      admissionsSourceUrl: actions?.admissions.status === "verified" ? actions.admissions.url : undefined,
    };
  });
}

export function directoryCollegeIdentityPayload() {
  const items = directoryCollegeIdentities();
  return {
    items,
    total: items.length,
    releaseId: runtimeSummary.releaseId,
  };
}
