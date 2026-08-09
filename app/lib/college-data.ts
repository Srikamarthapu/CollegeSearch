import rawDataset from "@/data/colleges.json";

export type ObservationStatus =
  | "reported"
  | "derived"
  | "suppressed"
  | "unavailable"
  | "stale";

export type ObservationUnit = "ratio" | "usd" | "count";
export type ObservationFinality = "snapshot" | "provisional" | "finalized";

export type Observation = {
  value: number | null;
  unit: ObservationUnit;
  reportingYear: number;
  periodLabel: string;
  finality: ObservationFinality;
  comparabilityKey: string;
  sourceId: string;
  publisher: string;
  sourceName: string;
  sourceUrl: string;
  accessedOn: string;
  sourceField: string;
  cohort: string;
  definition: string;
  status: ObservationStatus;
};

export type MajorEvidence = {
  name: string;
  share: number;
  bachelorsAvailable: boolean;
  evidence: string;
  reportingYear: number;
  periodLabel: string;
  finality: ObservationFinality;
  sourceId: string;
  sourceField: string;
  cohort: string;
  definition: string;
};

export type CollegeObservations = {
    admitRate: Observation;
    applicants: Observation | null;
    admits: Observation | null;
    enrollees: Observation | null;
    yieldRate: Observation | null;
    undergraduateEnrollment: Observation;
    averageNetPrice: Observation;
    graduationRate: Observation;
    medianEarnings: Observation;
    tuitionInState: Observation;
    tuitionOutOfState: Observation;
};

export type College = {
  unitId: number;
  opeId: string;
  opeId6: string;
  mainCampus: boolean;
  branchCount: number;
  currentlyOperating: boolean;
  slug: string;
  name: string;
  aliases: string[];
  city: string;
  state: string;
  region: string;
  ownership: string;
  setting: string;
  website: string;
  observations: CollegeObservations;
  alternateObservations: Partial<CollegeObservations>;
  majors: MajorEvidence[];
};

export type SourceRelease = {
  id: string;
  publisher: string;
  sourceName: string;
  sourceUrl: string;
  sourceUrls?: string[];
  sourceHashes?: Array<{ sourceUrl: string; sha256: string }>;
  sourcePage?: string;
  sourceSheet?: string;
  reportingYear?: number;
  finality?: ObservationFinality;
  publicationStatus?: "published";
  revisionStatus?: string;
  sourceAsOf?: string;
  accessedOn: string;
  cohort?: string;
  notes?: string;
  workbookSha256?: string;
  artifactUrl?: string;
  artifactSha256?: string;
  releaseDate?: string;
};

export type CollegeDataset = {
  release: {
    cohortName: string;
    institutionCount: number;
    accessedOn: string;
    federalReleaseDate: string;
    metricPeriods: Record<
      string,
      {
        reportingYear: number;
        periodLabel: string;
        revisionStatus: string;
        sourceFields: string[];
      }
    >;
    earningsPeriodLabel: string;
    publisher: string;
    sourceName: string;
    sourceUrl: string;
    ucAdmissionsSourceUrl: string;
    ucDisciplineSourceUrl: string;
    notes: string;
    sources: SourceRelease[];
  };
  colleges: College[];
};

const requiredObservationKeys = [
  "admitRate",
  "undergraduateEnrollment",
  "averageNetPrice",
  "graduationRate",
  "medianEarnings",
  "tuitionInState",
  "tuitionOutOfState",
] as const;

function assertObservation(
  value: unknown,
  collegeName: string,
  metricKey: string,
): asserts value is Observation {
  if (!value || typeof value !== "object") {
    throw new Error(`${collegeName} is missing ${metricKey} provenance.`);
  }

  const observation = value as Partial<Observation>;
  const hasNumericValue =
    observation.value === null ||
    (typeof observation.value === "number" &&
      Number.isFinite(observation.value));

  if (!hasNumericValue) {
    throw new Error(`${collegeName} has an invalid ${metricKey} value.`);
  }

  if (
    observation.value === null &&
    !["suppressed", "unavailable"].includes(observation.status ?? "")
  ) {
    throw new Error(
      `${collegeName} has a missing ${metricKey} value without a missing-data status.`,
    );
  }

  if (
    !Number.isInteger(observation.reportingYear) ||
    !observation.periodLabel ||
    !observation.finality ||
    !observation.comparabilityKey ||
    !observation.sourceId ||
    !observation.sourceName ||
    !observation.publisher ||
    !observation.sourceUrl ||
    !observation.sourceField ||
    !observation.cohort ||
    !observation.definition
  ) {
    throw new Error(`${collegeName} has incomplete ${metricKey} lineage.`);
  }
}

