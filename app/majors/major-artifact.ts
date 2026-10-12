import type {
  College,
  CollegeDataset,
  MajorEvidence,
  SourceRelease,
} from "@/app/lib/college-data";

export type BroadFieldCollegeSummary = Pick<
  College,
  "unitId" | "slug" | "name" | "city" | "state" | "ownership" | "setting"
> & {
  observations: {
    admitRate: College["observations"]["admitRate"];
  };
};

export type BroadFieldSource = Pick<
  SourceRelease,
  "id" | "publisher" | "sourceName" | "sourceUrl"
>;

export type BroadFieldEvidence = Pick<
  MajorEvidence,
  | "share"
  | "bachelorsAvailable"
  | "associatesAvailable"
  | "periodLabel"
  | "sourceId"
  | "sourceField"
  | "cohort"
>;

export type BroadFieldRecordTuple = readonly [
  unitId: number,
  share: number,
  bachelorsAvailable: boolean,
  associatesAvailable: 0 | 1 | 2,
  periodLabelIndex: number,
  sourceIdIndex: number,
  sourceFieldIndex: number,
  cohortIndex: number,
];

export type CollegeBroadFieldsArtifact = {
  schemaVersion: 1;
  releaseId: string;
  cacheVersion: string;
  collegeCount: number;
  colleges: BroadFieldCollegeSummary[];
  sources: BroadFieldSource[];
  fields: Array<{
    name: string;
    slug: string;
    periodLabels: string[];
    sourceIds: string[];
    sourceFields: string[];
    cohorts: string[];
    records: BroadFieldRecordTuple[];
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isBroadFieldCollegeSummary(value: unknown): value is BroadFieldCollegeSummary {
  if (
    !isRecord(value) ||
    typeof value.unitId !== "number" ||
    !Number.isSafeInteger(value.unitId)
  ) return false;
  const observations = value.observations;
  if (
    typeof value.slug !== "string" ||
    typeof value.name !== "string" ||
    typeof value.city !== "string" ||
    typeof value.state !== "string" ||
    typeof value.ownership !== "string" ||
    typeof value.setting !== "string" ||
    !isRecord(observations) ||
    !isRecord(observations.admitRate)
  ) {
    return false;
  }

  const admission = observations.admitRate;
  return (
    (admission.value === null ||
      (typeof admission.value === "number" && Number.isFinite(admission.value))) &&
    (admission.unit === "ratio" || admission.unit === "usd" || admission.unit === "count") &&
    typeof admission.periodLabel === "string" &&
    typeof admission.publisher === "string"
  );
}

function isBroadFieldSource(value: unknown): value is BroadFieldSource {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.publisher === "string" &&
    typeof value.sourceName === "string" &&
    typeof value.sourceUrl === "string"
  );
}

function isFieldRecordTuple(
  value: unknown,
  periodLabels: readonly string[],
  sourceIds: readonly string[],
  sourceFields: readonly string[],
  cohorts: readonly string[],
): value is BroadFieldRecordTuple {
  if (!Array.isArray(value) || value.length !== 8) return false;
  const [unitId, share, bachelorsAvailable, associatesAvailable, periodIndex, sourceIndex, fieldIndex, cohortIndex] = value;
  return (
    typeof unitId === "number" && Number.isSafeInteger(unitId) &&
    typeof share === "number" && Number.isFinite(share) &&
    typeof bachelorsAvailable === "boolean" &&
    (associatesAvailable === 0 || associatesAvailable === 1 || associatesAvailable === 2) &&
    typeof periodIndex === "number" && Number.isSafeInteger(periodIndex) && periodIndex >= 0 && periodIndex < periodLabels.length &&
    typeof sourceIndex === "number" && Number.isSafeInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < sourceIds.length &&
    typeof fieldIndex === "number" && Number.isSafeInteger(fieldIndex) && fieldIndex >= 0 && fieldIndex < sourceFields.length &&
    typeof cohortIndex === "number" && Number.isSafeInteger(cohortIndex) && cohortIndex >= 0 && cohortIndex < cohorts.length
  );
}

function isBroadField(
  value: unknown,
): value is CollegeBroadFieldsArtifact["fields"][number] {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.slug !== "string") {
    return false;
  }
  const { periodLabels, sourceIds, sourceFields, cohorts, records } = value;
  if (
    !isStringArray(periodLabels) ||
    !isStringArray(sourceIds) ||
    !isStringArray(sourceFields) ||
    !isStringArray(cohorts) ||
    !Array.isArray(records)
  ) {
    return false;
  }
  return records.every((record) =>
    isFieldRecordTuple(
      record,
      periodLabels,
      sourceIds,
      sourceFields,
      cohorts,
    ),
  );
}

