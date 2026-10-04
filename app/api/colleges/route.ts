import { NextRequest, NextResponse } from "next/server";
import { readBoundedJson } from "@/app/lib/bounded-json";
import {
  searchCollegeDirectory,
  directoryFacets,
} from "@/app/lib/college-directory";
import { parseDirectoryFilters } from "@/app/lib/college-directory-state";

function integerParameter(value: string | null, fallback: number) {
  if (!value || !/^\d{1,7}$/.test(value)) return fallback;
  return Number(value);
}

function selectedIds(value: string | null) {
  if (!value) return [];
  return [...new Set(value.split(",").slice(0, 4).map(Number))].filter(
    (unitId) => Number.isSafeInteger(unitId) && unitId > 0,
  );
}

function responseFor(
  result: ReturnType<typeof searchCollegeDirectory>,
  cacheControl: string,
) {
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = searchCollegeDirectory({
    filters: parseDirectoryFilters(params, directoryFacets()),
    selectedIds: selectedIds(params.get("compare")),
    offset: integerParameter(params.get("offset"), 0),
    limit: integerParameter(params.get("limit"), 24),
  });
  return responseFor(result, "public, s-maxage=300, stale-while-revalidate=3600");
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await readBoundedJson(request, 160_000);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search request must be valid JSON." },
      { status: error && typeof error === "object" && "status" in error ? Number(error.status) : 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Search request is invalid." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const rawFilters = record.filters;
  if (!rawFilters || typeof rawFilters !== "object" || Array.isArray(rawFilters)) {
    return NextResponse.json({ error: "Search filters are required." }, { status: 400 });
  }
  const filterRecord = rawFilters as Record<string, unknown>;
  const searchParams = new URLSearchParams();
  const textParameters: Array<[string, string]> = [
    ["q", "query"],
    ["major", "major"],
    ["state", "stateCode"],
    ["type", "ownership"],
    ["band", "band"],
    ["price", "maxPrice"],
    ["tuition", "maxTuition"],
    ["size", "enrollmentBand"],
    ["grad", "minGraduation"],
    ["earnings", "minEarnings"],
    ["setting", "setting"],
    ["sort", "sort"],
  ];
  for (const [parameter, key] of textParameters) {
    const value = filterRecord[key];
    if (typeof value === "string") searchParams.set(parameter, value);
  }
  const level = filterRecord.institutionLevel;
  if (level === "Four-year") searchParams.set("level", "four-year");
  if (level === "Two-year") searchParams.set("level", "two-year");
  for (const [key, parameter] of [
    ["ucOnly", "uc"],
    ["completeOnly", "complete"],
    ["savedOnly", "saved"],
  ] as const) {
    if (filterRecord[key] === true) searchParams.set(parameter, "1");
  }

  const rawSavedIds = record.savedIds;
  if (
    rawSavedIds !== undefined &&
    (!Array.isArray(rawSavedIds) ||
      rawSavedIds.length > 5000 ||
      rawSavedIds.some((value) => !Number.isSafeInteger(value) || Number(value) <= 0))
  ) {
    return NextResponse.json({ error: "Saved college identifiers are invalid." }, { status: 400 });
  }
  const rawSelectedIds = record.selectedIds;
  if (
    rawSelectedIds !== undefined &&
    (!Array.isArray(rawSelectedIds) ||
      rawSelectedIds.length > 4 ||
      rawSelectedIds.some((value) => !Number.isSafeInteger(value) || Number(value) <= 0))
  ) {
    return NextResponse.json({ error: "Comparison identifiers are invalid." }, { status: 400 });
  }

  const offset = Number.isSafeInteger(record.offset) ? Number(record.offset) : 0;
  const limit = Number.isSafeInteger(record.limit) ? Number(record.limit) : 24;
  const result = searchCollegeDirectory({
    filters: parseDirectoryFilters(searchParams, directoryFacets()),
    savedIds: (rawSavedIds as number[] | undefined) ?? [],
    selectedIds: (rawSelectedIds as number[] | undefined) ?? [],
    offset,
    limit,
  });
  return responseFor(result, "private, no-store");
}
