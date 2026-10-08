import type { College, Observation } from "./college-data";

type TuitionCollege<TObservation> = Pick<College, "ownership"> & {
  costs: { tuitionOutOfState: TObservation };
};

export function residentTuitionLabel(observation: Observation) {
  return observation.sourceField === "TUITIONFEE_IN" && observation.publisher === "U.S. Department of Education"
    ? "In-district tuition + required fees"
    : "In-state tuition + required fees";
}

export function standardTuitionLabel(ownership: College["ownership"]) {
  return ownership === "Public"
    ? "Out-of-state tuition + required fees"
    : "Published tuition + required fees";
}

export function primaryTuitionMetric<TObservation>(college: TuitionCollege<TObservation>) {
  return {
    label: college.ownership === "Public" ? "Out-of-state tuition" : "Published tuition",
    observation: college.costs.tuitionOutOfState,
  };
}

export function cardTuitionMetrics<TObservation>(college: TuitionCollege<TObservation> & {
  costs: { tuitionInState: TObservation };
}) {
  return college.ownership === "Public"
    ? [
      { label: "In-state tuition", observation: college.costs.tuitionInState },
      { label: "Out-of-state tuition", observation: college.costs.tuitionOutOfState },
    ]
    : [primaryTuitionMetric(college)];
}

export function tuitionMetrics(college: College) {
  const standard = primaryTuitionMetric(college);
  const fees = college.costs.feeBasis === "allowance" ? "Student fees allowance" : "Required fees";
  return college.ownership === "Public"
    ? [
      { label: "In-state tuition", observation: college.costs.tuitionInState },
      { label: college.costs.feeBasis === "allowance" ? "In-state fee allowance" : "In-state required fees", observation: college.costs.feesInState },
      standard,
      { label: college.costs.feeBasis === "allowance" ? "Out-of-state fee allowance" : "Out-of-state required fees", observation: college.costs.feesOutOfState },
    ]
    : [standard, { label: fees, observation: college.costs.feesOutOfState }];
}

export function combinedTuitionMetrics(college: College) {
  const standard = { label: standardTuitionLabel(college.ownership), observation: college.observations.tuitionOutOfState };
  return college.ownership === "Public"
    ? [{ label: residentTuitionLabel(college.observations.tuitionInState), observation: college.observations.tuitionInState }, standard]
    : [standard];
}
