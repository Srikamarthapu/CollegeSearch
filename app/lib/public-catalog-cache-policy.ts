import { COLLEGE_DIRECTORY_CACHE_VERSION } from "./college-directory-cache-version.ts";

export const PRIVATE_CATALOG_CACHE_CONTROL = "private, no-store";

/**
 * Only these deterministic public GETs may bypass the auth-refresh proxy and
 * use a shared CDN cache. Search terms, filters, comparisons, and saved rows
 * remain request-specific and never enter this allowlist.
 */
export function isPublicCatalogCacheRequest(
  request: Pick<Request, "method" | "url" | "headers">,
) {
  if (request.method !== "GET") return false;
  if (request.headers.get("cookie")?.trim()) return false;
  if (request.headers.get("authorization")?.trim()) return false;

  const url = new URL(request.url);
  if (
    (url.pathname === "/api/colleges" ||
      url.pathname === "/api/colleges/admissions") &&
    url.search === ""
  ) {
    return true;
  }

  if (url.pathname !== "/api/colleges/identities") return false;
  const releaseParameters = url.searchParams.getAll("release");
  return (
    [...url.searchParams.keys()].length === 1 &&
    releaseParameters.length === 1 &&
    releaseParameters[0] === COLLEGE_DIRECTORY_CACHE_VERSION
  );
}

/** Route handlers use this too, so a proxy bypass can never make a response public by itself. */
export function catalogCacheControl(
  request: Pick<Request, "method" | "url" | "headers">,
  publicCacheControl: string,
) {
  return isPublicCatalogCacheRequest(request)
    ? publicCacheControl
    : PRIVATE_CATALOG_CACHE_CONTROL;
}
