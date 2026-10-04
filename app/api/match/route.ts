import { NextRequest, NextResponse } from "next/server";
import { readBoundedJson } from "@/app/lib/bounded-json";
import { colleges } from "@/app/lib/college-data";
import knowledgeRelease from "@/data/college-knowledge-release.json";
import { directoryFacets } from "@/app/lib/college-directory";
import { toMatchCollege } from "@/app/match/college-record";
import {
  balancedObservedShortlist,
  hasActiveMatchSignal,
  MATCH_CRITERIA,
  RESIDENCY_STATES,
  rankMatches,
  type MatchCriterion,
  type MatchPreferences,
  type MatchWeights,
} from "@/app/match/scoring";

const validRegions = new Set(["anywhere", "west", "midwest", "northeast", "south", "territories"]);
const validResidency = new Set(["unknown", "international", ...RESIDENCY_STATES]);
const validSizes = new Set(["any", "small", "medium", "large"]);
const validSettings = new Set(["any", "City", "Suburb", "Town", "Rural"]);
const validPrices = new Set([15000, 20000, 30000, 40000, 60000]);

function readWeights(value: unknown): MatchWeights | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!MATCH_CRITERIA.every((criterion) => Number.isInteger(record[criterion]) && Number(record[criterion]) >= 0 && Number(record[criterion]) <= 5)) return null;
  return Object.fromEntries(MATCH_CRITERIA.map((criterion) => [criterion, Number(record[criterion])])) as MatchWeights;
}

function readPreferences(value: unknown): MatchPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const facets = directoryFacets();
  const region = typeof record.region === "string" ? record.region : "";
  const validRegion = validRegions.has(region) || (
    region.startsWith("state:") && facets.states.includes(region.slice(6))
  );
  const residency = typeof record.residencyState === "string" ? record.residencyState : "";
  const validResidencyState = validResidency.has(residency);
  const major = typeof record.major === "string" ? record.major : "";
  const majorMode = record.majorMode;
  const ownership = typeof record.ownership === "string" ? record.ownership : "";
  const maxNetPrice = record.maxNetPrice === null ? null : Number(record.maxNetPrice);
  const size = typeof record.size === "string" ? record.size : "";
  const setting = typeof record.setting === "string" ? record.setting : "";
  const weights = readWeights(record.weights);
  if (
    !validRegion ||
    !validResidencyState ||
    (major !== "undecided" && !facets.majorOptions.includes(major)) ||
    (majorMode !== "prefer" && majorMode !== "require") ||
    (ownership !== "any" && !facets.ownerships.includes(ownership)) ||
    (maxNetPrice !== null && (!Number.isFinite(maxNetPrice) || !validPrices.has(maxNetPrice))) ||
    !validSizes.has(size) ||
    !validSettings.has(setting) ||
    !weights
  ) {
    return null;
  }
  return {
    major,
    majorMode,
    region,
    ownership,
    maxNetPrice,
    residencyState: residency,
    size,
    setting: setting as MatchPreferences["setting"],
    weights,
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await readBoundedJson(request, 24_000);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Match request must be valid JSON." },
      { status: error && typeof error === "object" && "status" in error ? Number(error.status) : 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Match request is invalid." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const preferences = readPreferences(record.preferences);
  const criteria = record.activeCriteria;
  if (
    !preferences ||
    !Array.isArray(criteria) ||
    criteria.length > MATCH_CRITERIA.length ||
    criteria.some((criterion) => !MATCH_CRITERIA.includes(criterion as MatchCriterion))
  ) {
    return NextResponse.json({ error: "Match preferences are invalid." }, { status: 400 });
  }

  const activeCriteria = [...new Set(criteria as MatchCriterion[])];
  const weights: MatchWeights = Object.fromEntries(
    MATCH_CRITERIA.map((criterion) => [
      criterion,
      activeCriteria.includes(criterion) ? preferences.weights[criterion] : 0,
    ]),
  ) as MatchWeights;
  if (!hasActiveMatchSignal(weights)) {
    return NextResponse.json({ error: "Choose at least one active match preference." }, { status: 400 });
  }

  const eligibleColleges = colleges
    .filter((college) => college.institutionLevel === "Four-year" && college.undergraduateOffering)
    .map(toMatchCollege);
  const allResults = rankMatches(eligibleColleges, { ...preferences, weights }, eligibleColleges.length);
  const balanced = balancedObservedShortlist(allResults);
  return NextResponse.json({
    results: allResults.slice(0, 10),
    balancedShortlist: balanced,
    releaseId: knowledgeRelease.releaseId,
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
