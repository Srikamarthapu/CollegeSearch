import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseRouteClient } from "@/app/lib/supabase/route-client";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
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
    : "/auth/update-password";
  const response = NextResponse.redirect(new URL(destination, request.url));

  return routeClient.applyToResponse(response);
}
