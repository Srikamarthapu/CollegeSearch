import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/app/lib/supabase/update-session";
import {
  isPublicCatalogCachePath,
  isPublicCatalogCacheRequest,
  PRIVATE_CATALOG_CACHE_CONTROL,
  privateCatalogCacheRewriteUrl,
} from "@/app/lib/public-catalog-cache-policy";
import {
  createContentSecurityPolicy,
  createCspNonce,
  NON_CSP_SECURITY_HEADERS,
} from "./security-policy";

const PRIVATE_NO_STORE_CACHE_CONTROL =
  "private, no-cache, no-store, must-revalidate, max-age=0";
const PUBLIC_JSON_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

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
  // Only canonical, credential-free GETs may share a CDN entry. A credentialed
  // request (and HEAD, which can share a GET cache key) must use a distinct
  // internal URL so a previously cached public response cannot be selected.
  // These routes return public catalog data, so they do not need session refresh.
  if (isPublicCatalogCachePath(request)) {
    const mayUseSharedCache = isPublicCatalogCacheRequest(request);
    const rewriteUrl = mayUseSharedCache
      ? null
      : privateCatalogCacheRewriteUrl(request);
    const response = rewriteUrl
      ? NextResponse.rewrite(rewriteUrl)
      : NextResponse.next();
    response.headers.set(
      "Content-Security-Policy",
      PUBLIC_JSON_CONTENT_SECURITY_POLICY,
    );
    if (!mayUseSharedCache) {
      response.headers.set(
        "Cache-Control",
        PRIVATE_CATALOG_CACHE_CONTROL,
      );
    }
    for (const { key, value } of NON_CSP_SECURITY_HEADERS) {
      response.headers.set(key, value);
    }
    return response;
  }

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
  // Every remaining response carries a request-specific nonce and may carry
  // refreshed auth cookies. It must never be stored or shared by a CDN.
  enforcePrivateNoStore(response);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|assets/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|mjs|map|woff|woff2|ttf|eot|txt|xml)$).*)",
  ],
};
