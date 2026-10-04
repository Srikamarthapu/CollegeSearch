import type { College } from "./college-data.ts";

export const DIRECTORY_PAGE_SIZE = 24;

export const DEFAULT_DIRECTORY_SORT = "featured";

/**
 * Editorial browse starting points chosen for familiarity and regional variety.
 * This exact set and order are a product choice; they do not express popularity,
 * quality, selectivity, or outcomes.
 */
export const FEATURED_DIRECTORY_UNIT_IDS = [
  110635, // University of California-Berkeley
  110662, // University of California-Los Angeles
  243744, // Stanford University
  166027, // Harvard University
  166683, // Massachusetts Institute of Technology
  186131, // Princeton University
  130794, // Yale University
  170976, // University of Michigan-Ann Arbor
  228778, // The University of Texas at Austin
  123961, // University of Southern California
  193900, // New York University
  139755, // Georgia Institute of Technology-Main Campus
  110680, // University of California-San Diego
  110644, // University of California-Davis
  110653, // University of California-Irvine
  134130, // University of Florida
  236948, // University of Washington-Seattle Campus
  104151, // Arizona State University Campus Immersion
  110422, // California Polytechnic State University-San Luis Obispo
  190150, // Columbia University in the City of New York
  215062, // University of Pennsylvania
  198419, // Duke University
  147767, // Northwestern University
  204796, // Ohio State University-Main Campus
  199120, // University of North Carolina at Chapel Hill
  243780, // Purdue University-Main Campus
  240444, // University of Wisconsin-Madison
  110705, // University of California-Santa Barbara
  110714, // University of California-Santa Cruz
  234076, // University of Virginia-Main Campus
] as const;

const featuredDirectoryOrder = new Map<number, number>(
  FEATURED_DIRECTORY_UNIT_IDS.map((unitId, index) => [unitId, index] as const),
);

export type DirectoryFilters = {
  query: string;
  major: string;
  stateCode: string;
  ownership: string;
  institutionLevel: "" | "Four-year" | "Two-year";
  band: string;
  maxPrice: string;
  maxTuition: string;
  enrollmentBand: string;
  minGraduation: string;
  minEarnings: string;
  setting: string;
  ucOnly: boolean;
  completeOnly: boolean;
  savedOnly: boolean;
  sort: string;
};

export type DirectoryFilterOptions = {
  states: readonly string[];
  ownerships: readonly string[];
  settings: readonly string[];
  majorOptions: readonly string[];
};

export const EMPTY_DIRECTORY_FILTERS: DirectoryFilters = {
  query: "",
  major: "",
  stateCode: "",
  ownership: "",
  institutionLevel: "",
  band: "",
  maxPrice: "",
  maxTuition: "",
  enrollmentBand: "",
  minGraduation: "",
  minEarnings: "",
  setting: "",
  ucOnly: false,
  completeOnly: false,
  savedOnly: false,
  sort: DEFAULT_DIRECTORY_SORT,
};

const compareSorts = new Set([
  DEFAULT_DIRECTORY_SORT,
  "name",
  "major",
  "admit-low",
  "admit-high",
  "price",
  "graduation",
  "enrollment",
  "earnings",
]);
const selectivityBands = new Set([
  "",
  "very-high-reach",
  "reach",
  "competitive",
  "accessible",
]);
const allowedPrices = new Set(["", "15000", "20000", "30000", "40000"]);
const allowedTuition = new Set(["", "30000", "50000", "70000", "90000"]);
const allowedEnrollmentBands = new Set(["", "small", "medium", "large"]);
const allowedGraduationRates = new Set(["", "0.6", "0.75", "0.9"]);
const allowedEarnings = new Set(["", "75000", "100000", "125000"]);

function allowedString(value: string | null, values: ReadonlySet<string>) {
  return value && values.has(value) ? value : "";
}

export function parseDirectoryFilters(
  params: URLSearchParams,
  options: DirectoryFilterOptions,
): DirectoryFilters {
  const level = params.get("level");
  const institutionLevel = level === "four-year"
    ? "Four-year"
    : level === "two-year"
      ? "Two-year"
      : "";
  return {
    query: (params.get("q") ?? "").slice(0, 120),
    major: allowedString(params.get("major"), new Set(options.majorOptions)),
    stateCode: allowedString(params.get("state"), new Set(options.states)),
    ownership: allowedString(params.get("type"), new Set(options.ownerships)),
    institutionLevel,
    band: allowedString(params.get("band"), selectivityBands),
    maxPrice: allowedString(params.get("price"), allowedPrices),
    maxTuition: allowedString(params.get("tuition"), allowedTuition),
    enrollmentBand: allowedString(params.get("size"), allowedEnrollmentBands),
    minGraduation: allowedString(params.get("grad"), allowedGraduationRates),
    minEarnings: allowedString(params.get("earnings"), allowedEarnings),
    setting: allowedString(params.get("setting"), new Set(options.settings)),
    ucOnly: params.get("uc") === "1",
    completeOnly: params.get("complete") === "1",
    savedOnly: params.get("saved") === "1",
    sort: allowedString(params.get("sort"), compareSorts) || DEFAULT_DIRECTORY_SORT,
  };
}

