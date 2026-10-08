#!/usr/bin/env node

/**
 * Materialize the small, product-approved campus-photo manifest from the
 * reviewed campusPhotos source. This does not promote candidate rows.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const photosSourcePath = path.join(root, "app/lib/campus-photos.ts");
const candidatePath = path.join(root, "data/profile-campus-photo-candidates.json");
const additionsPath = path.join(root, "data/profile-campus-photo-additions.json");
const catalogPath = path.join(root, "data/colleges.json");
const outputPath = path.join(root, "data/profile-campus-photo-approved.json");
const profileExcludedUnitIds = new Set();

async function loadCampusPhotos() {
  const source = await readFile(photosSourcePath, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: photosSourcePath,
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
  return (await import(moduleUrl)).campusPhotos;
}

async function sha256ForPublicAsset(src) {
  const bytes = await readFile(path.join(root, "public", src.slice(1)));
  return createHash("sha256").update(bytes).digest("hex");
}

const additions = JSON.parse(await readFile(additionsPath, "utf8"));
const additionUnitIds = new Set(additions.map((entry) => entry.unitId));
const photos = [...(await loadCampusPhotos()), ...additions];
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const candidates = JSON.parse(await readFile(candidatePath, "utf8"));
const catalogByUnitId = new Map(catalog.colleges.map((college) => [college.unitId, college]));
const candidatesByUnitId = new Map();

for (const candidate of candidates.candidates) {
  const rows = candidatesByUnitId.get(candidate.unitId) || [];
  rows.push(candidate);
  candidatesByUnitId.set(candidate.unitId, rows);
}

const approved = [];
for (const photo of photos) {
  const college = catalogByUnitId.get(photo.unitId);
  if (!college || college.slug !== photo.slug) {
    throw new Error(`Approved campus photo identity is outside the catalog: ${photo.unitId} ${photo.slug}`);
  }

  const identityRows = candidatesByUnitId.get(photo.unitId) || [];
  const entityIds = [...new Set(identityRows.map((row) => row.identity.wikidataEntityId))];
  const exactIdentity = entityIds.length === 1 ? identityRows[0].identity : null;

  approved.push({
    unitId: photo.unitId,
    slug: photo.slug,
    collegeName: college.name,
    city: college.city,
    state: college.state,
    status: "visual-source-reviewed",
    usableInProfile: !profileExcludedUnitIds.has(photo.unitId),
    profileExclusionReason: profileExcludedUnitIds.has(photo.unitId)
      ? "The available reviewed image cannot retain both the Princeton tower and facade in the profile banner crop."
      : null,
    identity: exactIdentity || {
      method: "catalog-unitid-and-source-description-review",
      wikidataEntityId: null,
      wikidataEntityUrl: null,
      ipedsUnitId: String(photo.unitId),
      evidenceUrl: photo.sourceUrl,
    },
    asset: {
      path: photo.src,
      sha256: await sha256ForPublicAsset(photo.src),
      width: photo.width,
      height: photo.height,
    },
    source: {
      sourceUrl: photo.sourceUrl,
      downloadUrl: photo.downloadUrl,
      creator: photo.creator,
      credit: photo.credit,
      license: photo.license,
      licenseUrl: photo.licenseUrl,
      photoDate: photo.photoDate,
    },
    presentation: {
      alt: photo.alt,
      caption: photo.caption,
      objectPosition: photo.objectPosition,
      cropNotes: photo.cropNotes,
    },
    review: {
      method: "pixel-and-primary-source-metadata-review",
      reviewedOn: [110404, 186131, 236948].includes(photo.unitId) || additionUnitIds.has(photo.unitId)
        ? "2026-10-07"
        : "2026-09-06",
    },
  });
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  policy: {
    runtimeSource: "app/lib/campus-photos.ts plus data/profile-campus-photo-additions.json via app/lib/profile-campus-photos.ts",
    statement: "Only entries with status visual-source-reviewed and usableInProfile true may appear on college profiles. Candidate rows are stored separately and never imported by the runtime helper.",
    identityGate: "Both UNITID and catalog slug must match. Where a single Wikidata entity has exact P1771 equality, that entity is recorded as additional identity evidence.",
  },
  summary: {
    catalogColleges: catalog.colleges.length,
    approvedAssets: approved.length,
    profileUsableAssets: approved.filter((entry) => entry.usableInProfile).length,
    collegesWithoutApprovedProfilePhoto: catalog.colleges.length - approved.filter((entry) => entry.usableInProfile).length,
  },
  approved,
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${approved.length} reviewed assets (${manifest.summary.profileUsableAssets} profile-usable) to ${path.relative(root, outputPath)}\n`);
