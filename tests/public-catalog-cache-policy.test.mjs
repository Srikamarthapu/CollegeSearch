import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { register } from "tsx/esm/api";

register();

const [{ isPublicCatalogCacheRequest, catalogCacheControl }, versionModule] =
  await Promise.all([
    import("../app/lib/public-catalog-cache-policy.ts"),
    import("../app/lib/college-directory-cache-version.ts"),
  ]);
const version = versionModule.COLLEGE_DIRECTORY_CACHE_VERSION;
const { NextRequest } = await import("next/server");
const [collegesRoute, admissionsRoute, identitiesRoute, lookupRoute] = await Promise.all([
  import("../app/api/colleges/route.ts"),
  import("../app/api/colleges/admissions/route.ts"),
  import("../app/api/colleges/identities/route.ts"),
  import("../app/api/colleges/lookup/route.ts"),
]);

const publicCacheControl = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

function request(url, { method = "GET", headers = {} } = {}) {
  return new Request(url, { method, headers });
}

function nextRequest(url, options = {}) {
  return new NextRequest(url, options);
}

test("shared caching requires an exact public catalog URL and a credential-free GET", () => {
  const publicRequests = [
    "https://example.test/api/colleges",
    "https://example.test/api/colleges/admissions",
    `https://example.test/api/colleges/identities?release=${encodeURIComponent(version)}`,
  ];
  for (const url of publicRequests) {
    const req = request(url);
    assert.equal(isPublicCatalogCacheRequest(req), true, url);
    assert.equal(catalogCacheControl(req, publicCacheControl), publicCacheControl);
  }

  const privateRequests = [
    request("https://example.test/api/colleges?q=Berkeley"),
    request("https://example.test/api/colleges?offset=0&limit=24"),
    request("https://example.test/api/colleges?compare=110635"),
    request("https://example.test/api/colleges/admissions?q=Stanford"),
    request("https://example.test/api/colleges/identities"),
    request(`https://example.test/api/colleges/identities?release=${encodeURIComponent("old-release")}`),
    request(`https://example.test/api/colleges/identities?release=${encodeURIComponent(version)}&extra=1`),
    request(`https://example.test/api/colleges/identities?release=${encodeURIComponent(version)}&release=${encodeURIComponent(version)}`),
    request("https://example.test/api/colleges", { method: "POST" }),
    request("https://example.test/api/account"),
  ];
  for (const req of privateRequests) {
    assert.equal(isPublicCatalogCacheRequest(req), false, req.url);
    assert.equal(catalogCacheControl(req, publicCacheControl), "private, no-store");
  }

  for (const headers of [
    { cookie: "sb-session=present" },
    { authorization: "Bearer user-token" },
  ]) {
    const req = request(publicRequests[0], { headers });
    assert.equal(isPublicCatalogCacheRequest(req), false);
    assert.equal(catalogCacheControl(req, publicCacheControl), "private, no-store");
  }
});

test("proxy and route handlers share the same cache eligibility boundary", async () => {
  const proxySource = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxySource, /isPublicCatalogCacheRequest\(request\)/);
  assert.match(proxySource, /enforcePrivateNoStore\(response\)/);
  assert.match(proxySource, /updateSupabaseSession\(request, requestHeaders\)/);
});

test("actual catalog routes cache only their deterministic defaults and never vary on cookies", async () => {
  const defaultColleges = await collegesRoute.GET(nextRequest("https://example.test/api/colleges"));
  assert.equal(defaultColleges.status, 200);
  assert.equal(defaultColleges.headers.get("cache-control"), publicCacheControl);
  assert.equal(defaultColleges.headers.get("vary"), null);
  assert.equal(defaultColleges.headers.get("set-cookie"), null);
  const defaultPayload = await defaultColleges.json();
  assert.equal(defaultPayload.items.length, 24);
  assert.ok(defaultPayload.total >= defaultPayload.items.length);

  const filteredCollegeRequests = [
    nextRequest("https://example.test/api/colleges?offset=0&limit=24"),
    nextRequest("https://example.test/api/colleges?q=Berkeley"),
    nextRequest("https://example.test/api/colleges", { headers: { cookie: "sb-session=present" } }),
    nextRequest("https://example.test/api/colleges", { headers: { authorization: "Bearer user-token" } }),
  ];
  for (const req of filteredCollegeRequests) {
    const response = await collegesRoute.GET(req);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }

  const defaultAdmissions = await admissionsRoute.GET(
    nextRequest("https://example.test/api/colleges/admissions"),
  );
  assert.equal(defaultAdmissions.status, 200);
  assert.equal(
    defaultAdmissions.headers.get("cache-control"),
    "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
  );
  assert.equal(defaultAdmissions.headers.get("vary"), null);
  assert.ok((await defaultAdmissions.json()).items.length > 0);
  const admissionsSearch = await admissionsRoute.GET(
    nextRequest("https://example.test/api/colleges/admissions?q=Stanford"),
  );
  assert.equal(admissionsSearch.headers.get("cache-control"), "private, no-store");
  for (const headers of [
    { cookie: "sb-session=present" },
    { authorization: "Bearer user-token" },
  ]) {
    const response = await admissionsRoute.GET(
      nextRequest("https://example.test/api/colleges/admissions", { headers }),
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }

  const versionedIdentities = await identitiesRoute.GET(
    nextRequest(`https://example.test/api/colleges/identities?release=${encodeURIComponent(version)}`),
  );
  assert.equal(versionedIdentities.status, 200);
  assert.equal(
    versionedIdentities.headers.get("cache-control"),
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  );
  assert.equal(versionedIdentities.headers.get("vary"), null);
  assert.equal(versionedIdentities.headers.get("set-cookie"), null);
  assert.equal(versionedIdentities.headers.get("x-college-directory-version"), version);

  for (const url of [
    "https://example.test/api/colleges/identities",
    `https://example.test/api/colleges/identities?release=${encodeURIComponent("stale")}`,
    `https://example.test/api/colleges/identities?release=${encodeURIComponent(version)}&other=1`,
  ]) {
    const response = await identitiesRoute.GET(nextRequest(url));
    assert.equal(response.headers.get("cache-control"), "private, no-store", url);
  }
  for (const headers of [
    { cookie: "sb-session=present" },
    { authorization: "Bearer user-token" },
  ]) {
    const response = await identitiesRoute.GET(
      nextRequest(`https://example.test/api/colleges/identities?release=${encodeURIComponent(version)}`, { headers }),
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }

  const postHeaders = { "content-type": "application/json" };
  const personalizedSearch = await collegesRoute.POST(
    nextRequest("https://example.test/api/colleges", {
      method: "POST",
      headers: postHeaders,
      body: JSON.stringify({ filters: {}, selectedIds: [110635] }),
    }),
  );
  assert.equal(personalizedSearch.status, 200);
  assert.equal(personalizedSearch.headers.get("cache-control"), "private, no-store");

  const identityLookup = await lookupRoute.POST(
    nextRequest("https://example.test/api/colleges/lookup", {
      method: "POST",
      headers: postHeaders,
      body: JSON.stringify({ unitIds: [110635] }),
    }),
  );
  assert.equal(identityLookup.status, 200);
  assert.equal(identityLookup.headers.get("cache-control"), "private, no-store");

  const identitiesSource = await readFile(
    new URL("../app/api/colleges/identities/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(identitiesSource, /export\s+const\s+revalidate\s*=/);
});
