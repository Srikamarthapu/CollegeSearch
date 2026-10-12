import { usableAdviserObservation } from "../app/lib/adviser/evidence.ts";

const factLabels = {
  undergraduateEnrollment: "Undergraduates",
  averageNetPrice: "Historical average net price / year",
  admitRate: "Historical overall admission rate",
  graduationRate: "Graduation rate",
  tuitionOutOfState: "Nonresident tuition & required fees / year",
  tuitionInState: "Resident tuition & required fees / year",
};
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function citationDifferences(actual, expected) {
  const keys = ["sourceId", "name", "publisher", "url", "year", "period", "cohort", "definition", "checkedOn", "field"];
  return keys.filter((key) => actual?.[key] !== expected[key]);
}

function displayValue(observation) {
  if (observation.unit === "usd") return currency.format(observation.value);
  if (observation.unit === "ratio") return percent.format(observation.value);
  return observation.value.toLocaleString("en-US");
}

function usablePublicTuition(college, preferences) {
  if (college.ownership !== "Public") {
    const observation = college.observations.tuitionOutOfState;
    return usableAdviserObservation(observation) ? ["tuitionOutOfState", observation, "Published tuition & required fees / year"] : null;
  }
  if (!preferences.residencyState) return null;
  const key = college.state === preferences.residencyState ? "tuitionInState" : "tuitionOutOfState";
  const observation = college.observations[key];
  if (!usableAdviserObservation(observation) || (key === "tuitionInState" && observation.comparabilityKey === "tuition-fees.in-district")) return null;
  return [key, observation, factLabels[key]];
}

function expectedFacts(college, preferences) {
  const result = new Map();
  for (const key of ["undergraduateEnrollment", "admitRate", "graduationRate"]) {
    const observation = college.observations[key];
    if (usableAdviserObservation(observation)) result.set(key, { key, observation, label: factLabels[key] });
  }
  const tuition = usablePublicTuition(college, preferences);
  if (tuition) result.set(tuition[0], { key: tuition[0], observation: tuition[1], label: tuition[2] });
  const netPrice = college.observations.averageNetPrice;
  if (usableAdviserObservation(netPrice) && (college.ownership !== "Public" || preferences.residencyState === college.state)) {
    result.set("averageNetPrice", { key: "averageNetPrice", observation: netPrice, label: factLabels.averageNetPrice });
  }
  return result;
}

function observationCitation(observation) {
  return {
    sourceId: observation.sourceId,
    name: observation.sourceName,
    publisher: observation.publisher,
    url: observation.sourceUrl,
    year: observation.reportingYear,
    period: observation.periodLabel,
    cohort: observation.cohort,
    definition: observation.definition,
    checkedOn: observation.accessedOn,
    field: observation.sourceField,
  };
}

function sourceRecordDifferences(observation, dataset, citation) {
  const source = dataset.release.sources.find((entry) => entry.id === observation.sourceId);
  if (!source) return ["sourceId"];
  const differences = [];
  if (source.sourceName !== observation.sourceName) differences.push("name");
  if (source.publisher !== observation.publisher) differences.push("publisher");
  const registeredUrls = [source.sourceUrl, source.sourcePage, source.artifactUrl, ...(source.sourceUrls ?? [])].filter(Boolean);
  if (!registeredUrls.includes(observation.sourceUrl)) differences.push("url");
  if (source.accessedOn !== observation.accessedOn) differences.push("checkedOn");
  // Older persisted answers omit this optional field; when present it must bind exactly.
  if (citation && Object.hasOwn(citation, "artifactUrl") && citation.artifactUrl !== source.artifactUrl) differences.push("artifactUrl");
  return differences;
}

function expectedProgramFields(college, preferences, dataset) {
  return college.majors.filter((major) => preferences.fields.includes(major.name)).map((major) => {
    const source = dataset.release.sources.find((entry) => entry.id === major.sourceId);
    return {
      major,
      citation: {
        sourceId: major.sourceId,
        name: source?.sourceName,
        publisher: source?.publisher,
        url: source?.sourceUrl,
        year: major.reportingYear,
        period: major.periodLabel,
        cohort: major.cohort,
        definition: major.definition,
        checkedOn: source?.accessedOn,
        field: major.sourceField,
      },
      qualification: major.evidence,
    };
  });
}

/** Independently bind card facts and program evidence to raw canonical catalog records. */
export function auditRecommendationEvidence(recommendation, college, preferences, dataset) {
  const failures = [];
  for (const key of ["unitId", "slug", "name", "city", "state", "ownership"]) {
    if (recommendation[key] !== college[key]) failures.push(`identity:${key}`);
  }

  const factExpectations = expectedFacts(college, preferences);
  const actualFactKeys = new Set();
  for (const fact of recommendation.facts ?? []) {
    if (actualFactKeys.has(fact.key)) failures.push(`fact:${fact.key}:duplicate`);
    actualFactKeys.add(fact.key);
    const canonical = factExpectations.get(fact.key);
    if (!canonical) { failures.push(`fact:${fact.key}:unexpected`); continue; }
    const observation = canonical.observation;
    if (fact.label !== canonical.label) failures.push(`fact:${fact.key}:label`);
    if (fact.display !== displayValue(observation)) failures.push(`fact:${fact.key}:number`);
    for (const key of citationDifferences(fact.citation, observationCitation(observation))) failures.push(`fact:${fact.key}:citation:${key}`);
    for (const key of sourceRecordDifferences(observation, dataset, fact.citation)) failures.push(`fact:${fact.key}:source-record:${key}`);
  }
  for (const key of factExpectations.keys()) if (!actualFactKeys.has(key)) failures.push(`fact:${key}:missing`);

  const fieldExpectations = new Map(expectedProgramFields(college, preferences, dataset).map((item) => [item.major.name, item]));
  const actualFieldNames = new Set();
  for (const field of recommendation.fields ?? []) {
    if (actualFieldNames.has(field.name)) failures.push(`program:${field.name}:duplicate`);
    actualFieldNames.add(field.name);
    const canonical = fieldExpectations.get(field.name);
    if (!canonical) { failures.push(`program:${field.name}:unexpected`); continue; }
    if (field.qualification !== canonical.qualification) failures.push(`program:${field.name}:qualification`);
    for (const key of citationDifferences(field.citation, canonical.citation)) failures.push(`program:${field.name}:citation:${key}`);
    if (!canonical.citation.name || !canonical.citation.publisher || !canonical.citation.url || !canonical.citation.checkedOn) {
      failures.push(`program:${field.name}:source-record:missing`);
    }
    const source = dataset.release.sources.find((entry) => entry.id === canonical.major.sourceId);
    if (field.citation && Object.hasOwn(field.citation, "artifactUrl") && field.citation.artifactUrl !== source?.artifactUrl) {
      failures.push(`program:${field.name}:source-record:artifactUrl`);
    }
  }
  for (const name of fieldExpectations.keys()) if (!actualFieldNames.has(name)) failures.push(`program:${name}:missing`);

  return {
    factCount: recommendation.facts?.length ?? 0,
    factBindingsVerified: (recommendation.facts ?? []).filter((fact) => !failures.some((failure) => failure.startsWith(`fact:${fact.key}:`))).length,
    programFieldCount: recommendation.fields?.length ?? 0,
    programBindingsVerified: (recommendation.fields ?? []).filter((field) => !failures.some((failure) => failure.startsWith(`program:${field.name}:`))).length,
    failures,
    passed: failures.length === 0,
  };
}
