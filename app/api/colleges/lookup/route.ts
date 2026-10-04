import { NextRequest, NextResponse } from "next/server";
import { readBoundedJson } from "@/app/lib/bounded-json";
import { lookupDirectoryColleges } from "@/app/lib/college-directory";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await readBoundedJson(request, 160_000);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "College lookup must be valid JSON." },
      { status: error && typeof error === "object" && "status" in error ? Number(error.status) : 400 },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "College lookup is invalid." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (
    !Array.isArray(record.unitIds) ||
    record.unitIds.length > 5000 ||
    record.unitIds.some((unitId) => !Number.isSafeInteger(unitId) || Number(unitId) <= 0)
  ) {
    return NextResponse.json({ error: "College identifiers are invalid." }, { status: 400 });
  }
  const offset = Number.isSafeInteger(record.offset) ? Number(record.offset) : 0;
  const limit = Number.isSafeInteger(record.limit) ? Number(record.limit) : 24;
  const result = lookupDirectoryColleges({
    unitIds: record.unitIds as number[],
    offset,
    limit,
  });
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
