#!/usr/bin/env node

/**
 * Build an offline campus-photo review queue from exact IPEDS identities.
 *
 * Safety boundary:
 * - P1771 is Wikidata's Integrated Postsecondary Education Data System ID.
 * - P18 is only a candidate image. It is never approved by this script.
 * - A reviewer must inspect the pixels and source page before copying an entry to
 *   data/profile-campus-photo-approved.json.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const catalogPath = path.join(root, "data/colleges.json");
const outputPath = path.join(root, "data/profile-campus-photo-candidates.json");
const userAgent = "CollegeSearch campus photo provenance audit/1.0 (educational project)";

const wikidataQuery = `
SELECT ?item ?unitId ?image WHERE {
  ?item wdt:P1771 ?unitId;
        wdt:P18 ?image.
}
ORDER BY ?unitId ?item ?image`;

const rejectPattern = /\b(logo|wordmark|seal|coat of arms|crest|emblem|flag|icon|portrait|headshot|selfie|mascot|basketball|football|baseball|soccer|volleyball|athletics?|team photo|graduation|commencement|diploma|map|diagram)\b/i;
const acceptedLicensePattern = /^(CC0|CC BY(?:-SA)?(?: |-|$)|Public domain|PD-)/i;

function stripHtml(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchJson(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "user-agent": userAgent, ...(options.headers || {}) },
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const error = new Error(`${response.status} ${response.statusText}`);
        error.retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : null;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = error.retryAfterMs || attempt * 2000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

function commonsTitle(imageUrl) {
  const fileName = decodeURIComponent(new URL(imageUrl).pathname.split("/").at(-1));
  return `File:${fileName}`;
}

function sourcePage(title) {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title).replace(/%3A/i, ":")}`;
}

function entityId(itemUrl) {
  return new URL(itemUrl).pathname.split("/").at(-1);
}

function extValue(metadata, key) {
  return stripHtml(metadata?.[key]?.value || "");
}

function reviewSignals(fileName, info) {
  const metadata = info.extmetadata || {};
  const description = extValue(metadata, "ImageDescription");
  const categories = extValue(metadata, "Categories");
  const combined = `${fileName} ${description} ${categories}`;
  const reasons = [];

  if (!info.mime?.startsWith("image/")) reasons.push("not-a-raster-image");
  if (!Number.isFinite(info.width) || !Number.isFinite(info.height)) reasons.push("missing-dimensions");
  if (info.width < 960 || info.height < 500) reasons.push("below-banner-resolution");
  if (info.width / info.height < 1.2) reasons.push("not-landscape");
  if (rejectPattern.test(combined)) reasons.push("non-campus-subject-signal");

  const license = extValue(metadata, "LicenseShortName");
  if (!acceptedLicensePattern.test(license)) reasons.push("license-not-allowlisted");

  return { reasons, description, categories, license };
}

async function main() {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const colleges = catalog.colleges;
  const collegeByUnitId = new Map(colleges.map((college) => [String(college.unitId), college]));

  const sparqlUrl = new URL("https://query.wikidata.org/sparql");
  sparqlUrl.searchParams.set("query", wikidataQuery);
  sparqlUrl.searchParams.set("format", "json");
  const sparql = await fetchJson(sparqlUrl);

  const exactRows = sparql.results.bindings
    .map((binding) => ({
      unitId: binding.unitId.value,
      entityUrl: binding.item.value,
      imageUrl: binding.image.value,
    }))
    .filter((row) => collegeByUnitId.has(row.unitId));

  const rowsByTitle = new Map();
  for (const row of exactRows) {
    const title = commonsTitle(row.imageUrl);
    const rows = rowsByTitle.get(title) || [];
    rows.push(row);
    rowsByTitle.set(title, rows);
  }

  const metadataByTitle = new Map();
  for (const titleBatch of chunks([...rowsByTitle.keys()], 50)) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|size|mime|sha1|extmetadata");
    url.searchParams.set("iiurlwidth", "1600");
    url.searchParams.set("titles", titleBatch.join("|"));
    const response = await fetchJson(url);
    for (const page of response.query?.pages || []) {
      if (page.title && page.imageinfo?.[0]) metadataByTitle.set(page.title, page.imageinfo[0]);
    }
    await new Promise((resolve) => setTimeout(resolve, 1250));
  }

  const identityCounts = new Map();
  for (const row of exactRows) identityCounts.set(row.unitId, (identityCounts.get(row.unitId) || 0) + 1);

  const candidates = exactRows.map((row) => {
    const college = collegeByUnitId.get(row.unitId);
    const title = commonsTitle(row.imageUrl);
    const info = metadataByTitle.get(title) || {};
    const metadata = info.extmetadata || {};
    const signals = reviewSignals(title, info);
    const identityAmbiguous = identityCounts.get(row.unitId) !== 1;
    const blockers = [...signals.reasons];
    if (identityAmbiguous) blockers.push("multiple-wikidata-images-or-entities-for-unitid");

    return {
      unitId: college.unitId,
      slug: college.slug,
      collegeName: college.name,
      city: college.city,
      state: college.state,
      status: "pending-visual-review",
      usableInProduct: false,
      identity: {
        method: "wikidata-p1771-exact-unitid",
        wikidataEntityId: entityId(row.entityUrl),
        wikidataEntityUrl: row.entityUrl,
        ipedsUnitId: row.unitId,
        evidenceUrl: `https://www.wikidata.org/wiki/${entityId(row.entityUrl)}#P1771`,
      },
      image: {
        commonsTitle: title,
        sourceUrl: sourcePage(title),
        originalUrl: info.url || row.imageUrl,
        reviewThumbnailUrl: info.thumburl || null,
        width: info.width || null,
        height: info.height || null,
        mime: info.mime || null,
        sha1: info.sha1 || null,
      },
      rights: {
        creator: extValue(metadata, "Artist") || null,
        credit: extValue(metadata, "Credit") || null,
        license: signals.license || null,
        licenseUrl: extValue(metadata, "LicenseUrl") || null,
        attributionRequired: extValue(metadata, "AttributionRequired") || null,
      },
      sourceDescription: signals.description || null,
      sourceCategories: signals.categories || null,
      proposedAlt: null,
      automatedReview: {
        eligibleForHumanReview: blockers.length === 0,
        blockers,
      },
    };
  }).sort((a, b) => a.unitId - b.unitId || a.image.commonsTitle.localeCompare(b.image.commonsTitle));

  const eligible = candidates.filter((candidate) => candidate.automatedReview.eligibleForHumanReview).length;
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    catalogRelease: catalog.release,
    policy: {
      statement: "This is an offline review queue. No entry is product-usable until a reviewer inspects the image and source page and copies it to the approved manifest.",
      identityMethod: "Exact equality between CollegeSearch UNITID and Wikidata P1771 (IPEDS ID); never name search.",
      imageMethod: "Wikidata P18 candidate enriched from the Wikimedia Commons imageinfo/extmetadata API.",
      approvalRequirements: [
        "A reviewer confirms that the pixels clearly show the named institution's campus or a campus building.",
        "The source description or categories identify the institution and do not indicate a different branch.",
        "Landscape crop is suitable for a profile banner and has no dominant logo, portrait, sports, or unrelated subject.",
        "Creator, license, license URL, dimensions, and a factual image-specific alt text are recorded.",
      ],
    },
    summary: {
      catalogColleges: colleges.length,
      exactUnitIdImageRows: candidates.length,
      exactUnitIdsWithCandidate: new Set(candidates.map((candidate) => candidate.unitId)).size,
      automaticallyEligibleForHumanReview: eligible,
      productApprovedByThisFile: 0,
    },
    sourceQueries: {
      wikidataProperty: "https://www.wikidata.org/wiki/Property:P1771",
      wikidataQueryService: "https://query.wikidata.org/",
      wikimediaCommonsApi: "https://commons.wikimedia.org/w/api.php",
      querySha256: createHash("sha256").update(wikidataQuery).digest("hex"),
    },
    candidates,
  };

  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote ${candidates.length} exact-ID candidate rows (${eligible} eligible for visual review) to ${path.relative(root, outputPath)}\n`);
}

await main();
