import type { College, Observation } from "./college-data";

export const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const numberFormatter = new Intl.NumberFormat("en-US");

export const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatObservation(observation: Observation) {
  if (observation.value === null) return "Not reported";
  if (observation.unit === "ratio") return percentFormatter.format(observation.value);
  if (observation.unit === "usd") return currencyFormatter.format(observation.value);
  return numberFormatter.format(observation.value);
}

export function observationSourceKind(observation: Observation) {
  if (observation.sourceId.startsWith("uc-")) {
    return { label: "UC official", className: "uc-source", isFederal: false };
  }
  if (observation.publisher === "U.S. Department of Education") {
    return { label: "Federal baseline", className: "federal-source", isFederal: true };
  }
  return { label: "College official", className: "official-source", isFederal: false };
}

export function compactName(college: College) {
  // Federal aliases include historical institution names and search keywords.
  // Only the established, curated short names are suitable display labels.
  if (college.catalogCategory.startsWith("federal-")) return college.name;
  const aliases = college.aliases.filter((alias) => !/^(?:n\/?a|null|privacysuppressed|unknown)$/i.test(alias.trim()));
  return aliases.find((alias) => alias.startsWith("UC ")) || aliases[0] || college.name;
}

export function initials(name: string) {
  return name
    .replace("University of ", "")
    .replace("California State University", "CSU")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

export function isUniversityOfCalifornia(college: College) {
  return college.observations.admitRate.sourceId.startsWith("uc-");
}

export function selectivityLabel(rate: number | null) {
  if (rate === null) return "Insufficient data";
  if (rate <= 0.1) return "10% or fewer admitted";
  if (rate <= 0.25) return "11%–25% admitted";
  if (rate <= 0.5) return "26%–50% admitted";
  return "More than 50% admitted";
}

export function majorEvidenceFor(college: College, major: string) {
  return college.majors.find((item) => item.name === major) ?? null;
}
