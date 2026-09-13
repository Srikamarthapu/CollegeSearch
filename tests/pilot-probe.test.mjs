import test from "node:test";
import assert from "node:assert/strict";
import { safeOrigin, publishedSnapshot, inspectDocument, inspectCallback, smoke, classroom, latencySummary } from "../scripts/ops/pilot-probe.mjs";

const NOW = Date.parse("2026-09-13T20:00:00Z");
const origin = "https://college.example";
const nonce = "abcdefgh12345678abcdefgh12345678";
const health = '<h2>26<!-- --> of <!-- -->26<!-- --> registered artifacts passed</h2><p>Published verification snapshot: <time dateTime="2026-09-13T19:00:00Z">Today</time></p>';
function doc(value = nonce, extra = "") {
  return `<title>Explore | CollegeSearch</title><script nonce="${value}">window.ready=true</script><style nonce="${value}">body{color:black}</style><script src="/assets/main.js"></script>${extra}`;
}
function response(body, value = nonce, overrides = {}) {
  return new Response(body, { headers: { "content-type": "text/html", "cache-control": "private, no-cache, no-store, max-age=0", "content-security-policy": `script-src 'self' 'nonce-${value}'`, "x-frame-options": "DENY", "x-content-type-options": "nosniff", ...overrides } });
}

test("only explicit HTTPS origins and loopback HTTP origins are accepted", () => {
  assert.equal(safeOrigin(origin), origin);
  assert.equal(safeOrigin("http://127.0.0.1:4173/"), "http://127.0.0.1:4173");
  for (const bad of ["http://college.example", "https://name:secret@college.example", "https://college.example/path", "https://college.example/?token=x", "https://college.example/#hash"]) assert.throws(() => safeOrigin(bad));
});

test("published freshness is separate from availability and handles React comment separators", () => {
  assert.equal(publishedSnapshot(health, NOW).state, "within_window");
  assert.equal(publishedSnapshot(health, NOW + 9 * 86400_000).state, "stale");
  assert.equal(publishedSnapshot(health.replace("26<!-- --> of", "25<!-- --> of"), NOW).state, "needs_review");
  assert.equal(publishedSnapshot("", NOW).state, "unknown");
  assert.equal(publishedSnapshot(health.replaceAll("26<!-- -->", "0<!-- -->"), NOW).state, "unknown");
  assert.equal(publishedSnapshot(health.replace("2026-09-13", "2026-09-15"), NOW).state, "unknown");
});

test("document identity, private caching, and all executable inline nonces are checked", () => {
  assert.deepEqual(inspectDocument(response(doc()), doc(), "/").failures, []);
  const broken = doc().replace(`nonce="${nonce}"`, 'nonce="wrong"');
  assert.ok(inspectDocument(response(broken), broken, "/").failures.includes("inline script nonce does not match CSP"));
  const unrelated = "<title>Some Other Application</title>";
  const bad = inspectDocument(response(unrelated, nonce, { "cache-control": "public, max-age=600" }), unrelated, "/").failures;
  assert.ok(bad.includes("CollegeSearch title is missing"));
  assert.ok(bad.includes("document is missing private/no-store caching"));
});

test("callbacks must fail on the expected same-origin path without exchanging an auth code", () => {
  const make = (location) => new Response(null, { status: 307, headers: { location, "cache-control": "private, no-store" } });
  assert.deepEqual(inspectCallback(make("/auth/auth-code-error?reason=missing-code"), origin, "configured"), []);
  assert.deepEqual(inspectCallback(make("/auth/auth-code-error?reason=configuration"), origin, "disabled"), []);
  assert.ok(inspectCallback(make("https://other.example/auth/auth-code-error?reason=missing-code"), origin, "configured").length);
  assert.ok(inspectCallback(make("/auth/auth-code-error?reason=configuration"), origin, "configured").length);
});

test("smoke records all checked routes, assets, callbacks and freshness without keeping bodies or cookies", async () => {
  const requests = []; let serial = 0;
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "manual"); assert.equal(options.credentials, "omit");
    assert.equal(options.headers.Authorization, undefined);
    const path = url.pathname;
    if (path.startsWith("/auth/")) return new Response(null, { status: 307, headers: { location: "/auth/auth-code-error?reason=missing-code", "cache-control": "private, no-store" } });
    if (path === "/favicon.svg") return new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } });
    if (path === "/_vinext/image") return new Response("image", { headers: { "content-type": "image/webp" } });
    if (path === "/assets/main.js") return new Response("console.log('ok')", { headers: { "content-type": "text/javascript" } });
    const n = `${nonce}${++serial}`; return response(doc(n, path === "/data-health" ? health : ""), n);
  };
  const result = await smoke({ origin, now: NOW, fetcher });
  assert.equal(result.status, "passed"); assert.equal(result.freshnessStatus, "passed"); assert.equal(requests.length, 16);
  assert.ok(requests.some(({ url }) => url.pathname === "/plan"), "planner is included in release smoke");
  assert.equal(JSON.stringify(result).includes("window.ready"), false);
  assert.equal(JSON.stringify(result).includes("Set-Cookie"), false);
  const brokenPlanner = await smoke({ origin, now: NOW, fetcher: (url, options) => url.pathname === "/plan" ? Promise.resolve(new Response("Unavailable", { status: 503 })) : fetcher(url, options) });
  assert.equal(brokenPlanner.status, "failed");
  assert.ok(brokenPlanner.checks.some((check) => check.path === "/plan" && check.failures.some((failure) => failure.includes("503"))), "planner failure is reported explicitly");
});

test("smoke reports independent endpoint failures instead of stopping at the first", async () => {
  const result = await smoke({ origin, now: NOW, fetcher: async () => new Response("down", { status: 503 }) });
  assert.equal(result.status, "failed"); assert.equal(result.freshnessStatus, "needs_review");
  assert.ok(result.checks.filter(c => c.failures.length).length >= 14);
});

test("classroom scenario is capped at thirty students and 120 GET requests", async () => {
  let calls = 0;
  const result = await classroom({ origin, delay: async () => {}, fetcher: async (_url, options) => { calls++; assert.equal(options.method, "GET"); return response(doc()); } });
  assert.equal(calls, 120); assert.equal(result.summary.attempted, 120); assert.equal(result.notAttempted, 0); assert.equal(result.status, "passed");
});

test("classroom scenario stops issuing new work after repeated errors", async () => {
  const result = await classroom({ origin, delay: async () => {}, fetcher: async () => new Response("down", { status: 503 }) });
  assert.equal(result.status, "failed"); assert.equal(result.stoppedEarly, true); assert.ok(result.summary.attempted < 120); assert.ok(result.summary.failed >= 5);
});

test("latency summary uses a real nearest-rank p95 and retains failures", () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ ms: i + 1, failures: i === 0 ? ["bad"] : [] }));
  assert.deepEqual(latencySummary(samples), { attempted: 20, failed: 1, p50Ms: 10, p95Ms: 19, maximumMs: 20 });
});
