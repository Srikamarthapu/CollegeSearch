import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/app/lib/supabase/route-client";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const type =
    rawType && allowedOtpTypes.has(rawType as EmailOtpType)
      ? (rawType as EmailOtpType)
      : null;
  const next = safeRelativePath(request.nextUrl.searchParams.get("next"));
  const routeClient = createSupabaseRouteClient(request);

  if (!routeClient) {
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=configuration", request.url),
    );
  }

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=missing-token", request.url),
    );
  }

  const { error } = await routeClient.client.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  const destination = error ? "/auth/auth-code-error?reason=verification" : next;
  const response = NextResponse.redirect(new URL(destination, request.url));

  return routeClient.applyToResponse(response);
}

function safeRelativePath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "https://college-search.local");
    if (url.origin !== "https://college-search.local") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