export function isCollegeBroadFieldsArtifact(
  value: unknown,
): value is CollegeBroadFieldsArtifact {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.releaseId !== "string" ||
    typeof value.cacheVersion !== "string" ||
    typeof value.collegeCount !== "number" ||
    !Number.isSafeInteger(value.collegeCount) ||
    !Array.isArray(value.colleges) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.fields)
  ) {
    return false;
  }
  return (
    value.collegeCount === value.colleges.length &&
    value.colleges.every(isBroadFieldCollegeSummary) &&
    value.sources.every(isBroadFieldSource) &&
    value.fields.every(isBroadField)
  );
}

export function broadFieldSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function projectCollegeBroadFields(
  colleges: readonly College[],
  release: CollegeDataset["release"],
  releaseId: string,
  cacheVersion: string,
): CollegeBroadFieldsArtifact {
  const byName = new Map<
    string,
    Array<{ unitId: number; evidence: BroadFieldEvidence }>
  >();

  for (const college of colleges) {
    for (const evidence of college.majors) {
      const records = byName.get(evidence.name) ?? [];
      records.push({
        unitId: college.unitId,
        evidence: {
          share: evidence.share,
          bachelorsAvailable: evidence.bachelorsAvailable,
          associatesAvailable: evidence.associatesAvailable,
          periodLabel: evidence.periodLabel,
          sourceId: evidence.sourceId,
          sourceField: evidence.sourceField,
          cohort: evidence.cohort,
        },
      });
      byName.set(evidence.name, records);
    }
  }

  const fields = [...byName.entries()]
    .map(([name, records]) => ({
      name,
      slug: broadFieldSlug(name),
      records,
      periodLabels: [...new Set(records.map(({ evidence }) => evidence.periodLabel))],
      sourceIds: [...new Set(records.map(({ evidence }) => evidence.sourceId))],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const slugs = new Set<string>();
  for (const field of fields) {
    if (!field.slug || slugs.has(field.slug)) {
      throw new Error(`Broad field slug is missing or duplicated: ${field.name}`);
    }
    slugs.add(field.slug);
  }

  const compactFields = fields.map((field) => {
    const sourceFields = [...new Set(field.records.map(({ evidence }) => evidence.sourceField))];
    const cohorts = [...new Set(field.records.map(({ evidence }) => evidence.cohort))];
    const periodLabelIndex = new Map(field.periodLabels.map((label, index) => [label, index]));
    const sourceIdIndex = new Map(field.sourceIds.map((sourceId, index) => [sourceId, index]));
    const sourceFieldIndex = new Map(sourceFields.map((sourceField, index) => [sourceField, index]));
    const cohortIndex = new Map(cohorts.map((cohort, index) => [cohort, index]));

    return {
      name: field.name,
      slug: field.slug,
      periodLabels: field.periodLabels,
      sourceIds: field.sourceIds,
      sourceFields,
      cohorts,
      records: field.records.map(({ unitId, evidence }) => ([
        unitId,
        evidence.share,
        evidence.bachelorsAvailable,
        evidence.associatesAvailable === undefined
          ? 2
          : evidence.associatesAvailable
            ? 1
            : 0,
        periodLabelIndex.get(evidence.periodLabel)!,
        sourceIdIndex.get(evidence.sourceId)!,
        sourceFieldIndex.get(evidence.sourceField)!,
        cohortIndex.get(evidence.cohort)!,
      ] as const)),
    };
  });

  const usedSourceIds = new Set(fields.flatMap(({ sourceIds }) => sourceIds));
  const sources = release.sources
    .filter((source) => usedSourceIds.has(source.id))
    .map(({ id, publisher, sourceName, sourceUrl }) => ({
      id,
      publisher,
      sourceName,
      sourceUrl,
    }));

  return {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    collegeCount: colleges.length,
    colleges: colleges.map((college) => ({
      unitId: college.unitId,
      slug: college.slug,
      name: college.name,
      city: college.city,
      state: college.state,
      ownership: college.ownership,
      setting: college.setting,
      observations: { admitRate: college.observations.admitRate },
    })),
    sources,
    fields: compactFields,
  };
}
