export type AdmitContextBand = {
  label: string;
  explanation: string;
};

export function historicalAdmitBand(rate: number | null): AdmitContextBand {
  if (rate === null) {
    return {
      label: "No usable overall rate",
      explanation:
        "This release does not contain a comparable overall first-year admit rate.",
    };
  }
  if (rate <= 0.1) {
    return {
      label: "Very low observed overall rate",
      explanation:
        "In this reported cohort, no more than one in ten applicants was admitted overall.",
    };
  }
  if (rate <= 0.25) {
    return {
      label: "Low observed overall rate",
      explanation:
        "In this reported cohort, between roughly one in ten and one in four applicants was admitted overall.",
    };
  }
  if (rate <= 0.5) {
    return {
      label: "Moderate observed overall rate",
      explanation:
        "In this reported cohort, between roughly one in four and one in two applicants was admitted overall.",
    };
  }
  return {
    label: "Broad observed overall rate",
    explanation:
      "In this reported cohort, more than half of applicants was admitted overall.",
  };
}
