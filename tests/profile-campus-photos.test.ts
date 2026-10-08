import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  approvedProfileCampusPhotoCount,
  getProfileCampusPhoto,
} from "../app/lib/profile-campus-photos.ts";

const catalog = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
);
const approvedManifest = JSON.parse(
  await readFile(new URL("../data/profile-campus-photo-approved.json", import.meta.url), "utf8"),
);
const candidateManifest = JSON.parse(
  await readFile(new URL("../data/profile-campus-photo-candidates.json", import.meta.url), "utf8"),
);
const runtimeSource = await readFile(
  new URL("../app/lib/profile-campus-photos.ts", import.meta.url),
  "utf8",
);
const catalogByUnitId = new Map(
  catalog.colleges.map((college: { unitId: number }) => [college.unitId, college]),
);

test("profile campus photos require exact approved UNITID and slug identities", () => {
  assert.equal(
    approvedProfileCampusPhotoCount,
    approvedManifest.summary.profileUsableAssets,
  );

  const seen = new Set<number>();
  for (const entry of approvedManifest.approved) {
    assert.equal(seen.has(entry.unitId), false, `duplicate approved UNITID ${entry.unitId}`);
    seen.add(entry.unitId);
    assert.equal(entry.status, "visual-source-reviewed");

    const catalogCollege = catalogByUnitId.get(entry.unitId) as { slug: string; name: string } | undefined;
    assert.ok(catalogCollege, `unknown approved UNITID ${entry.unitId}`);
    assert.equal(entry.slug, catalogCollege.slug);
    assert.equal(entry.collegeName, catalogCollege.name);

    const photo = getProfileCampusPhoto(entry.unitId, entry.slug);
    if (entry.usableInProfile) {
      assert.ok(photo, `profile helper omitted approved UNITID ${entry.unitId}`);
      assert.equal(photo.unitId, entry.unitId);
      assert.equal(photo.slug, entry.slug);
      assert.equal(photo.src, entry.asset.path);
      assert.equal(photo.alt.trim().length > 0, true);
      assert.equal(getProfileCampusPhoto(entry.unitId, `${entry.slug}-wrong`), undefined);
    } else {
      assert.equal(photo, undefined);
      assert.ok(entry.profileExclusionReason);
    }
  }
});

test("approved campus assets match their reviewed files, hashes, and dimensions", async () => {
  for (const entry of approvedManifest.approved) {
    assert.match(entry.asset.path, /^\/images\/campuses\/[a-z0-9-]+\.jpg$/);
    const assetPath = path.resolve("public", entry.asset.path.slice(1));
    const bytes = await readFile(assetPath);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.asset.sha256);
    if (entry.review.reviewedOn === "2026-10-07") {
      assert.ok(bytes.byteLength <= 500_000, `${entry.unitId} web asset exceeds 500 KB`);
    }
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, entry.asset.width, `${entry.unitId} width drifted`);
    assert.equal(metadata.height, entry.asset.height, `${entry.unitId} height drifted`);
    assert.match(entry.source.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(entry.source.downloadUrl, /^https:\/\//);
    assert.match(entry.source.licenseUrl, /^https?:\/\//);
    assert.ok(entry.source.creator.trim());
    assert.ok(entry.presentation.alt.trim());
    assert.ok(entry.presentation.caption.trim());
  }
});

test("Wikidata candidates remain a non-runtime, non-approved review queue", () => {
  assert.equal(candidateManifest.summary.catalogColleges, catalog.colleges.length);
  assert.equal(candidateManifest.summary.productApprovedByThisFile, 0);
  assert.equal(runtimeSource.includes("profile-campus-photo-candidates"), false);

  for (const candidate of candidateManifest.candidates) {
    const college = catalogByUnitId.get(candidate.unitId) as { slug: string } | undefined;
    assert.ok(college, `candidate references unknown UNITID ${candidate.unitId}`);
    assert.equal(candidate.slug, college.slug);
    assert.equal(candidate.status, "pending-visual-review");
    assert.equal(candidate.usableInProduct, false);
    assert.equal(candidate.proposedAlt, null);
    assert.equal(candidate.identity.method, "wikidata-p1771-exact-unitid");
    assert.equal(candidate.identity.ipedsUnitId, String(candidate.unitId));
    assert.equal(
      candidate.identity.wikidataEntityUrl,
      `http://www.wikidata.org/entity/${candidate.identity.wikidataEntityId}`,
    );
  }
});
