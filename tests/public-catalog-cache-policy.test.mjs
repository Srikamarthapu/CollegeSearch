import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { register } from "tsx/esm/api";

register();

const [
  {
    catalogCacheControl,
    hasCatalogRequestCredentials,
    isPublicCatalogCachePath,
    isPublicCatalogCacheRequest,
    privateCatalogCacheRewriteUrl,
    PRIVATE_CATALOG_CACHE_BYPASS_QUERY,
  },
  versionModule,
] = await Promise.all([
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
    assert.equal(isPublicCatalogCachePath(req), true, url);
    assert.equal(hasCatalogRequestCredentials(req), false, url);
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
    assert.equal(isPublicCatalogCachePath(req), false, req.url);
    assert.equal(isPublicCatalogCacheRequest(req), false, req.url);
    assert.equal(privateCatalogCacheRewriteUrl(req), null, req.url);
    assert.equal(catalogCacheControl(req, publicCacheControl), "private, no-store");
  }

  for (const headers of [
    { cookie: "sb-session=present" },
    { authorization: "Bearer user-token" },
  ]) {
    for (const url of publicRequests) {
      const req = request(url, { headers });
      assert.equal(isPublicCatalogCachePath(req), true, url);
      assert.equal(hasCatalogRequestCredentials(req), true);
      assert.equal(isPublicCatalogCacheRequest(req), false);
      assert.equal(catalogCacheControl(req, publicCacheControl), "private, no-store");

      const rewritten = privateCatalogCacheRewriteUrl(req);
      assert.ok(rewritten);
      assert.equal(rewritten.pathname, new URL(url).pathname);
      assert.equal(rewritten.searchParams.get(PRIVATE_CATALOG_CACHE_BYPASS_QUERY), "1");
      const rewrittenRequest = request(rewritten.href);
      assert.equal(isPublicCatalogCacheRequest(rewrittenRequest), false);
      assert.equal(catalogCacheControl(rewrittenRequest, publicCacheControl), "private, no-store");
    }
  }

  const head = request(publicRequests[0], {
    method: "HEAD",
    headers: { cookie: "sb-session=present" },
  });
  assert.equal(isPublicCatalogCachePath(head), true);
  assert.equal(isPublicCatalogCacheRequest(head), false);
  assert.equal(
    privateCatalogCacheRewriteUrl(head)?.searchParams.get(PRIVATE_CATALOG_CACHE_BYPASS_QUERY),
    "1",
  );

  for (const method of ["POST", "OPTIONS"]) {
    const req = request(publicRequests[0], {
      method,
      headers: { cookie: "sb-session=present" },
    });
    assert.equal(isPublicCatalogCachePath(req), false, method);
    assert.equal(privateCatalogCacheRewriteUrl(req), null, method);
  }

  for (const url of [
    "https://example.test/api/colleges?__private=1",
    "https://example.test/api/colleges/admissions?__private=1",
    "https://example.test/api/colleges/identities?release=" +
      encodeURIComponent(version) +
      "&__private=1",
  ]) {
    assert.equal(isPublicCatalogCachePath(request(url)), false, url);
    assert.equal(isPublicCatalogCacheRequest(request(url)), false, url);
  }
});

test("credentialed public URLs are rewritten to private cache keys by the proxy", async () => {
  const { proxy } = await import("../proxy.ts");
  const publicUrls = [
    "https://example.test/api/colleges",
    "https://example.test/api/colleges/admissions",
    "https://example.test/api/colleges/identities?release=" + encodeURIComponent(version),
  ];

  for (const headers of [
    { cookie: "sb-session=present" },
    { authorization: "Bearer user-token" },
  ]) {
    for (const url of publicUrls) {
      const response = await proxy(nextRequest(url, { headers }));
      const rewrite = response.headers.get("x-middleware-rewrite");
      assert.ok(rewrite, url);
      assert.equal(new URL(rewrite).pathname, new URL(url).pathname);
      assert.equal(
        new URL(rewrite).searchParams.get(PRIVATE_CATALOG_CACHE_BYPASS_QUERY),
        "1",
      );
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(
        response.headers.get("content-security-policy"),
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );
    }
  }

  const headResponse = await proxy(
    nextRequest(publicUrls[0], {
      method: "HEAD",
      headers: { cookie: "sb-session=present" },
    }),
  );
  assert.ok(headResponse.headers.get("x-middleware-rewrite"));
  assert.equal(headResponse.headers.get("cache-control"), "private, no-store");

  for (const method of ["POST", "OPTIONS"]) {
    const response = await proxy(
      nextRequest(publicUrls[0], {
        method,
        headers: { cookie: "sb-session=present" },
      }),
    );
    assert.equal(response.headers.get("x-middleware-rewrite"), null, method);
  }
});

test("private marker retains deterministic route data without gaining cache eligibility", async () => {
  const privateDefaultCollege = await collegesRoute.GET(
    nextRequest("https://example.test/api/colleges?__private=1", {
      headers: { cookie: "sb-session=present" },
    }),
  );
  assert.equal(privateDefaultCollege.headers.get("cache-control"), "private, no-store");
  assert.equal((await privateDefaultCollege.json()).items.length, 24);

  const privateDefaultAdmissions = await admissionsRoute.GET(
    nextRequest("https://example.test/api/colleges/admissions?__private=1", {
      headers: { authorization: "Bearer user-token" },
    }),
  );
  assert.equal(privateDefaultAdmissions.headers.get("cache-control"), "private, no-store");
  assert.ok((await privateDefaultAdmissions.json()).items.length > 0);

  const privateVersionedIdentities = await identitiesRoute.GET(
    nextRequest(
      "https://example.test/api/colleges/identities?release=" +
        encodeURIComponent(version) +
        "&__private=1",
      { headers: { cookie: "sb-session=present" } },
    ),
  );
  assert.equal(privateVersionedIdentities.headers.get("cache-control"), "private, no-store");
  const identityPayload = await privateVersionedIdentities.json();
  assert.equal(identityPayload.total, 3912);
  assert.ok(identityPayload.releaseId);
});

test("proxy and route handlers share the same cache eligibility boundary", async () => {
  const proxySource = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxySource, /isPublicCatalogCachePath\(request\)/);
  assert.match(proxySource, /isPublicCatalogCacheRequest\(request\)/);
  assert.match(proxySource, /privateCatalogCacheRewriteUrl\(request\)/);
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
