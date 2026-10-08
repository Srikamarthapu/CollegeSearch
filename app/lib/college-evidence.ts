import type { CollegeDataset, ObservationUnit } from "./college-data";
import { collegeCatalogCategories } from "./catalog-categories.ts";

const units: Record<string, ObservationUnit> = {
  admitRate: "ratio", applicants: "count", admits: "count", enrollees: "count",
  yieldRate: "ratio", undergraduateEnrollment: "count", averageNetPrice: "usd",
  graduationRate: "ratio", medianEarnings: "usd", tuitionInState: "usd", tuitionOutOfState: "usd",
};
const statuses = new Set(["reported", "derived", "suppressed", "unavailable", "stale"]);
const finalities = new Set(["snapshot", "provisional", "finalized"]);

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

/** Reject unusable evidence before any value reaches profiles, comparison or retrieval. */
export function assertCollegeEvidence(dataset: CollegeDataset): void {
  if (!Array.isArray(dataset.release.sources) || !validDate(dataset.release.accessedOn)) {
    throw new Error("College release has invalid source metadata.");
  }
  const sources = new Map(dataset.release.sources.map((source) => [source.id, source]));
  if (sources.size !== dataset.release.sources.length) throw new Error("Duplicate college source IDs.");
  for (const source of sources.values()) {
    if (!source.id || !source.publisher || !source.sourceName || !httpsUrl(source.sourceUrl) || !validDate(source.accessedOn)) {
      throw new Error(`Invalid registered source ${source.id}.`);
    }
  }
  const slugs = new Set<string>();
  for (const college of dataset.colleges) {
    if (!collegeCatalogCategories.includes(college.catalogCategory) || typeof college.inclusionReason !== "string" || !college.inclusionReason.trim()) {
      throw new Error(`${college.name} lacks a reviewed catalog category and inclusion reason.`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(college.slug) || slugs.has(college.slug)) {
      throw new Error(`Duplicate or invalid college slug ${college.slug}.`);
    }
    slugs.add(college.slug);
    for (const observations of [college.observations, college.alternateObservations]) {
      for (const [metric, observation] of Object.entries(observations ?? {})) {
        if (observation === null) continue;
        const label = `${college.name} ${metric}`;
        if (!observation || !units[metric] || observation.unit !== units[metric] ||
            !statuses.has(observation.status) || !finalities.has(observation.finality)) {
          throw new Error(`${label} has invalid evidence units or status.`);
        }
        const missing = observation.status === "suppressed" || observation.status === "unavailable";
        const value = observation.value;
        if ((value === null) !== missing || (value !== null &&
            (!Number.isFinite(value) || (value < 0 && metric !== "averageNetPrice") ||
             (observation.unit === "ratio" && value > 1) ||
             (observation.unit === "count" && !Number.isInteger(value))))) {
          throw new Error(`${label} has an invalid value or missing-data status.`);
        }
        if (!validDate(observation.accessedOn) || !Number.isInteger(observation.reportingYear) ||
            observation.reportingYear < 1900 || !observation.periodLabel || !observation.cohort ||
            !observation.definition || !observation.sourceField || !observation.comparabilityKey) {
          throw new Error(`${label} has incomplete evidence lineage.`);
        }
        const source = sources.get(observation.sourceId);
        if (!source || source.publisher !== observation.publisher || source.sourceName !== observation.sourceName ||
            !httpsUrl(observation.sourceUrl) ||
            ![source.sourceUrl, source.sourcePage, source.artifactUrl, ...(source.sourceUrls ?? [])].includes(observation.sourceUrl)) {
          throw new Error(`${label} does not match a registered evidence source.`);
        }
      }
    }
    for (const major of college.majors) {
      const fields = major.sourceField?.match(/^PCIP(\d{2}) \+ CIP(\d{2})(BACHL|ASSOC)(?: \+ CIP(\d{2})ASSOC)?$/);
      if (!sources.has(major.sourceId) || !finalities.has(major.finality) ||
          !fields || fields[1] !== fields[2] || (fields[4] && (fields[1] !== fields[4] || fields[3] !== "BACHL" || !major.associatesAvailable)) ||
          (fields[3] === "BACHL" ? !major.bachelorsAvailable : !major.associatesAvailable) ||
          !["delivery-not-specified", "includes-distance-program"].includes(major.deliveryMode ?? "")) {
        throw new Error(`${college.name} ${major.name} does not match a registered field source.`);
      }
    }
  }
}
