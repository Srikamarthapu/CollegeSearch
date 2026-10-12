#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readScorecardArchive } from "./lib/scorecard-archive.mjs";
import { supportedUsJurisdictionCodes } from "./lib/us-census-regions.mjs";

const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const path = resolve(value("--manifest", "data/college-catalog.json"));
const manifest = JSON.parse(await readFile(path, "utf8"));
const fields = ["UNITID", "INSTNM", "CITY", "STABBR", "CONTROL", "MAIN", "CURROPER", "HIGHDEG", "PREDDEG", "ICLEVEL", "NUMBRANCH", "INSTURL", "ALIAS", "OPEID", "OPEID6"];
const { rows, sha256 } = readScorecardArchive(await readFile(resolve(value("--archive", "work/scorecard-current/Most-Recent-Cohorts-Institution_06102026.zip"))), manifest.source.artifactSha256, fields);
const selected = rows.filter(row => row.CURROPER === "1" && ["1", "2"].includes(row.ICLEVEL) &&
  ["1", "2", "3"].includes(row.PREDDEG) && ["1", "2", "3"].includes(row.CONTROL) && supportedUsJurisdictionCodes.includes(row.STABBR));
const prior = new Map(manifest.institutions.map(entry => [entry.unitId, entry]));
const selectedIds = new Set(selected.map(row => Number(row.UNITID)));
for (const id of prior.keys()) if (!selectedIds.has(id)) throw new Error(`Previously published UNITID ${id} no longer eligible; explicit retirement review required.`);
const usedSlugs = new Set(manifest.institutions.map(entry => entry.slug));
const slugify = text => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const institutions = selected.sort((a, b) => Number(a.UNITID) - Number(b.UNITID)).map(row => {
  const unitId = Number(row.UNITID), existing = prior.get(unitId);
  let slug = existing?.slug ?? slugify(row.INSTNM);
  if (!existing && usedSlugs.has(slug)) slug += `-${slugify(row.CITY)}-${row.STABBR.toLowerCase()}-${unitId}`;
  if (!slug || (!existing && usedSlugs.has(slug))) throw new Error(`Ambiguous slug for UNITID ${unitId}.`);
  usedSlugs.add(slug);
  if (!row.INSTNM || !row.CITY || !row.INSTURL || !["0", "1"].includes(row.MAIN) || Number(row.NUMBRANCH) < 1) throw new Error(`Incomplete identity ${unitId}.`);
  const ownership = { 1: "public", 2: "private nonprofit", 3: "private for-profit" }[row.CONTROL];
  return {
    ...(existing ?? {}), unitId, expectedName: row.INSTNM, city: row.CITY, state: row.STABBR,
    scorecardControl: Number(row.CONTROL), scorecardMain: Number(row.MAIN), scorecardLevel: Number(row.ICLEVEL),
    scorecardHighestDegree: Number(row.HIGHDEG), scorecardPredominantDegree: Number(row.PREDDEG), slug,
    aliases: [...new Set((existing?.aliases ?? row.ALIAS.split(/[;|]/))
      .map(text => text.trim()).filter(text => text && !/^(NA|NULL|PrivacySuppressed)$/i.test(text)))],
    catalogCategory: existing?.catalogCategory ?? ({ 1: "federal-public", 2: "federal-nonprofit", 3: "federal-for-profit" }[row.CONTROL]),
    inclusionReason: existing?.inclusionReason ?? `Included by the comprehensive federal undergraduate roster: ${row.ICLEVEL === "1" ? "four-year" : "two-year"} ${ownership} institution in ${row.CITY}, ${row.STABBR}, ${row.MAIN === "1" ? "main" : "branch"} UNITID; reported operating in the April 30, 2026 PEPS snapshot.`,
    retainedFromExistingCatalog: existing?.retainedFromExistingCatalog ?? false,
    identitySha256: createHash("sha256").update(JSON.stringify(fields.map(field => [field, row[field]]))).digest("hex"),
  };
});
const output = {
  ...manifest, schemaVersion: 2,
  scope: "United States: 50 states, District of Columbia, Puerto Rico, Guam, U.S. Virgin Islands, American Samoa and Northern Mariana Islands. Federally reported operating two- and four-year institutions with undergraduate award classifications; main and branch UNITIDs remain separate.",
  selectionRules: {
    sourceIdentity: "Exact UNITID, INSTNM, CITY, STABBR and institution attributes in the pinned College Scorecard archive.",
    institutionLevel: "ICLEVEL = 1 (four-year level offered) or 2 (two-year level offered).",
    undergraduateClassification: "PREDDEG = 1, 2 or 3; excludes entirely graduate (4) and unclassified (0). This is an award classification, not a promise of current program availability.",
    currentlyOperatingField: "CURROPER = 1, PEPS as of April 30, 2026; not a live accreditation or operating-status guarantee.",
    campusIdentity: "MAIN = 0 or 1; branch UNITIDs are not collapsed. OPEID6 groups may share some federal outcomes.",
    ownershipField: "CONTROL = 1 (public), 2 (private nonprofit), or 3 (private for-profit).",
    identityKey: "UNITID is the stable profile/save identity. Preserve all previously published IDs and slugs.",
  },
  source: { ...manifest.source, artifactSha256: sha256, identityFields: fields }, institutions,
};
if (args.includes("--write")) await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ dryRun: !args.includes("--write"), institutions: institutions.length, originalIdsPreserved: prior.size,
  fourYear: institutions.filter(row => row.scorecardLevel === 1).length, twoYear: institutions.filter(row => row.scorecardLevel === 2).length,
  main: institutions.filter(row => row.scorecardMain === 1).length, branch: institutions.filter(row => row.scorecardMain === 0).length,
  ownership: Object.fromEntries([1, 2, 3].map(code => [code, institutions.filter(row => row.scorecardControl === code).length])), artifactSha256: sha256 }));
