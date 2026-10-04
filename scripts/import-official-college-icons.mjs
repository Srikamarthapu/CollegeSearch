import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(projectRoot, "data/colleges.json");
const manifestPath = path.join(projectRoot, "data/college-logo-official-icons.json");
const clientAssetMapPath = path.join(projectRoot, "data/college-logo-assets.json");
const assetDirectory = path.join(projectRoot, "public/college-logos");
const maxDocumentBytes = 4_000_000;
const maxIconBytes = 750_000;
const timeoutMs = 5_000;
const genericIconHashes = new Set([
  // Blank/default 32px favicons shared by unrelated institutions.
  "1f658761d6081d4a9b536d9833ec35630cece2ade544e10ab30130614f37d5b7",
  "9deb629637088856fe61dc868bf40a7d21ed942e4117659f3d6c3408f59b906b",
  // Generic initial/shape placeholders repeated across unrelated institutions.
  "4758ae29d0eb2a50810fde41367bf211d155d4ef8bc437f6edbafd8a6c3fb959",
  "3065b76bc6f4b040222bd48487f5a26ce6e88e0dbc502a7fa0f14d7b94eecabc",
  // Shared 16px default favicon observed on unrelated institutions.
  "33c1436f8c40ca2582d091c449fccc34ed9bf73f02526c5fdef44f4f06c6321b",
]);

function sameInstitutionHost(left, right) {
  const withoutWww = (hostname) => hostname.toLowerCase().replace(/^www\./, "");
  return withoutWww(left) === withoutWww(right);
}

function cleanHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#38;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function attributes(tag) {
  const result = new Map();
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    result.set(match[1].toLowerCase(), cleanHtml(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return result;
}

function iconCandidates(html, pageUrl) {
  const candidates = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attr = attributes(match[0]);
    const rel = (attr.get("rel") ?? "").toLowerCase().split(/\s+/);
    const isIcon = rel.includes("icon") || rel.includes("apple-touch-icon");
    const href = attr.get("href");
    if (!isIcon || !href) continue;
    try {
      const url = new URL(href, pageUrl);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      candidates.push({
        url,
        rel: rel.includes("apple-touch-icon") ? "apple-touch-icon" : "icon",
        type: attr.get("type") ?? "",
        sizes: attr.get("sizes") ?? "",
      });
    } catch {
      // Ignore malformed links from the source page.
    }
  }

  const score = (candidate) => {
    const path = candidate.url.pathname.toLowerCase();
    const type = candidate.type.toLowerCase();
    if (type.includes("svg") || path.endsWith(".svg")) return 0;
    if (type.includes("png") || path.endsWith(".png")) return 1;
    if (candidate.rel === "apple-touch-icon") return 2;
    if (type.includes("webp") || path.endsWith(".webp")) return 3;
    if (type.includes("jpeg") || /\.(jpe?g)$/.test(path)) return 4;
    if (type.includes("icon") || path.endsWith(".ico")) return 5;
    return 6;
  };

  candidates.sort((left, right) => score(left) - score(right));
  const seen = new Set();
  return candidates.filter(({ url }) => {
    const key = url.href;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSameHost(url, officialHost, accept, maxBytes) {
  let current = new URL(url);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    if (current.protocol !== "https:" || !sameInstitutionHost(current.hostname, officialHost)) {
      return { ok: false, reason: "external-host" };
    }
    let response;
    try {
      response = await fetch(current, {
        headers: { accept, "user-agent": "CollegeSearch-Official-Icon-Cache/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error?.name === "TimeoutError" ? "timeout" : "network-error";
      return { ok: false, reason };
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirect === 3) return { ok: false, reason: "redirect-limit" };
      try {
        current = new URL(location, current);
      } catch {
        return { ok: false, reason: "invalid-redirect" };
      }
      continue;
    }
    if (!response.ok) return { ok: false, reason: `http-${response.status}` };

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, reason: "too-large" };
    }
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, reason: "empty-response" };
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
          await reader.cancel();
          return { ok: false, reason: "too-large" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, reason: "read-error" };
    }
    return {
      ok: true,
      url: current,
      contentType,
      bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    };
  }
  return { ok: false, reason: "redirect-limit" };
}

