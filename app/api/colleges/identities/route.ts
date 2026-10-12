import { NextRequest, NextResponse } from "next/server";

import { directoryCollegeIdentityPayload } from "@/app/lib/college-directory";
import { COLLEGE_DIRECTORY_CACHE_VERSION } from "@/app/lib/college-directory-cache-version";
import { catalogCacheControl } from "@/app/lib/public-catalog-cache-policy";

const payload = directoryCollegeIdentityPayload();

export async function GET(request: NextRequest) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": catalogCacheControl(
        request,
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      ),
      "X-College-Directory-Version": COLLEGE_DIRECTORY_CACHE_VERSION,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
