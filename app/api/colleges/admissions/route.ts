import { NextRequest, NextResponse } from "next/server";

import { searchAdmissionsColleges } from "@/app/chances/admissions-directory";
import { normalizeSearchText } from "@/app/lib/college-search";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 120);
  const normalizedQuery = normalizeSearchText(query);
  const items = normalizedQuery.length === 1
    ? []
    : searchAdmissionsColleges(query);

  return NextResponse.json({ items }, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
