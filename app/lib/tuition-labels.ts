import type { College, Observation } from "./college-data";

export function residentTuitionLabel(observation: Observation) {
  return observation.sourceField === "TUITIONFEE_IN" && observation.publisher === "U.S. Department of Education"
    ? "In-district tuition + required fees"
    : "In-state tuition + required fees";
}

export function tuitionMetrics(college: College) {
  const standard = {
    label: college.ownership === "Public" ? "Out-of-state tuition + required fees" : "Published tuition + required fees",
    observation: college.observations.tuitionOutOfState,
  };
  return college.ownership === "Public"
    ? [{ label: residentTuitionLabel(college.observations.tuitionInState), observation: college.observations.tuitionInState }, standard]
    : [standard];
}
