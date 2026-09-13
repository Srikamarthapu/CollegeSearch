import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/app/lib/supabase/update-session";
import {
  createContentSecurityPolicy,
  createCspNonce,
  NON_CSP_SECURITY_HEADERS,
} from "./security-policy";

const PRIVATE_NO_STORE_CACHE_CONTROL =
  "private, no-cache, no-store, must-revalidate, max-age=0";

function enforcePrivateNoStore(response: Response) {
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  const directives = new Set(
    cacheControl
      .split(",")
      .map((directive) => directive.trim().toLowerCase())
      .filter(Boolean),
  );

  // Preserve Supabase's response verbatim when it already establishes the
  // required boundary (including any stricter refresh/session directives).
  if (!directives.has("private") || !directives.has("no-store")) {
    response.headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  }
}

export async function proxy(request: NextRequest) {
  const nonce = createCspNonce();
  const contentSecurityPolicy = createContentSecurityPolicy({ nonce });
  const requestHeaders = new Headers(request.headers);

  // Vinext/Next reads the request CSP before rendering and applies this nonce
  // to framework hydration scripts and generated inline font styles.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = await updateSupabaseSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  for (const { key, value } of NON_CSP_SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  // Every matched response carries a request-specific nonce and may carry
  // refreshed auth cookies. It must never be stored or shared by a CDN.
  enforcePrivateNoStore(response);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|assets/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|woff|woff2|ttf|eot|txt|xml)$).*)",
  ],
};
