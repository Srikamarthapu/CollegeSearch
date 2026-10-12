import { NextRequest, NextResponse } from "next/server";

import { searchAdmissionsColleges } from "@/app/chances/admissions-directory";
import { normalizeSearchText } from "@/app/lib/college-search";
import { catalogCacheControl } from "@/app/lib/public-catalog-cache-policy";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 120);
  const normalizedQuery = normalizeSearchText(query);
  const items = normalizedQuery.length === 1
    ? []
    : searchAdmissionsColleges(query);

  return NextResponse.json({ items }, {
    headers: {
      "Cache-Control": catalogCacheControl(
        request,
        "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
      ),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
