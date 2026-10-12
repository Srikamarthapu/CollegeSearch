import logoSourcesFirst from "../../data/college-logo-sources-01-25.json" with { type: "json" };
import logoSourcesSecond from "../../data/college-logo-sources-26-50.json" with { type: "json" };
import officialIconAssets from "../../data/college-logo-assets.json" with { type: "json" };

const logoAssetsBySlug = new Map();
const officialExtensionsByUnitId = new Map();

for (const source of [...logoSourcesFirst, ...logoSourcesSecond]) {
  if (logoAssetsBySlug.has(source.slug)) {
    throw new Error(`Duplicate college logo source for ${source.slug}`);
  }

  logoAssetsBySlug.set(source.slug, source.asset);
}

for (const [unitId, extension] of officialIconAssets) {
  if (officialExtensionsByUnitId.has(unitId)) {
    throw new Error(`Duplicate official college icon for unit ${unitId}`);
  }
  officialExtensionsByUnitId.set(unitId, extension);
}

const genericNameWords = new Set([
  "and",
  "at",
  "campus",
  "college",
  "for",
  "in",
  "of",
  "the",
  "university",
]);

/** @param {string} slug @param {number} unitId @returns {string | null} */
export function collegeLogoAsset(slug, unitId) {
  const curated = logoAssetsBySlug.get(slug);
  if (curated) return curated;
  const extension = officialExtensionsByUnitId.get(unitId);
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 52);
  return extension ? `/college-logos/${unitId}-${safeSlug}.${extension}` : null;
}

/** @param {string} name @returns {string} */
export function collegeLogoInitials(name) {
  const campusName = name.replace(
    /^California State (?:Polytechnic )?University[\s-]*/i,
    "",
  );
  const words = campusName.match(/[\p{L}\p{N}]+/gu) ?? [];
  const meaningfulWords = words.filter(
    (word) => !genericNameWords.has(word.toLowerCase()),
  );
  const candidates = meaningfulWords.length > 0 ? meaningfulWords : words;

  if (candidates.length === 0) return "C";
  if (candidates.length === 1) return candidates[0].slice(0, 2).toUpperCase();

  return candidates
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}
