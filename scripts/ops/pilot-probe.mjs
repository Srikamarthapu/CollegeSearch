import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { verificationRecency, VERIFICATION_MAX_AGE_HOURS } from "../../app/lib/verification-recency.mjs";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function safeOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname)))) {
    throw new Error("Supply one HTTPS origin, or an HTTP loopback origin; no credentials, path, query, or fragment.");
  }
  return url.origin;
}

export function publishedSnapshot(html, now = Date.now(), maxAgeHours = VERIFICATION_MAX_AGE_HOURS) {
  const stamp = /Published verification snapshot:[\s\S]{0,500}?<time\b[^>]*\bdatetime=["']([^"']+)["']/i.exec(html)?.[1];
  const counts = /(?:>|\s)(\d+)\s*(?:<!--.*?-->\s*)?of\s*(?:<!--.*?-->\s*)?(\d+)\s*(?:<!--.*?-->\s*)?registered artifacts passed/i.exec(html.replaceAll(/<!--.*?-->/g, ""));
  return verificationRecency({ checkedAt: stamp ?? null, passed: counts ? +counts[1] : NaN, total: counts ? +counts[2] : NaN }, now, maxAgeHours);
}

export function inspectDocument(response, html, path) {
  const failures = [];
  const headers = response.headers;
  const cache = headers.get("cache-control") ?? "";
  const csp = headers.get("content-security-policy") ?? "";
  const nonce = /'nonce-([A-Za-z0-9_-]{16,128})'/.exec(csp)?.[1];
  if (response.status !== 200) failures.push(`document status ${response.status}, expected 200`);
  if (!/text\/html/i.test(headers.get("content-type") ?? "")) failures.push("document MIME is not HTML");
  if (!/<title[^>]*>[^<]*CollegeSearch/i.test(html)) failures.push("CollegeSearch title is missing");
  if (!/\bprivate\b/i.test(cache) || !/\bno-store\b/i.test(cache)) failures.push("document is missing private/no-store caching");
  if (headers.get("x-frame-options")?.toUpperCase() !== "DENY") failures.push("frame protection is missing");
  if (headers.get("x-content-type-options")?.toLowerCase() !== "nosniff") failures.push("nosniff is missing");
  if (!nonce) failures.push("CSP nonce is missing");
  for (const match of html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const [, tag, attrs, body] = match;
    if (tag.toLowerCase() === "script" && /\bsrc\s*=/i.test(attrs)) continue;
    if (!body.trim()) continue;
    const actual = /\bnonce=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (actual !== nonce) failures.push(`inline ${tag} nonce does not match CSP`);
  }
  return { path, failures: [...new Set(failures)], nonce: nonce ?? null };
}

export function inspectCallback(response, origin, authMode) {
  const failures = [];
  if (![302, 303, 307, 308].includes(response.status)) failures.push(`callback status ${response.status}, expected redirect`);
  let destination;
  try { destination = new URL(response.headers.get("location") ?? "", origin); } catch {}
  const expected = authMode === "configured" ? "missing-code" : "configuration";
  if (!destination || destination.origin !== origin || destination.pathname !== "/auth/auth-code-error" || destination.searchParams.get("reason") !== expected) failures.push("callback did not return the expected same-origin error");
  const cache = response.headers.get("cache-control") ?? "";
  if (!/\bprivate\b/i.test(cache) || !/\bno-store\b/i.test(cache)) failures.push("callback is missing private/no-store caching");
  return failures;
}

