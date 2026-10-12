import type { College } from "./college-data";
import { observationSourceKind } from "./college-record-presentation";

export type CollegeTrustCoverage = {
  institutionCount: number;
  reviewedInstitutionRecordCount: number;
  reviewedCollegeAdmissionCount: number;
  firstPartyAdmissionCount: number;
  federalAdmissionCount: number;
  preliminaryUcSnapshotCount: number;
  partialInstitutionNames: string[];
  tuitionReportedCount: number;
};

/** Precompute the exact coverage summary used by the trust and source pages. */
export function summarizeCollegeTrustCoverage(
  colleges: readonly College[],
): CollegeTrustCoverage {
  const reviewedInstitutionRecords = colleges.filter((college) =>
    Object.values(college.observations).some(
      (observation) =>
        observation !== null &&
        !observation.sourceId.startsWith("uc-") &&
        !observationSourceKind(observation).isFederal,
    ),
  );
  const firstPartyAdmissions = colleges.filter(
    (college) => !observationSourceKind(college.observations.admitRate).isFederal,
  );
  const federalAdmissions = colleges.filter(
    (college) => observationSourceKind(college.observations.admitRate).isFederal,
  );
  const preliminaryUc = firstPartyAdmissions.filter((college) =>
    college.observations.admitRate.sourceId.startsWith("uc-"),
  );
  const reviewedCollegeAdmissions = reviewedInstitutionRecords.filter(
    (college) => !observationSourceKind(college.observations.admitRate).isFederal,
  );
  const partialInstitutionRecords = reviewedInstitutionRecords.filter(
    (college) => observationSourceKind(college.observations.admitRate).isFederal,
  );

  return {
    institutionCount: colleges.length,
    reviewedInstitutionRecordCount: reviewedInstitutionRecords.length,
    reviewedCollegeAdmissionCount: reviewedCollegeAdmissions.length,
    firstPartyAdmissionCount: firstPartyAdmissions.length,
    federalAdmissionCount: federalAdmissions.length,
    preliminaryUcSnapshotCount: preliminaryUc.length,
    partialInstitutionNames: partialInstitutionRecords.map(({ name }) => name),
    tuitionReportedCount: colleges.filter(
      (college) => college.costs.tuitionOutOfState.value !== null,
    ).length,
  };
}
