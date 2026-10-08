import { NextResponse } from "next/server";

import { directoryCollegeIdentityPayload } from "@/app/lib/college-directory";

export const revalidate = 3600;

const payload = directoryCollegeIdentityPayload();

export async function GET() {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