async function bodyLimited(response, maximum = 8 * 1024 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let bytes = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) { await reader.cancel(); throw new Error("response exceeded 8MiB limit"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function requestOne(origin, path, fetcher = fetch) {
  const start = performance.now();
  try {
    const response = await fetcher(new URL(path, origin), {
      method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(10_000),
      headers: { Accept: "text/html,application/json;q=0.8,*/*;q=0.5", "User-Agent": "CollegeSearch-Pilot-Probe/1.0" },
    });
    const body = await bodyLimited(response);
    return { path, ms: +(performance.now() - start).toFixed(1), response, body, error: null };
  } catch (error) { return { path, ms: +(performance.now() - start).toFixed(1), error: String(error.message).slice(0, 160) }; }
}

function publicResult(result, failures) {
  return { path: result.path, ms: result.ms, httpStatus: result.response?.status ?? null, setCookiePresent: result.response?.headers.has("set-cookie") ?? false, failures };
}

export async function smoke({ origin, authMode = "configured", now = Date.now(), fetcher = fetch }) {
  const checks = [];
  const paths = ["/", "/", "/explore", "/colleges/university-of-california-berkeley", "/compare", "/saved", "/match", "/plan", "/account", "/privacy", "/data-health"];
  const nonces = [];
  let sourceSnapshot = { state: "unknown" };
  let homeHtml = "";
  for (const path of paths) {
    const result = await requestOne(origin, path, fetcher);
    if (result.error) { checks.push(publicResult(result, [result.error])); continue; }
    const inspected = inspectDocument(result.response, result.body, path);
    if (path === "/") { nonces.push(inspected.nonce); homeHtml = result.body; }
    if (path === "/data-health") sourceSnapshot = publishedSnapshot(result.body, now);
    checks.push(publicResult(result, inspected.failures));
  }
  if (nonces.length !== 2 || !nonces[0] || nonces[0] === nonces[1]) checks.push({ path: "/ (nonce pair)", failures: ["two fresh documents must have distinct CSP nonces"] });
  for (const path of ["/auth/callback", "/auth/recovery-callback"]) {
    const result = await requestOne(origin, path, fetcher);
    checks.push(publicResult(result, result.error ? [result.error] : inspectCallback(result.response, origin, authMode)));
  }
  // Current first-party public asset and the actual worker optimizer parameters.
  const jsPath = /<script\b[^>]*\bsrc=["']((?:\/assets\/|\/_next\/static\/)[^"']+)["']/i.exec(homeHtml)?.[1];
  const assetChecks = [["/favicon.svg", /image\/svg\+xml/], ["/_vinext/image?url=%2Fberkeley-campus.jpg&w=640&q=75", /image\/(?:webp|avif|jpeg|png)/]];
  if (jsPath) assetChecks.push([jsPath.replaceAll("&amp;", "&"), /(?:javascript|ecmascript)/]);
  else checks.push({ path: "(home script asset)", failures: ["same-origin compiled script reference was not found"] });
  for (const [path, mime] of assetChecks) {
    const result = await requestOne(origin, path, fetcher);
    const failures = result.error ? [result.error] : result.response.status !== 200 || !mime.test(result.response.headers.get("content-type") ?? "") ? ["asset or optimized image did not return expected HTTP 200/MIME"] : [];
    checks.push(publicResult(result, failures));
  }
  return { status: checks.some(c => c.failures.length) ? "failed" : "passed", checks, sourceSnapshot, freshnessStatus: sourceSnapshot.state === "within_window" ? "passed" : "needs_review" };
}

export function latencySummary(results) {
  const values = results.map(r => r.ms).filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (fraction) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? null;
  return { attempted: results.length, failed: results.filter(r => r.failures.length).length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maximumMs: values.at(-1) ?? null };
}

export async function classroom({ origin, fetcher = fetch, delay = sleep }) {
  const checks = [];
  const paths = ["/explore", "/colleges/university-of-california-berkeley", "/compare", "/saved"];
  let stop = false;
  await Promise.all(Array.from({ length: 30 }, async (_, student) => {
    await delay(student * 200);
    for (const path of paths) {
      if (stop) return;
      const result = await requestOne(origin, path, fetcher);
      const failures = result.error ? [result.error] : inspectDocument(result.response, result.body, path).failures;
      checks.push(publicResult(result, failures));
      if (checks.filter(c => c.failures.length).length >= 5) stop = true;
      await delay(1500);
    }
  }));
  const summary = latencySummary(checks);
  return { status: summary.failed || summary.attempted !== 120 || summary.p95Ms > 3000 ? "failed" : "passed", workload: { virtualStudents: 30, pageviewsPerStudent: 4, maximumRequests: 120, startStaggerMs: 200, thinkTimeMs: 1500, mode: "anonymous document requests; no browser assets or account writes" }, stoppedEarly: stop, notAttempted: 120 - checks.length, summary, checks };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const at = arg.indexOf("="); if (!arg.startsWith("--") || at < 0) throw new Error("Use --name=value arguments"); return [arg.slice(2, at), arg.slice(at + 1)]; }));
  const origin = safeOrigin(args.origin);
  const profile = args.profile ?? "smoke";
  if (!["smoke", "classroom"].includes(profile) || !["configured", "disabled"].includes(args.auth ?? "configured") || !args.report) throw new Error("Use --origin=URL --profile=smoke|classroom --auth=configured|disabled --report=FILE");
  const startedAt = new Date().toISOString();
  const result = profile === "smoke" ? await smoke({ origin, authMode: args.auth }) : await classroom({ origin });
  const report = { schemaVersion: 1, startedAt, checkedAt: new Date().toISOString(), origin, profile, ...result, scope: "Read-only HTTP probe. No OAuth, emails, database writes, browser interaction, alert delivery, or rollback was performed." };
  await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, freshnessStatus: result.freshnessStatus, report: args.report }));
  if (result.status !== "passed" || result.freshnessStatus === "needs_review") process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
