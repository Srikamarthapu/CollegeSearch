import {
  collegeActions,
} from "@/app/lib/college-actions";
import {
  colleges,
  type College,
} from "@/app/lib/college-data";
import {
  projectCollegeForClient,
  type ClientCollege,
} from "@/app/lib/college-client-record";
import {
  filterCollegesByQuery,
} from "@/app/lib/college-search";
import {
  observationSourceKind,
  isUniversityOfCalifornia,
} from "@/app/lib/college-data";
import knowledgeRelease from "@/data/college-knowledge-release.json";
import {
  DIRECTORY_PAGE_SIZE,
  type DirectoryFilters,
} from "./college-directory-state";

export const DIRECTORY_MAX_PAGE_SIZE = 48;
export {
  DIRECTORY_PAGE_SIZE,
  EMPTY_DIRECTORY_FILTERS,
  parseDirectoryFilters,
  serializeDirectoryFilters,
} from "./college-directory-state";
export type { DirectoryFilters } from "./college-directory-state";

export type DirectoryCollegeIdentity = Pick<
  ClientCollege,
  "unitId" | "slug" | "name"
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

const stateSet = new Set(colleges.map((college) => college.state));
const ownershipSet = new Set(colleges.map((college) => college.ownership));
const settingSet = new Set(
  colleges
    .map((college) => college.setting)
    .filter((setting) => setting !== "Setting unavailable"),
);
const majorOptions = [...new Set(colleges.flatMap((college) => college.majors.map((major) => major.name)))].sort();
export function directoryFacets(): DirectoryFacets {
  const federalAdmissions = colleges.filter((college) =>
    observationSourceKind(college.observations.admitRate).isFederal,
  ).length;
  const ucAdmissions = colleges.filter(isUniversityOfCalifornia).length;
  const reviewedInstitutionRecords = colleges.filter((college) =>
    Object.values(college.observations).some(
      (observation) =>
        observation !== null &&
        !observation.sourceId.startsWith("uc-") &&
        !observationSourceKind(observation).isFederal,
    ),
  ).length;
  return {
    states: [...stateSet].sort(),
    ownerships: ["Public", "Private nonprofit", "Private for-profit"].filter(
      (ownership) => ownershipSet.has(ownership),
    ),
    institutionLevels: ["Four-year", "Two-year"],
    settings: [...settingSet].sort(),
    majorOptions,
    totalInstitutions: colleges.length,
    releaseId: knowledgeRelease.releaseId,
    evidenceCounts: {
      firstPartyAdmissions: colleges.length - federalAdmissions,
      reviewedCollegeAdmissions: colleges.length - federalAdmissions - ucAdmissions,
      reviewedInstitutionRecords,
    },
  };
}

function matchesSelectivity(value: number | null, band: string) {
  if (!band) return true;
  if (value === null) return false;
  if (band === "very-high-reach") return value <= 0.1;
  if (band === "reach") return value > 0.1 && value <= 0.25;
  if (band === "competitive") return value > 0.25 && value <= 0.5;
  return value > 0.5;
}

function matchesEnrollment(value: number | null, band: string) {
  if (!band) return true;
  if (value === null) return false;
  if (band === "small") return value < 10_000;
  if (band === "medium") return value >= 10_000 && value < 25_000;
  return value >= 25_000;
}

function majorForCollege(college: College, name: string) {
  return college.majors.find(
    (major) =>
      major.name === name &&
      (major.bachelorsAvailable || major.associatesAvailable),
  );
}

function matchesCompleteData(college: College) {
  return [
    college.observations.admitRate,
    college.observations.averageNetPrice,
    college.observations.graduationRate,
    college.observations.undergraduateEnrollment,
  ].every((observation) => observation.value !== null);
}

function compareNullable(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc" = "asc",
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function sortDirectory(rows: College[], sort: string, major: string) {
  return rows.sort((left, right) => {
    if (sort === "major" && major) {
      return (majorForCollege(right, major)?.share ?? -1) - (majorForCollege(left, major)?.share ?? -1);
    }
    if (sort === "admit-low") return compareNullable(left.observations.admitRate.value, right.observations.admitRate.value);
    if (sort === "admit-high") return compareNullable(left.observations.admitRate.value, right.observations.admitRate.value, "desc");
    if (sort === "price") return compareNullable(left.observations.averageNetPrice.value, right.observations.averageNetPrice.value);
    if (sort === "graduation") return compareNullable(left.observations.graduationRate.value, right.observations.graduationRate.value, "desc");
    if (sort === "enrollment") return compareNullable(left.observations.undergraduateEnrollment.value, right.observations.undergraduateEnrollment.value, "desc");
    if (sort === "earnings") return compareNullable(left.observations.medianEarnings.value, right.observations.medianEarnings.value, "desc");
    return left.name.localeCompare(right.name);
  });
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
  const queryIds = new Set(filterCollegesByQuery(colleges, filters.query, majorOptions).map((college) => college.unitId));
  const savedSet = new Set(savedIds);
  const maxPrice = Number(filters.maxPrice) || null;
  const maxTuition = Number(filters.maxTuition) || null;
  const minGraduation = Number(filters.minGraduation) || null;
  const minEarnings = Number(filters.minEarnings) || null;

  const filtered = sortDirectory(
    colleges.filter((college) => {
      const admitRate = college.observations.admitRate.value;
      const netPrice = college.observations.averageNetPrice.value;
      const tuition = college.observations.tuitionOutOfState.value;
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
        (!maxTuition || (tuition !== null && tuition <= maxTuition)) &&
        matchesEnrollment(enrollment, filters.enrollmentBand) &&
        (!minGraduation || (graduation !== null && graduation >= minGraduation)) &&
        (!minEarnings || (earnings !== null && earnings >= minEarnings)) &&
        (!filters.setting || college.setting === filters.setting) &&
        (!filters.ucOnly || isUniversityOfCalifornia(college)) &&
        (!filters.completeOnly || matchesCompleteData(college)) &&
        (!filters.savedOnly || savedSet.has(college.unitId))
      );
    }),
    filters.sort,
    filters.major,
  );

  const items = filtered.slice(safeOffset, safeOffset + safeLimit).map(projectCollegeForClient);
  const knownIds = new Set(colleges.map((college) => college.unitId));
  const normalizedSelected = [...new Set(selectedIds)]
    .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0 && knownIds.has(unitId))
    .slice(0, 4);
  const selectedSet = new Set(normalizedSelected);
  const selectedItems = colleges
    .filter((college) => selectedSet.has(college.unitId))
    .map(projectCollegeForClient);

  return {
    items,
    selectedItems,
    total: filtered.length,
    offset: safeOffset,
    limit: safeLimit,
    nextOffset: safeOffset + items.length < filtered.length ? safeOffset + items.length : null,
    facets: directoryFacets(),
  };
}

const collegeByUnitId = new Map(colleges.map((college) => [college.unitId, college]));

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
      ...projectCollegeForClient(college),
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
      slug: college.slug,
      name: college.name,
      deadlineSourceUrl: actions?.deadlines.status === "verified" ? actions.deadlines.url : undefined,
      admissionsSourceUrl: actions?.admissions.status === "verified" ? actions.admissions.url : undefined,
    };
  });
}
