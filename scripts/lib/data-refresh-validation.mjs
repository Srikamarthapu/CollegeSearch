import { createHash } from "node:crypto";

import { cohortUnitIds } from "./college-cohort.mjs";

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assertOverlaySnapshotUnchanged(snapshotBytes, liveBytes) {
  if (sha256Hex(snapshotBytes) !== sha256Hex(liveBytes)) {
    throw new Error(
      "Institution overlays changed during refresh; rerun so verification and publication use one reviewed snapshot.",
    );
  }
}

export function validateStagedRelease({
  finalizedAdmissions,
  latestAdmissions,
  generatedColleges,
  expectedUnitIds = cohortUnitIds,
}) {
  const finalizedReportingYear = finalizedAdmissions?.release?.reportingYear;
  const reportingYear = latestAdmissions?.release?.reportingYear;
  if (!Number.isInteger(finalizedReportingYear)) {
    throw new Error("Staged finalized UC admissions release has no reporting year.");
  }
  if (!Number.isInteger(reportingYear)) {
    throw new Error("Staged UC admissions release has no reporting year.");
  }
  if (reportingYear === finalizedReportingYear) {
    throw new Error(
      `UC finalized and latest releases both resolve to ${reportingYear}; refusing to overwrite one archive with the other.`,
    );
  }

  const expectedIds = [...expectedUnitIds].sort((left, right) => left - right);
  const generatedUnitIds = generatedColleges?.colleges?.map(
    (college) => college.unitId,
  );
  const actualIds = Array.isArray(generatedUnitIds)
    ? [...generatedUnitIds].sort((left, right) => left - right)
    : [];
  if (
    generatedColleges?.release?.institutionCount !== expectedIds.length ||
    actualIds.length !== expectedIds.length ||
    new Set(actualIds).size !== expectedIds.length ||
    actualIds.some((unitId, index) => unitId !== expectedIds[index])
  ) {
    throw new Error(
      `Staged college release does not contain the reviewed ${expectedIds.length}-college cohort.`,
    );
  }

  const fileNames = [
    `uc-admissions-${finalizedReportingYear}.json`,
    `uc-admissions-${reportingYear}.json`,
    "uc-admissions-latest.json",
    "colleges.json",
  ];
  if (new Set(fileNames).size !== fileNames.length) {
    throw new Error("Generated data targets collide; refusing to publish a mixed release.");
  }

  return { fileNames, reportingYear, finalizedReportingYear };
}
