import {
  colleges,
  release,
  type College,
  type MajorEvidence,
  type SourceRelease,
} from "@/app/lib/college-data";

export type BroadFieldCollegeRecord = {
  college: College;
  evidence: MajorEvidence;
};

export type BroadField = {
  name: string;
  slug: string;
  records: BroadFieldCollegeRecord[];
  periodLabels: string[];
  sourceIds: string[];
};

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

function buildBroadFields() {
  const byName = new Map<string, BroadFieldCollegeRecord[]>();

  for (const college of colleges) {
    for (const evidence of college.majors) {
      const records = byName.get(evidence.name) ?? [];
      records.push({ college, evidence });
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

  return fields;
}

export const broadFields = buildBroadFields();

export function broadFieldBySlug(slug: string) {
  return broadFields.find((field) => field.slug === slug) ?? null;
}

export function sourceForBroadFieldEvidence(
  evidence: Pick<MajorEvidence, "sourceId">,
): SourceRelease | null {
  return release.sources.find((source) => source.id === evidence.sourceId) ?? null;
}

export function collegesWithoutBroadField(field: BroadField) {
  const represented = new Set(
    field.records.map(({ college }) => college.unitId),
  );
  return colleges.filter((college) => !represented.has(college.unitId));
}
