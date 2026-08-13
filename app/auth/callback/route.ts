import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/app/lib/supabase/route-client";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  const next = safeRelativePath(request.nextUrl.searchParams.get("next"));
  const routeClient = createSupabaseRouteClient(request);

  if (!routeClient) {
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=configuration", request.url),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=missing-code", request.url),
    );
  }

  let exchangeFailed = false;
  try {
    const { error } = await routeClient.client.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    exchangeFailed = Boolean(error);
  } catch {
    exchangeFailed = true;
  }
  const destination = exchangeFailed
    ? "/auth/auth-code-error?reason=exchange"
    : next;
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