function validateDataset(value: unknown): CollegeDataset {
  if (!value || typeof value !== "object") {
    throw new Error("College dataset is unavailable.");
  }

  const dataset = value as Partial<CollegeDataset>;
  if (
    !dataset.release ||
    !Array.isArray(dataset.colleges) ||
    dataset.release.institutionCount !== dataset.colleges.length ||
    !dataset.release.metricPeriods ||
    Object.keys(dataset.release.metricPeriods).length === 0
  ) {
    throw new Error("College dataset release metadata does not match its rows.");
  }

  const unitIds = new Set<number>();
  for (const college of dataset.colleges) {
    if (!Number.isInteger(college.unitId) || unitIds.has(college.unitId)) {
      throw new Error(`Duplicate or invalid UNITID for ${college.name}.`);
    }
    unitIds.add(college.unitId);

    if (
      !college.opeId ||
      !college.opeId6 ||
      !college.mainCampus ||
      !college.currentlyOperating ||
      !Number.isInteger(college.branchCount) ||
      college.branchCount < 1
    ) {
      throw new Error(`${college.name} has incomplete federal identity data.`);
    }

    for (const key of requiredObservationKeys) {
      assertObservation(college.observations?.[key], college.name, key);
    }

    const admitRate = college.observations.admitRate.value;
    const graduationRate = college.observations.graduationRate.value;
    if (admitRate !== null && (admitRate < 0 || admitRate > 1)) {
      throw new Error(`${college.name} has an invalid admit rate.`);
    }
    if (graduationRate !== null && (graduationRate < 0 || graduationRate > 1)) {
      throw new Error(`${college.name} has an invalid graduation rate.`);
    }
    if (
      college.majors.some(
        (major) =>
          !Number.isFinite(major.share) ||
          major.share < 0 ||
          major.share > 1 ||
          major.bachelorsAvailable !== true,
      )
    ) {
      throw new Error(`${college.name} has invalid major evidence.`);
    }
    if (
      college.majors.some(
        (major) =>
          !Number.isInteger(major.reportingYear) ||
          !major.periodLabel ||
          !major.finality ||
          !major.sourceId ||
          !major.sourceField ||
          !major.cohort ||
          !major.definition,
      )
    ) {
      throw new Error(`${college.name} has incomplete broad-field lineage.`);
    }
  }

  return dataset as CollegeDataset;
}

export const collegeDataset = validateDataset(rawDataset);
export const colleges = collegeDataset.colleges;
export const release = collegeDataset.release;

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
  if (observation.unit === "ratio") {
    return percentFormatter.format(observation.value);
  }
  if (observation.unit === "usd") {
    return currencyFormatter.format(observation.value);
  }
  return numberFormatter.format(observation.value);
}

export function observationSourceKind(observation: Observation) {
  if (observation.sourceId.startsWith("uc-")) {
    return { label: "UC official", className: "uc-source", isFederal: false };
  }
  if (observation.publisher === "U.S. Department of Education") {
    return {
      label: "Federal baseline",
      className: "federal-source",
      isFederal: true,
    };
  }
  return {
    label: "College official",
    className: "official-source",
    isFederal: false,
  };
}

export function compactName(college: College) {
  return (
    college.aliases.find((alias) => alias.startsWith("UC ")) ||
    college.aliases[0] ||
    college.name
  );
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

export function collegeBySlug(slug: string) {
  return colleges.find((college) => college.slug === slug) ?? null;
}

export function collegesByUnitIds(unitIds: number[]) {
  const requested = new Set(unitIds);
  return colleges.filter((college) => requested.has(college.unitId));
}
