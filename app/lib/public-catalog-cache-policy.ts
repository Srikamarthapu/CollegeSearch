import { COLLEGE_DIRECTORY_CACHE_VERSION } from "./college-directory-cache-version.ts";

export const PRIVATE_CATALOG_CACHE_CONTROL = "private, no-store";
export const PRIVATE_CATALOG_CACHE_BYPASS_QUERY = "__private";

/**
 * Identify only canonical public catalog URLs. HEAD is included so a request
 * with credentials cannot fall through to a GET cache entry for the same URL.
 * This intentionally ignores Cookie and Authorization; use
 * isPublicCatalogCacheRequest before allowing shared caching.
 */
export function isPublicCatalogCachePath(
  request: Pick<Request, "method" | "url" | "headers">,
) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

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

export function hasCatalogRequestCredentials(
  request: Pick<Request, "headers">,
) {
  return Boolean(
    request.headers.get("cookie")?.trim() ||
      request.headers.get("authorization")?.trim(),
  );
}

/** Only GETs without credentials may receive the public cache policy. */
export function isPublicCatalogCacheRequest(
  request: Pick<Request, "method" | "url" | "headers">,
) {
  return (
    request.method === "GET" &&
    isPublicCatalogCachePath(request) &&
    !hasCatalogRequestCredentials(request)
  );
}

/**
 * Add a fixed internal query marker that cannot match an allowlisted public URL.
 * The catalog route parsers ignore this unknown parameter and return the same
 * deterministic public data, while their shared-cache policy rejects the URL.
 */
export function privateCatalogCacheRewriteUrl(
  request: Pick<Request, "method" | "url" | "headers">,
) {
  if (!isPublicCatalogCachePath(request)) return null;
  const url = new URL(request.url);
  url.searchParams.set(PRIVATE_CATALOG_CACHE_BYPASS_QUERY, "1");
  return url;
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