function imageFormat(contentType, bytes) {
  const prefix = bytes.subarray(0, 512).toString("utf8").trimStart();
  if (
    contentType === "image/svg+xml" ||
    prefix.startsWith("<svg") ||
    prefix.startsWith("<?xml")
  ) {
    const svg = bytes.toString("utf8");
    if (
      svg.length > maxIconBytes ||
      !/<svg\b/i.test(svg) ||
      /<!doctype\b|<!entity\b|<script\b|<foreignObject\b|<style\b|\son\w+\s*=|javascript:|vbscript:|@import|url\s*\(/i.test(svg) ||
      [...svg.matchAll(/(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
        .some((match) => !String(match[1] ?? match[2] ?? match[3] ?? "").startsWith("#"))
    ) {
      return null;
    }
    return { extension: "svg", contentType: "image/svg+xml", bytes: Buffer.from(svg) };
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { extension: "png", contentType: "image/png", bytes };
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return { extension: "webp", contentType: "image/webp", bytes };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg", bytes };
  }
  if (
    bytes.length >= 6 &&
    (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return { extension: "gif", contentType: "image/gif", bytes };
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0
  ) {
    return { extension: "ico", contentType: "image/x-icon", bytes };
  }
  return null;
}

function assetName(college, extension) {
  const safeSlug = college.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 52);
  return `${college.unitId}-${safeSlug}.${extension}`;
}

function genericPlatformIcon(entry) {
  const url = typeof entry.sourceUrl === "string" ? entry.sourceUrl : "";
  return (
    genericIconHashes.has(entry.sha256 ?? entry.rejectedSha256) ||
    /\/wp-includes\/images\/w-logo-(?:gray|blue)-white-bg\.png(?:\?|$)/i.test(url)
  );
}

async function demoteGenericPlatformIcons(entriesByUnitId) {
  let demoted = 0;
  for (const [unitId, entry] of entriesByUnitId) {
    if (entry.status !== "verified" || !genericPlatformIcon(entry)) continue;
    const asset = typeof entry.asset === "string" ? entry.asset : "";
    if (/^\/college-logos\/[a-z0-9-]+\.(?:svg|png|jpg|webp|gif|ico)$/i.test(asset)) {
      const assetPath = path.resolve(projectRoot, "public", asset.slice(1));
      if (assetPath.startsWith(`${assetDirectory}${path.sep}`)) {
        await rm(assetPath, { force: true });
      }
    }
    const rejectedSha256 = entry.sha256 ?? entry.rejectedSha256;
    entriesByUnitId.set(unitId, {
      unitId: entry.unitId,
      slug: entry.slug,
      websiteUrl: entry.websiteUrl,
      sourceUrl: entry.sourceUrl,
      contentType: entry.contentType,
      checkedOn: entry.checkedOn,
      status: "unavailable",
      reason: "generic-platform-icon",
      reviewNote: "The official page exposed a shared CMS or default placeholder, not an institution-specific mark.",
      rejectedSha256,
    });
    demoted += 1;
  }
  return demoted;
}

async function inspectCollege(college) {
  let officialUrl;
  try {
    officialUrl = new URL(college.website);
    if (officialUrl.protocol !== "https:" || officialUrl.username || officialUrl.password) {
      return { unitId: college.unitId, slug: college.slug, status: "unavailable", reason: "invalid-official-website" };
    }
  } catch {
    return { unitId: college.unitId, slug: college.slug, status: "unavailable", reason: "invalid-official-website" };
  }

  const page = await fetchSameHost(
    officialUrl,
    officialUrl.hostname,
    "text/html,application/xhtml+xml",
    maxDocumentBytes,
  );
  if (!page.ok) {
    return {
      unitId: college.unitId,
      slug: college.slug,
      websiteUrl: officialUrl.href,
      status: "unavailable",
      reason: `website-${page.reason}`,
    };
  }
  const html = page.bytes.toString("utf8");
  if (!/(?:text\/html|application\/xhtml\+xml)/i.test(page.contentType) || /<html\b|<!doctype html/i.test(html) === false) {
    return { unitId: college.unitId, slug: college.slug, websiteUrl: page.url.href, status: "unavailable", reason: "official-website-not-html" };
  }

  const candidates = iconCandidates(html, page.url);
  candidates.push(
    { url: new URL("/favicon.ico", page.url), rel: "favicon-fallback", type: "", sizes: "" },
    { url: new URL("/favicon.png", page.url), rel: "favicon-fallback", type: "image/png", sizes: "" },
    { url: new URL("/apple-touch-icon.png", page.url), rel: "favicon-fallback", type: "image/png", sizes: "" },
  );

  let lastReason = "no-declared-icon";
  for (const candidate of candidates) {
    if (!sameInstitutionHost(candidate.url.hostname, officialUrl.hostname)) continue;
    const response = await fetchSameHost(
      candidate.url,
      officialUrl.hostname,
      "image/svg+xml,image/png,image/webp,image/jpeg,image/gif,image/x-icon,image/vnd.microsoft.icon,*/*;q=0.1",
      maxIconBytes,
    );
    if (!response.ok) {
      lastReason = response.reason;
      continue;
    }
    const image = imageFormat(response.contentType, response.bytes);
    if (!image) {
      lastReason = "unsupported-or-unsafe-image";
      continue;
    }
    return {
      unitId: college.unitId,
      slug: college.slug,
      status: "verified",
      websiteUrl: page.url.href,
      sourceUrl: response.url.href,
      sourceType: candidate.rel,
      contentType: image.contentType,
      bytes: image.bytes,
      extension: image.extension,
    };
  }

  return {
    unitId: college.unitId,
    slug: college.slug,
    websiteUrl: page.url.href,
    status: "unavailable",
    reason: lastReason,
  };
}

async function writeManifest(entries) {
  const tempPath = `${manifestPath}.tmp`;
  const content = `${JSON.stringify(entries, null, 2)}\n`;
  await writeFile(tempPath, content, { mode: 0o600 });
  await rename(tempPath, manifestPath);
}

async function writeClientAssetProjection(entries) {
  const assets = entries
    .filter((entry) => entry.status === "verified" && entry.asset)
    .flatMap(({ unitId, asset }) => {
      const match = /^\/college-logos\/[0-9]+-[a-z0-9-]+\.(svg|png|jpg|webp|gif|ico)$/i.exec(asset);
      return match ? [[unitId, match[1].toLowerCase()]] : [];
    })
    .sort((left, right) => left[0] - right[0]);
  const tempPath = `${clientAssetMapPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(assets)}\n`, { mode: 0o644 });
  await rename(tempPath, clientAssetMapPath);
}

function parseArgs(args) {
  const result = { apply: false, limit: Infinity, concurrency: 24, refreshUnavailable: false };
  for (const arg of args) {
    if (arg === "--apply") result.apply = true;
    else if (arg === "--refresh-unavailable") result.refreshUnavailable = true;
    else if (arg.startsWith("--limit=")) result.limit = Math.max(0, Number(arg.slice(8)) || 0);
    else if (arg.startsWith("--concurrency=")) result.concurrency = Math.max(1, Math.min(64, Number(arg.slice(14)) || 1));
    else if (arg === "--help") result.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

export async function runOfficialCollegeIconImport(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log("Usage: node scripts/import-official-college-icons.mjs [--apply] [--limit=N] [--concurrency=N] [--refresh-unavailable]");
    return { verified: 0, unavailable: 0, skipped: 0 };
  }

  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  const existing = await readFile(manifestPath, "utf8").then((text) => JSON.parse(text)).catch(() => []);
  const entriesByUnitId = new Map(existing.map((entry) => [entry.unitId, entry]));
  const curated = new Set();
  for (const name of ["college-logo-sources-01-25.json", "college-logo-sources-26-50.json"]) {
    const items = JSON.parse(await readFile(path.join(projectRoot, "data", name), "utf8"));
    for (const item of items) curated.add(item.slug);
  }
  const demoted = options.apply ? await demoteGenericPlatformIcons(entriesByUnitId) : 0;
  const pending = dataset.colleges.filter((college) => {
    if (curated.has(college.slug)) return false;
    const current = entriesByUnitId.get(college.unitId);
    return !current || (options.refreshUnavailable && current.status === "unavailable");
  }).slice(0, options.limit);

  await mkdir(assetDirectory, { recursive: true });
  let cursor = 0;
  let completed = 0;
  let writeQueue = Promise.resolve();
  const persist = () => {
    if (!options.apply) return Promise.resolve();
    const sorted = [...entriesByUnitId.values()].sort((left, right) => left.unitId - right.unitId);
    writeQueue = writeQueue.then(() => writeManifest(sorted));
    return writeQueue;
  };

  const workers = Array.from({ length: Math.min(options.concurrency, pending.length) }, async () => {
    while (cursor < pending.length) {
      const college = pending[cursor++];
      const result = await inspectCollege(college);
      if (result.status === "verified") {
        const filename = assetName(college, result.extension);
        result.sha256 = createHash("sha256").update(result.bytes).digest("hex");
        result.asset = `/college-logos/${filename}`;
        if (genericPlatformIcon(result)) {
          result.status = "unavailable";
          result.reason = "generic-platform-icon";
          result.reviewNote = "The official page exposed a shared CMS or default placeholder, not an institution-specific mark.";
          result.rejectedSha256 = result.sha256;
          delete result.asset;
          delete result.sha256;
          delete result.contentType;
        }
        if (result.status === "verified" && options.apply) {
          await writeFile(path.join(assetDirectory, filename), result.bytes, { mode: 0o644 });
        }
        delete result.bytes;
        delete result.extension;
        if (result.status === "verified") {
          result.usageNote = "Official institution website icon cached locally; institutional mark rights remain subject to trademark restrictions.";
        }
      }
      result.checkedOn = new Date().toISOString().slice(0, 10);
      entriesByUnitId.set(college.unitId, result);
      completed += 1;
      if (completed % 25 === 0) await persist();
    }
  });
  await Promise.all(workers);
  await persist();
  if (options.apply) {
    await writeClientAssetProjection(
      [...entriesByUnitId.values()].sort((left, right) => left.unitId - right.unitId),
    );
  }

  const all = [...entriesByUnitId.values()];
  const summary = {
    processed: completed,
    pending: pending.length,
    verified: all.filter((entry) => entry.status === "verified").length,
    unavailable: all.filter((entry) => entry.status === "unavailable").length,
    skippedCurated: curated.size,
    demotedGeneric: demoted,
    written: options.apply,
  };
  console.log(JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runOfficialCollegeIconImport().catch((error) => {
    console.error(error instanceof Error ? error.message : "Official icon import failed");
    process.exitCode = 1;
  });
}
