import type { College, Observation } from "./college-data";

type TuitionCollege<TObservation> = Pick<College, "ownership"> & {
  observations: { tuitionOutOfState: TObservation };
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
    label: standardTuitionLabel(college.ownership),
    observation: college.observations.tuitionOutOfState,
  };
}

export function tuitionMetrics(college: College) {
  const standard = primaryTuitionMetric(college);
  return college.ownership === "Public"
    ? [{ label: residentTuitionLabel(college.observations.tuitionInState), observation: college.observations.tuitionInState }, standard]
    : [standard];
}
