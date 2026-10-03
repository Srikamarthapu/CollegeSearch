import type {
  MatchCriterion,
  MatchPreferences,
  MatchWeights,
} from "./scoring.ts";
import { RESIDENCY_STATES } from "./scoring.ts";

const criteria: MatchCriterion[] = [
  "major", "location", "price", "size", "setting", "graduation", "earnings",
];
const parameterNames = [
  "major", "field", "location", "type", "price", "residency", "size", "setting", "weights", "active",
];

export const initialWeights: MatchWeights = {
  major: 5,
  location: 3,
  price: 4,
  size: 2,
  setting: 2,
  graduation: 4,
  earnings: 3,
};

export type MatchWorksheetState = {
  preferences: MatchPreferences;
  activeCriteria: MatchCriterion[];
  hasStudentInput: boolean;
};

export function initialMatchWorksheet(): MatchWorksheetState {
  return {
    preferences: {
      major: "undecided",
      majorMode: "prefer",
      region: "anywhere",
      ownership: "any",
      maxNetPrice: null,
      residencyState: "unknown",
      size: "any",
      setting: "any",
      weights: { ...initialWeights },
    },
    activeCriteria: [],
    hasStudentInput: false,
  };
}

function canActivate(criterion: MatchCriterion, preferences: MatchPreferences) {
  if (preferences.weights[criterion] === 0) return false;
  if (criterion === "major") return preferences.major !== "undecided";
  if (criterion === "location") return preferences.region !== "anywhere";
  if (criterion === "price") return preferences.maxNetPrice !== null;
  if (criterion === "size") return preferences.size !== "any";
  if (criterion === "setting") return preferences.setting !== "any";
  return true;
}

export function parseMatchWorksheet(
  search: string,
  options: { majorOptions: string[]; stateOptions: string[] },
): MatchWorksheetState {
  const params = new URLSearchParams(search);
  const result = initialMatchWorksheet();
  const preferences = result.preferences;
  const major = params.get("major") ?? "";
  if (options.majorOptions.includes(major)) preferences.major = major;
  if (preferences.major !== "undecided" && params.get("field") === "require") {
    preferences.majorMode = "require";
  }
  const regions = ["west", "midwest", "northeast", "south", ...options.stateOptions.map((state) => `state:${state}`)];
  const region = params.get("location") ?? "";
  if (regions.includes(region)) preferences.region = region;
  const ownership = params.get("type") ?? "";
  if (["Public", "Private nonprofit"].includes(ownership)) preferences.ownership = ownership;
  const price = params.get("price") ?? "";
  if (["15000", "20000", "30000", "40000", "60000"].includes(price)) {
    preferences.maxNetPrice = Number(price);
  }
  const size = params.get("size") ?? "";
  const residency = params.get("residency") ?? "";
  if ([...RESIDENCY_STATES, "international"].includes(residency)) preferences.residencyState = residency;
  if (["small", "medium", "large"].includes(size)) preferences.size = size;
  const setting = params.get("setting") ?? "";
  if (setting === "City" || setting === "Suburb" || setting === "Town") preferences.setting = setting;

  const weights = (params.get("weights") ?? "").split(",");
  // Weight order is fixed by this URL format. Reject an incomplete/corrupt set
  // as a whole so a damaged link cannot silently alter the scoring formula.
  if (weights.length === criteria.length && weights.every((weight) => /^[0-5]$/.test(weight))) {
    criteria.forEach((criterion, index) => { preferences.weights[criterion] = Number(weights[index]); });
  }
  const requestedActive = new Set((params.get("active") ?? "").split(","));
  result.activeCriteria = criteria.filter(
    (criterion) => requestedActive.has(criterion) && canActivate(criterion, preferences),
  );
  // A restored preference never activates unrelated suggested weights.
  result.hasStudentInput = result.activeCriteria.length > 0 ||
    JSON.stringify(preferences) !== JSON.stringify(initialMatchWorksheet().preferences);
  return result;
}

export function serializeMatchWorksheet(search: string, state: MatchWorksheetState): string {
  const params = new URLSearchParams(search);
  parameterNames.forEach((name) => params.delete(name));
  const { preferences, activeCriteria } = state;
  if (preferences.major !== "undecided") {
    params.set("major", preferences.major);
    if (preferences.majorMode === "require") params.set("field", "require");
  }
  if (preferences.region !== "anywhere") params.set("location", preferences.region);
  if (preferences.ownership !== "any") params.set("type", preferences.ownership);
  if (preferences.maxNetPrice !== null) params.set("price", String(preferences.maxNetPrice));
  if (preferences.residencyState !== "unknown") params.set("residency", preferences.residencyState);
  if (preferences.size !== "any") params.set("size", preferences.size);
  if (preferences.setting !== "any") params.set("setting", preferences.setting);
  if (criteria.some((criterion) => preferences.weights[criterion] !== initialWeights[criterion])) {
    params.set("weights", criteria.map((criterion) => preferences.weights[criterion]).join(","));
  }
  const active = criteria.filter((criterion) => activeCriteria.includes(criterion) && canActivate(criterion, preferences));
  if (active.length) params.set("active", active.join(","));
  return params.toString();
}
