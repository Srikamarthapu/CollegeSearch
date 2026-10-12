#!/usr/bin/env node

/**
 * Promote an explicitly reviewed subset of exact-ID candidates into the small
 * runtime additions file. Running this script never promotes other candidates.
 */

import { access, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const candidatePath = path.join(root, "data/profile-campus-photo-candidates.json");
const outputPath = path.join(root, "data/profile-campus-photo-additions.json");
const publicCampusDir = path.join(root, "public/images/campuses");
const reviewCacheDir = "/tmp/collegesearch-campus-photo-review";
const secondReviewCacheDir = "/tmp/collegesearch-campus-photo-review-2";

const decisions = [
  [110510, "cal-state-san-bernardino.jpg", "Cal State San Bernardino", "2009-11-29", "50% 85%", "University Avenue entrance to California State University, San Bernardino, with campus buildings and mountains behind it.", "University Avenue entrance · Cal State San Bernardino", "Keep the entrance sign fully visible in the wide profile crop."],
  [110538, "chico-state.jpg", "Chico State", "2015-06-10", "50% 50%", "Brick campus building framed by trees at California State University, Chico.", "Campus · Chico State", "The centered crop preserves the building and surrounding trees."],
  [110556, "fresno-state.jpg", "Fresno State", "2009-07-25", "50% 55%", "Frank W. Thomas Administration Building and lawn at Fresno State.", "Thomas Administration Building · Fresno State", "The centered crop preserves the facade and lawn."],
  [110574, "cal-state-east-bay.jpg", "Cal State East Bay", "2007-04-17", "50% 55%", "California State University, East Bay campus overlooking Hayward.", "Campus · Cal State East Bay", "Keep the campus buildings along the lower edge of the wide crop."],
  [110705, "uc-santa-barbara.jpg", "UC Santa Barbara", "2019-09-08", "50% 52%", "Storke Tower and the University Center seen across the UCSB Lagoon.", "Storke Tower and University Center · UC Santa Barbara", "The centered crop preserves the tower, University Center, and lagoon."],
  [111948, "chapman.jpg", "Chapman", "2008-06-14", "50% 50%", "Williams Mall with Memorial Hall and Smith Hall at Chapman University.", "Williams Mall · Chapman University", "The wide crop trims the outer building edges while retaining the mall and both halls."],
  [115755, "cal-poly-humboldt.jpg", "Cal Poly Humboldt", "2016-12-01", "50% 80%", "Founders Hall at Cal Poly Humboldt in warm sunset light.", "Founders Hall · Cal Poly Humboldt", "Bias the crop downward to retain the hall and reduce empty sky."],
  [121345, "pomona-college.jpg", "Pomona", "2014-02-06", "50% 45%", "Pomona College academic quad with the San Gabriel Mountains in the distance.", "Academic quad · Pomona College", "The centered crop preserves the quad and mountain backdrop."],
  [122409, "san-diego-state.jpg", "San Diego State", "2004-04-18", "50% 45%", "Mission Revival campus building and bell tower at San Diego State University.", "Historic campus architecture · San Diego State", "The centered crop retains the building and bell tower."],
  [122436, "university-of-san-diego.jpg", "University of San Diego", "2019-05-24", "50% 55%", "White Spanish Renaissance campus buildings and palms at the University of San Diego.", "Campus · University of San Diego", "The centered crop retains the buildings and palms."],
  [129020, "uconn.jpg", "UConn", "2013-06-28", "50% 45%", "Walkways, lawns, and academic buildings on the University of Connecticut campus.", "Storrs campus · UConn", "The centered crop retains the main walk and academic buildings."],
  [131520, "howard.jpg", "Howard", "2017-08-16", "50% 65%", "Founders Library clock tower and brick facade at Howard University.", "Founders Library · Howard University", "The wide crop shows the clock and main facade while trimming the tower top."],
  [145637, "uiuc-main-quad.jpg", "Illinois", "2007-11-17", "50% 50%", "Illini Union and the Main Quad at the University of Illinois Urbana-Champaign.", "Illini Union and Main Quad · Illinois", "The source panorama fits the wide profile crop without losing the principal campus subjects."],
  [174066, "minnesota-twin-cities.jpg", "Minnesota", "2005-10-20", "50% 55%", "Aerial view of Northrop Mall and surrounding buildings at the University of Minnesota Twin Cities.", "Northrop Mall · University of Minnesota Twin Cities", "The centered crop preserves Northrop Mall and surrounding campus buildings."],
  [206084, "toledo.jpg", "Toledo", "2022-07-05", "50% 45%", "University Hall and its clock tower at the University of Toledo.", "University Hall · University of Toledo", "The centered crop retains the building and clock tower."],
  [230764, "utah.jpg", "Utah", "2009-12-13", "50% 50%", "The Park Building and lawn at the University of Utah.", "Park Building · University of Utah", "The centered crop preserves the building and lawn."],
  [235316, "gonzaga.jpg", "Gonzaga", "2009-08-01", "22% 50%", "Church, walkways, trees, and campus buildings in a panoramic view of Gonzaga University.", "Campus panorama · Gonzaga University", "Use the left portion of the 360-degree panorama, where the church and campus paths are most recognizable."],
  [243780, "purdue.jpg", "Purdue", "2009-06-20", "50% 20%", "University Hall, a brick academic building with a central steeple, at Purdue University.", "University Hall · Purdue University", "Bias the crop upward; the widest crop may trim the steeple tip but keeps the building identifiable."],
  [126614, "colorado-boulder.jpg", "Colorado Boulder", "2007-04-14", "50% 20%", "Old Main, a red-brick campus building framed by leafless trees at the University of Colorado Boulder.", "Old Main · University of Colorado Boulder", "The wide crop retains the central tower and upper facade; trees partly obscure the building.", "File:Old Main - Colorado.jpg"],
  [139658, "emory.jpg", "Emory", "2011-04-24", "50% 55%", "Emory University Administration Building, a white stone building shaded by mature trees.", "Administration Building · Emory University", "The wide crop keeps the entrance and upper facade.", "File:Emory University - Administration Building.JPG"],
  [139940, "georgia-state.jpg", "Georgia State", "2015-11-04", "50% 50%", "Glass-fronted College of Law building on Georgia State University's downtown Atlanta campus.", "College of Law · Georgia State University", "The centered crop retains the glass facade and downtown campus context.", "File:Georgia State University College of Law Building.jpeg"],
  [147767, "northwestern.jpg", "Northwestern", "2004-10-12", "50% 40%", "The Northwestern University entrance arch surrounded by autumn trees.", "The Arch · Northwestern University", "The source is 992 pixels wide and is mildly upscaled in the widest banner; the crop itself is stable.", "File:Northwestern Arch.jpg"],
  [152080, "notre-dame.jpg", "Notre Dame", "2012-05-01", "50% 50%", "Basilica of the Sacred Heart, Main Building, and Washington Hall around Notre Dame's God Quad.", "God Quad · University of Notre Dame", "The source panorama fits the wide profile crop without losing the principal campus subjects.", "File:The University of Notre Dame \"God Quad\".JPG"],
  [162928, "johns-hopkins.jpg", "Johns Hopkins", "2011-07-20", "50% 30%", "Historic red-brick Johns Hopkins building with a central dome and cupola.", "Historic Dome · Johns Hopkins University", "The wide crop emphasizes the dome and upper facade; mobile retains most of the building.", "File:Johns Hopkins' Historic Dome - panoramio.jpg"],
  [168148, "tufts.jpg", "Tufts", "2011-04-17", "50% 45%", "Bendetson Hall, the undergraduate admissions building at Tufts University.", "Bendetson Hall · Tufts University", "The centered crop retains the building and approach.", "File:Tufts Bendetson hall.JPG"],
  [182670, "dartmouth.jpg", "Dartmouth", "2007-06-23", "50% 18%", "White facade and cupola of Dartmouth Hall on the Dartmouth College campus.", "Dartmouth Hall · Dartmouth College", "The source already trims the cupola tip; the wide crop keeps the recognizable upper facade.", "File:Dartmouth College campus 2007-06-23 Dartmouth Hall 02.JPG"],
  [190415, "cornell.jpg", "Cornell", "2006-06-24", "50% 50%", "Aerial view of Ho Plaza, Sage Hall, and surrounding buildings at Cornell University.", "Ho Plaza and Sage Hall · Cornell University", "The centered crop preserves the plaza and surrounding campus buildings.", "File:Cornell University, Ho Plaza and Sage Hall.jpg"],
  [196413, "syracuse.jpg", "Syracuse", "2011-11-03", "50% 45%", "Aerial view of Syracuse University's main campus and the Carrier Dome in autumn.", "Main campus · Syracuse University", "The wide crop keeps the central campus and part of the dome; mobile shows the broader campus.", "File:Syracuse University Aerial view.jpg"],
  [201645, "case-western.jpg", "Case Western", "2005-07", "50% 40%", "Red-brick academic building and landscaped lawn at Case Western Reserve University.", "Campus · Case Western Reserve University", "The centered crop retains the building and landscaped lawn.", "File:Case western reserve campus 2005.jpg"],
  [215062, "penn.jpg", "Penn", "2011-12-29", "50% 55%", "Gothic stone facade of College Hall at the University of Pennsylvania.", "College Hall · University of Pennsylvania", "The wide crop shows the main facade and windows while trimming the roofline.", "File:College Hall, University of Pennsylvania.jpg"],
  [221999, "vanderbilt.jpg", "Vanderbilt", "2017-02-24", "50% 60%", "Students on a broad lawn beside a red-brick building at Vanderbilt University.", "Campus · Vanderbilt University", "Bias the crop downward to reduce excess sky and keep the quad; the source is somewhat soft but remains identifiable.", "File:Vanderbilt university campus 2017.jpg"],
  [227757, "rice.jpg", "Rice", "2008-03-11", "50% 65%", "Ornate brick-and-stone Sally Port arch at Rice University.", "Sally Port · Rice University", "The wide crop centers the arch and lower facade; mobile retains the upper building.", "File:Rice University - Sally Port.JPG"],
].map(([unitId, assetName, shortName, photoDate, objectPosition, alt, caption, cropNotes, commonsTitle]) => ({
  unitId, assetName, shortName, photoDate, objectPosition, alt, caption, cropNotes, commonsTitle,
}));

const candidates = JSON.parse(await readFile(candidatePath, "utf8"));
const catalog = JSON.parse(await readFile(path.join(root, "data/colleges.json"), "utf8"));
const catalogByUnitId = new Map(catalog.colleges.map((college) => [college.unitId, college]));
const candidateByUnitId = new Map();
for (const candidate of candidates.candidates) {
  if (decisions.some((decision) => decision.unitId === candidate.unitId && (!decision.commonsTitle || decision.commonsTitle === candidate.image.commonsTitle))) {
    if (candidateByUnitId.has(candidate.unitId)) throw new Error(`Ambiguous candidate rows for ${candidate.unitId}`);
    candidateByUnitId.set(candidate.unitId, candidate);
  }
}

await mkdir(publicCampusDir, { recursive: true });
const additions = [];
for (const decision of decisions) {
  const candidate = candidateByUnitId.get(decision.unitId);
  const college = catalogByUnitId.get(decision.unitId);
  if (!candidate || !college || candidate.slug !== college.slug) throw new Error(`Missing exact candidate identity for ${decision.unitId}`);
  const unresolvedBlockers = candidate.automatedReview.blockers.filter((blocker) =>
    blocker !== "multiple-wikidata-images-or-entities-for-unitid" || !decision.commonsTitle,
  );
  if (unresolvedBlockers.length > 0 || candidate.status !== "pending-visual-review" || candidate.usableInProduct) {
    throw new Error(`Candidate ${decision.unitId} does not satisfy the pre-review gate`);
  }
  if (!candidate.rights.creator || !candidate.rights.license) throw new Error(`Incomplete rights metadata for ${decision.unitId}`);

  let sourceAsset = path.join(reviewCacheDir, `${decision.unitId}.jpg`);
  const finalAsset = path.join(publicCampusDir, decision.assetName);
  try {
    await access(sourceAsset);
  } catch {
    sourceAsset = path.join(secondReviewCacheDir, `${decision.unitId}.jpg`);
    try {
      await access(sourceAsset);
    } catch {
      const response = await fetch(candidate.image.reviewThumbnailUrl || candidate.image.originalUrl, {
        headers: { "user-agent": "CollegeSearch campus photo provenance audit/1.0" },
      });
      if (!response.ok) throw new Error(`Unable to download ${decision.unitId}: ${response.status}`);
      await writeFile(sourceAsset, Buffer.from(await response.arrayBuffer()));
    }
  }

  let outputQuality = 82;
  await sharp(sourceAsset)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(finalAsset);
  if ((await stat(finalAsset)).size > 500_000) {
    outputQuality = 70;
    await sharp(sourceAsset)
      .rotate()
      .resize({ width: 1500, withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toFile(`${finalAsset}.smaller`);
    const smaller = await readFile(`${finalAsset}.smaller`);
    await writeFile(finalAsset, smaller);
    await unlink(`${finalAsset}.smaller`);
  }
  const metadata = await sharp(finalAsset).metadata();
  const normalizedLicense = candidate.rights.license === "CC0" ? "CC0 1.0" : candidate.rights.license;
  const licenseUrl = candidate.rights.licenseUrl || (
    normalizedLicense === "Public domain"
      ? "https://commons.wikimedia.org/wiki/Template:PD-self"
      : null
  );
  if (!licenseUrl) throw new Error(`Missing license URL for ${decision.unitId}`);

  additions.push({
    unitId: decision.unitId,
    slug: college.slug,
    name: college.name,
    shortName: decision.shortName,
    location: `${college.city}, ${college.state}`,
    src: `/images/campuses/${decision.assetName}`,
    sourceUrl: candidate.image.sourceUrl,
    downloadUrl: candidate.image.reviewThumbnailUrl || candidate.image.originalUrl,
    creator: candidate.rights.creator,
    credit: `${candidate.rights.creator} / Wikimedia Commons / ${normalizedLicense}`,
    license: normalizedLicense,
    licenseUrl,
    photoDate: decision.photoDate,
    width: metadata.width,
    height: metadata.height,
    alt: decision.alt,
    caption: decision.caption,
    objectPosition: decision.objectPosition,
    cropNotes: `${decision.cropNotes} Local web asset resized from the Commons review image to ${metadata.width}×${metadata.height} and encoded as JPEG quality ${outputQuality}; source page and download URL preserve provenance.`,
  });
}

await writeFile(outputPath, `${JSON.stringify(additions, null, 2)}\n`);
process.stdout.write(`Promoted ${additions.length} explicitly reviewed campus photos to ${path.relative(root, outputPath)}\n`);