export function serializeDirectoryFilters(
  filters: DirectoryFilters,
  selected: number[] = [],
) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.major) params.set("major", filters.major);
  if (filters.stateCode) params.set("state", filters.stateCode);
  if (filters.ownership) params.set("type", filters.ownership);
  if (filters.institutionLevel) {
    params.set(
      "level",
      filters.institutionLevel === "Four-year" ? "four-year" : "two-year",
    );
  }
  if (filters.band) params.set("band", filters.band);
  if (filters.maxPrice) params.set("price", filters.maxPrice);
  if (filters.maxTuition) params.set("tuition", filters.maxTuition);
  if (filters.enrollmentBand) params.set("size", filters.enrollmentBand);
  if (filters.minGraduation) params.set("grad", filters.minGraduation);
  if (filters.minEarnings) params.set("earnings", filters.minEarnings);
  if (filters.setting) params.set("setting", filters.setting);
  if (filters.sort !== DEFAULT_DIRECTORY_SORT) params.set("sort", filters.sort);
  if (filters.ucOnly) params.set("uc", "1");
  if (filters.completeOnly) params.set("complete", "1");
  if (filters.savedOnly) params.set("saved", "1");
  if (selected.length) params.set("compare", selected.slice(0, 4).join(","));
  return params;
}

function compareDirectoryNames(left: College, right: College) {
  return (
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
    left.unitId - right.unitId
  );
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

function majorForCollege(college: College, name: string) {
  return college.majors.find(
    (major) =>
      major.name === name &&
      (major.bachelorsAvailable || major.associatesAvailable),
  );
}

/**
 * Applies a stable directory sort. When the default is active during search,
 * keep the order supplied by the query matcher so exact matches stay first.
 */
export function sortDirectoryColleges(
  rows: College[],
  sort: string,
  major: string,
  queryOrder?: ReadonlyMap<number, number>,
) {
  return [...rows].sort((left, right) => {
    if (sort === DEFAULT_DIRECTORY_SORT) {
      if (queryOrder?.size) {
        const relevanceDifference =
          (queryOrder.get(left.unitId) ?? Number.MAX_SAFE_INTEGER) -
          (queryOrder.get(right.unitId) ?? Number.MAX_SAFE_INTEGER);
        if (relevanceDifference !== 0) return relevanceDifference;
      }

      const leftFeaturedOrder = featuredDirectoryOrder.get(left.unitId);
      const rightFeaturedOrder = featuredDirectoryOrder.get(right.unitId);
      if (leftFeaturedOrder !== undefined && rightFeaturedOrder !== undefined) {
        return leftFeaturedOrder - rightFeaturedOrder;
      }
      if (leftFeaturedOrder !== undefined) return -1;
      if (rightFeaturedOrder !== undefined) return 1;
      return compareDirectoryNames(left, right);
    }

    if (sort === "major" && major) {
      const shareDifference =
        (majorForCollege(right, major)?.share ?? -1) -
        (majorForCollege(left, major)?.share ?? -1);
      return shareDifference || compareDirectoryNames(left, right);
    }

    let comparison = 0;
    if (sort === "admit-low") {
      comparison = compareNullable(
        left.observations.admitRate.value,
        right.observations.admitRate.value,
      );
    } else if (sort === "admit-high") {
      comparison = compareNullable(
        left.observations.admitRate.value,
        right.observations.admitRate.value,
        "desc",
      );
    } else if (sort === "price") {
      comparison = compareNullable(
        left.observations.averageNetPrice.value,
        right.observations.averageNetPrice.value,
      );
    } else if (sort === "graduation") {
      comparison = compareNullable(
        left.observations.graduationRate.value,
        right.observations.graduationRate.value,
        "desc",
      );
    } else if (sort === "enrollment") {
      comparison = compareNullable(
        left.observations.undergraduateEnrollment.value,
        right.observations.undergraduateEnrollment.value,
        "desc",
      );
    } else if (sort === "earnings") {
      comparison = compareNullable(
        left.observations.medianEarnings.value,
        right.observations.medianEarnings.value,
        "desc",
      );
    }
    return comparison || compareDirectoryNames(left, right);
  });
}
