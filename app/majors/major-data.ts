import collegeBroadFields from "@/data/college-broad-fields.json";
import runtimeSummary from "@/data/college-runtime-summary.json";
import {
  broadFieldSlug,
  isCollegeBroadFieldsArtifact,
  type BroadFieldCollegeSummary,
  type BroadFieldEvidence,
  type BroadFieldSource,
  type CollegeBroadFieldsArtifact,
} from "./major-artifact";

export { broadFieldSlug };
export type { BroadFieldCollegeSummary, BroadFieldSource };

export type BroadFieldCollegeRecord = {
  college: BroadFieldCollegeSummary;
  evidence: BroadFieldEvidence;
};

export type BroadField = {
  name: string;
  slug: string;
  records: BroadFieldCollegeRecord[];
  periodLabels: string[];
  sourceIds: string[];
};

const artifactValue: unknown = collegeBroadFields;
if (
  !isCollegeBroadFieldsArtifact(artifactValue) ||
  artifactValue.releaseId !== runtimeSummary.releaseId ||
  artifactValue.cacheVersion !== runtimeSummary.cacheVersion ||
  artifactValue.collegeCount !== runtimeSummary.institutionCount
) {
  throw new Error(
    "The generated broad-field artifact is malformed, stale, or inconsistent. Run scripts/build-college-directory-artifact.mjs.",
  );
}
const artifact: CollegeBroadFieldsArtifact = artifactValue;

export const colleges = artifact.colleges;
export const broadFieldCollegeCount = artifact.collegeCount;
export const broadFieldSources: BroadFieldSource[] = artifact.sources;

const collegeByUnitId = new Map(colleges.map((college) => [college.unitId, college]));
const sourceById = new Map<string, BroadFieldSource>();
for (const source of broadFieldSources) {
  if (!sourceById.has(source.id)) sourceById.set(source.id, source);
}

function dictionaryValue(values: string[], index: number, label: string) {
  const value = values[index];
  if (typeof value !== "string") {
    throw new Error(`Broad-field artifact has an invalid ${label} reference.`);
  }
  return value;
}

export const broadFields: BroadField[] = artifact.fields.map((field) => ({
  name: field.name,
  slug: field.slug,
  periodLabels: field.periodLabels,
  sourceIds: field.sourceIds,
  records: field.records.map((record) => {
    const [
      unitId,
      share,
      bachelorsAvailable,
      associatesAvailableCode,
      periodLabelIndex,
      sourceIdIndex,
      sourceFieldIndex,
      cohortIndex,
    ] = record;
    const college = collegeByUnitId.get(unitId);
    if (!college) {
      throw new Error(`Broad-field record references unknown college ${unitId}.`);
    }
    const associatesAvailable = associatesAvailableCode === 2
      ? undefined
      : associatesAvailableCode === 1;
    return {
      college,
      evidence: {
        share,
        bachelorsAvailable,
        associatesAvailable,
        periodLabel: dictionaryValue(field.periodLabels, periodLabelIndex, "period"),
        sourceId: dictionaryValue(field.sourceIds, sourceIdIndex, "source"),
        sourceField: dictionaryValue(field.sourceFields, sourceFieldIndex, "source field"),
        cohort: dictionaryValue(field.cohorts, cohortIndex, "cohort"),
      },
    };
  }),
}));

export function broadFieldBySlug(slug: string) {
  return broadFields.find((field) => field.slug === slug) ?? null;
}

export function sourceForBroadFieldEvidence(
  evidence: Pick<BroadFieldEvidence, "sourceId">,
): BroadFieldSource | null {
  return sourceById.get(evidence.sourceId) ?? null;
}

export function collegesWithoutBroadField(field: BroadField) {
  const represented = new Set(
    field.records.map(({ college }) => college.unitId),
  );
  return colleges.filter((college) => !represented.has(college.unitId));
}
