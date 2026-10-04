import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collegeCatalogCategories } from "../../app/lib/catalog-categories.ts";
import { censusRegionForState, usCensusRegionCodes } from "./us-census-regions.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(repositoryRoot, "data/college-catalog.json");
const rawManifest = JSON.parse(await readFile(manifestPath, "utf8"));

function assertManifest(manifest) {
  if (
    manifest?.schemaVersion !== 1 ||
    !Array.isArray(manifest.institutions) ||
    manifest.institutions.length < 100 ||
    !manifest.source?.artifactUrl ||
    !manifest.source?.artifactSha256 ||
    !/^https:\/\//.test(manifest.source.dataPage) ||
    !/^https:\/\//.test(manifest.source.artifactUrl) ||
    !/^[a-f0-9]{64}$/.test(manifest.source.artifactSha256) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(manifest.source.releaseDate ?? "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(manifest.source.reviewedOn ?? "")
  ) {
    throw new Error("College catalog manifest is missing its reviewed release or roster.");
  }

  const unitIds = new Set();
  const slugs = new Set();
  const names = new Set();
  const categories = new Set(collegeCatalogCategories);
  const supportedStates = new Set(usCensusRegionCodes);
  for (const institution of manifest.institutions) {
    if (
      !Number.isInteger(institution.unitId) ||
      institution.unitId <= 0 ||
      unitIds.has(institution.unitId)
    ) {
      throw new Error(`College catalog has a duplicate or invalid UNITID ${institution.unitId}.`);
    }
    unitIds.add(institution.unitId);

    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(institution.slug ?? "") ||
      slugs.has(institution.slug)
    ) {
      throw new Error(`College catalog has a duplicate or invalid slug ${institution.slug}.`);
    }
    slugs.add(institution.slug);

    if (!institution.expectedName || names.has(institution.expectedName)) {
      throw new Error(`College catalog has a duplicate or missing name ${institution.expectedName}.`);
    }
    names.add(institution.expectedName);

    if (!supportedStates.has(institution.state)) {
      throw new Error(`${institution.expectedName} is outside the reviewed states-plus-DC scope.`);
    }
    censusRegionForState(institution.state);

    if (![1, 2].includes(institution.scorecardControl)) {
      throw new Error(`${institution.expectedName} has an unsupported Scorecard ownership code.`);
    }
    if (
      !Array.isArray(institution.aliases) ||
      institution.aliases.some((alias) => typeof alias !== "string" || !alias.trim()) ||
      new Set(institution.aliases).size !== institution.aliases.length
    ) {
      throw new Error(`${institution.expectedName} has invalid curated aliases.`);
    }
    if (!categories.has(institution.catalogCategory)) {
      throw new Error(`${institution.expectedName} has an unknown catalog category.`);
    }
    if (typeof institution.inclusionReason !== "string" || institution.inclusionReason.trim().length < 20) {
      throw new Error(`${institution.expectedName} is missing a useful inclusion reason.`);
    }
    if (typeof institution.retainedFromExistingCatalog !== "boolean") {
      throw new Error(`${institution.expectedName} is missing existing-catalog retention metadata.`);
    }
  }

  if (manifest.institutions.filter((item) => item.retainedFromExistingCatalog).length !== 50) {
    throw new Error("College catalog must retain all 50 original institution identities.");
  }
}

assertManifest(rawManifest);

export const collegeCatalog = Object.freeze(
  rawManifest.institutions.map((institution) =>
    Object.freeze({ ...institution, aliases: Object.freeze([...institution.aliases]) }),
  ),
);
export const collegeCatalogByUnitId = new Map(
  collegeCatalog.map((institution) => [institution.unitId, institution]),
);
export const collegeCatalogUnitIds = Object.freeze(
  collegeCatalog.map((institution) => institution.unitId),
);
export const collegeCatalogManifestPath = manifestPath;
export const collegeCatalogSource = Object.freeze({ ...rawManifest.source });

export function assertScorecardRowMatchesCatalog(row) {
  const unitId = Number(row.UNITID);
  const manifestEntry = collegeCatalogByUnitId.get(unitId);
  const ownership = Number(row.CONTROL);
  const highestDegree = Number(row.HIGHDEG);
  if (
    !manifestEntry ||
    row.INSTNM !== manifestEntry.expectedName ||
    row.STABBR !== manifestEntry.state ||
    ownership !== manifestEntry.scorecardControl ||
    ![1, 2].includes(ownership) ||
    Number(row.MAIN) !== 1 ||
    Number(row.CURROPER) !== 1 ||
    ![3, 4].includes(highestDegree) ||
    !Number.isInteger(Number(row.NUMBRANCH)) ||
    Number(row.NUMBRANCH) < 1
  ) {
    throw new Error(
      `College Scorecard identity or eligibility changed for UNITID ${unitId}; review the catalog manifest before refreshing.`,
    );
  }
  censusRegionForState(row.STABBR);
  return manifestEntry;
}

export function assertCollegeMatchesCatalog(college) {
  const manifestEntry = collegeCatalogByUnitId.get(college.unitId);
  if (
    !manifestEntry ||
    college.name !== manifestEntry.expectedName ||
    college.slug !== manifestEntry.slug ||
    college.state !== manifestEntry.state ||
    college.ownership !== (manifestEntry.scorecardControl === 1 ? "Public" : "Private nonprofit") ||
    college.catalogCategory !== manifestEntry.catalogCategory ||
    college.inclusionReason !== manifestEntry.inclusionReason ||
    !Array.isArray(college.aliases) ||
    JSON.stringify(college.aliases) !== JSON.stringify(manifestEntry.aliases)
  ) {
    throw new Error(`Generated college ${college.unitId} does not match the reviewed catalog manifest.`);
  }
  return manifestEntry;
}
