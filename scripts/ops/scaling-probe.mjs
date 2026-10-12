import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { safeOrigin, inspectDocument } from './pilot-probe.mjs';

if (!process.argv[2]) throw new Error('Usage: node scripts/ops/scaling-probe.mjs https://deployment-origin [report.json]');
const origin = safeOrigin(process.argv[2]);
const reportPath = process.argv[3] ?? 'work/scale/live-verification.json';
const summary = JSON.parse(await readFile('data/college-runtime-summary.json', 'utf8'));
const checks = [];
async function get(path, options = {}) {
  const started = performance.now();
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(20_000), ...options });
  const ttfbMs = Math.round(performance.now() - started);
  const bytes = await response.arrayBuffer();
  const body = new TextDecoder().decode(bytes);
  const result = { path, method: options.method ?? 'GET', credentialVariant: options.headers?.cookie ? 'cookie' : options.headers?.authorization ? 'authorization' : 'none', status: response.status, ttfbMs, totalMs: Math.round(performance.now() - started),
    decodedBytes: bytes.byteLength, cache: response.headers.get('x-vercel-cache'),
    cacheControl: response.headers.get('cache-control'), contentType: response.headers.get('content-type'),
    setCookie: response.headers.has('set-cookie'), failures: [] };
  checks.push(result);
  return { response, body, result };
}
const documents = [];
for (const path of ['/', '/', '/explore', '/majors', '/majors/engineering', '/data-sources', '/methodology']) {
  const item = await get(path);
  const inspected = inspectDocument(item.response, item.body, path);
  item.result.failures.push(...inspected.failures);
  documents.push({ ...item, nonce: inspected.nonce });
}
if (documents[0].nonce === documents[1].nonce) documents[1].result.failures.push('HTML nonce was reused');
const publicPaths = ['/api/colleges', '/api/colleges/admissions', `/api/colleges/identities?release=${encodeURIComponent(summary.cacheVersion)}`];
for (const path of publicPaths) {
  const runs = [];
  for (let count = 0; count < 3; count++) {
    const item = await get(path);
    if (item.result.status !== 200 || item.result.setCookie || /private|no-store/.test(item.result.cacheControl ?? '')) item.result.failures.push('Public response failed cache/privacy boundary');
    runs.push(item.result);
  }
  if (origin.includes('.vercel.app') && !runs.some(r => r.cache === 'HIT')) runs.at(-1).failures.push('No CDN HIT observed across three identical requests');
}
for (const [path, options] of [
  ['/api/colleges?q=Stanford', {}],
  ['/api/colleges?compare=243744', {}],
  ...publicPaths.map(path => [path, { headers: { cookie: 'collegesearch-cache-probe=1' } }]),
  ...publicPaths.map(path => [path, { method: 'HEAD' }]),
  ['/api/colleges', { headers: { authorization: 'Bearer invalid-probe' } }],
  ['/api/colleges/identities?release=invalid', {}],
]) {
  const { result } = await get(path, options);
  if (!/private/.test(result.cacheControl ?? '') || !/no-store/.test(result.cacheControl ?? '')) result.failures.push('Personalized/query variant is not private no-store');
  if (result.cache === 'HIT') result.failures.push('Private variant unexpectedly served from CDN');
}
for (const [path, options] of [['/api/adviser', {}], ['/api/internal/adviser-worker', { method: 'POST' }]]) {
  const { result } = await get(path, options);
  if (result.status !== 401) result.failures.push('Unauthenticated endpoint did not deny access');
}
const imagePath = /<img\b[^>]*\bsrc=["'](\/_next\/image\?[^"']+)["']/i.exec(documents[0].body)?.[1]?.replaceAll('&amp;', '&');
if (imagePath) {
  const { result } = await get(imagePath, { headers: { accept: 'image/avif,image/webp,image/*' } });
  if (result.status !== 200 || !/image\/(avif|webp)/.test(result.contentType ?? '')) result.failures.push('Responsive campus image did not use a modern format');
} else checks.push({ path: '(campus image)', failures: ['No optimized campus image found'] });
const report = { checkedAt: new Date().toISOString(), origin, checks, passed: checks.every(r => r.failures.length === 0),
  scope: 'Bounded sequential anonymous HTTP/cache/asset checks. Warm observations are not cold-start guarantees, browser Core Web Vitals, or a load test.' };
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, checks: checks.length, failures: checks.filter(r => r.failures.length), reportPath }));
if (!report.passed) process.exitCode = 1;
