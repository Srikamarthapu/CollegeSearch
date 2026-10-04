export const DIRECTORY_PAGE_SIZE = 24;

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
  sort: "name",
};

const compareSorts = new Set([
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
    sort: allowedString(params.get("sort"), compareSorts) || "name",
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
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.ucOnly) params.set("uc", "1");
  if (filters.completeOnly) params.set("complete", "1");
  if (filters.savedOnly) params.set("saved", "1");
  if (selected.length) params.set("compare", selected.slice(0, 4).join(","));
  return params;
}
