import { createHash } from "node:crypto";
import { assertCollegeEvidence } from "../../app/lib/college-evidence.ts";

const validReleaseId = /^sha256:[a-f0-9]{64}$/;
const ownershipCodes = new Map([
  ["Public", 1],
  ["Private nonprofit", 2],
  ["Private for-profit", 3],
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertRegisteredUrl(source, url, label) {
  const registered = [
    source.sourceUrl,
    source.sourcePage,
    source.artifactUrl,
    ...(source.sourceUrls ?? []),
    ...(source.sourceHashes ?? []).map((item) => item.sourceUrl),
  ];
  if (!registered.includes(url)) {
    throw new Error(`${label} references a URL outside source ${source.id}.`);
  }
}

function stableFactId(releaseId, unitId, factKey, isPrimary) {
  return sha256(`${releaseId}\n${unitId}\n${factKey}\n${isPrimary ? "primary" : "alternate"}`);
}

function makeFact({
  releaseId,
  unitId,
  source,
  sourceUrl,
  sourceField,
  factKey,
  metricKey,
  dimensionKey = null,
  isPrimary = true,
  valueNumeric = null,
  valueBoolean = null,
  valueText = null,
  unit,
  reportingYear,
  periodLabel,
  cohort,
  definition,
  status,
  finality,
  accessedOn,
  comparabilityKey,
}) {
  assertRegisteredUrl(source, sourceUrl, `${unitId} ${factKey}`);
  return {
    fact_id: stableFactId(releaseId, unitId, factKey, isPrimary),
    release_id: releaseId,
    unit_id: unitId,
    source_id: source.id,
    evidence_url: sourceUrl,
    source_field: requireText(sourceField, `${unitId} ${factKey} source field`),
    fact_key: factKey,
    metric_key: metricKey,
    dimension_key: dimensionKey,
    is_primary: isPrimary,
    value_numeric: valueNumeric,
    value_boolean: valueBoolean,
    value_text: valueText,
    unit,
    reporting_year: reportingYear ?? null,
    period_label: requireText(periodLabel, `${unitId} ${factKey} period`),
    cohort: requireText(cohort, `${unitId} ${factKey} cohort`),
    definition: requireText(definition, `${unitId} ${factKey} definition`),
    status,
    finality,
    accessed_on: accessedOn,
    comparability_key: comparabilityKey,
  };
}

function makePassage({
  releaseId,
  unitId,
  slug,
  source,
  sourceUrl,
  sourceField,
  reportingYear,
  periodLabel,
  cohort,
  definition,
  title,
  content,
}) {
  assertRegisteredUrl(source, sourceUrl, `${unitId} passage`);
  const contentSha256 = sha256(content);
  const passageId = sha256(
    `${releaseId}\n${unitId}\n${source.id}\n${sourceField}\n${contentSha256}`,
  );
  return {
    passage_id: passageId,
    release_id: releaseId,
    unit_id: unitId,
    college_slug: slug,
    source_id: source.id,
    source_url: sourceUrl,
    source_field: sourceField,
    field_locator: sourceField,
    reporting_year: reportingYear ?? null,
    period_label: periodLabel,
    cohort,
    definition,
    title,
    content,
    content_sha256: contentSha256,
    embedding: null,
    embedding_model: null,
    embedding_version: null,
    embedding_content_sha256: null,
  };
}

/** Deterministic compiler for the public, source-backed college knowledge release. */
export function buildCollegeKnowledge(dataset, releaseId) {
  if (!validReleaseId.test(releaseId ?? "")) {
    throw new Error("releaseId must be sha256 followed by a lowercase SHA-256 digest.");
  }
  if (!dataset || !Array.isArray(dataset.colleges) || !dataset.release) {
    throw new Error("College dataset is missing release metadata or college rows.");
  }
  assertCollegeEvidence(dataset);
  if (dataset.release.institutionCount !== dataset.colleges.length || dataset.colleges.length < 100) {
    throw new Error("Knowledge release must match a catalog of at least 100 institutions.");
  }

  const sourcesById = new Map(dataset.release.sources.map((source) => [source.id, source]));
  const scorecardSource = dataset.release.sources.find((source) =>
    /college scorecard/i.test(`${source.id} ${source.sourceName}`),
  );
  if (!scorecardSource) throw new Error("College Scorecard identity source is missing.");

  const release = {
    release_id: releaseId,
    dataset_sha256: releaseId.slice("sha256:".length),
    cohort_name: dataset.release.cohortName,
    institution_count: dataset.colleges.length,
    source_accessed_on: dataset.release.accessedOn,
    federal_release_date: dataset.release.federalReleaseDate,
    embedding_model: null,
    embedding_version: null,
    embedding_dimensions: 2048,
    release_metadata: {
      cohortName: dataset.release.cohortName,
      accessedOn: dataset.release.accessedOn,
      federalReleaseDate: dataset.release.federalReleaseDate,
      metricPeriods: dataset.release.metricPeriods,
      earningsPeriodLabel: dataset.release.earningsPeriodLabel,
      notes: dataset.release.notes,
    },
  };

  const sources = dataset.release.sources.map((source) => ({
    release_id: releaseId,
    source_id: source.id,
    publisher: source.publisher,
    source_name: source.sourceName,
    source_url: source.sourceUrl,
    source_page: source.sourcePage ?? null,
    artifact_url: source.artifactUrl ?? null,
    artifact_sha256: source.artifactSha256 ?? source.workbookSha256 ?? null,
    source_urls: source.sourceUrls ?? [],
    reporting_year: source.reportingYear ?? null,
    cohort: source.cohort ?? null,
    finality: source.finality ?? null,
    accessed_on: source.accessedOn,
    source_metadata: source,
  }));
  const catalog = [];
  const bindings = new Map();
  const facts = [];
  const passages = [];
  const seenIds = new Set();
  const seenSlugs = new Set();

  for (const college of dataset.colleges) {
    if (!Number.isSafeInteger(college.unitId) || seenIds.has(college.unitId)) {
      throw new Error(`Duplicate or invalid UNITID ${college.unitId}.`);
    }
    if (seenSlugs.has(college.slug)) throw new Error(`Duplicate college slug ${college.slug}.`);
    if (!["West", "Midwest", "South", "Northeast", "U.S. territories"].includes(college.region)) {
      throw new Error(`${college.name} has an invalid geographic grouping.`);
    }
    const ownershipCode = ownershipCodes.get(college.ownership);
    if (!ownershipCode) throw new Error(`${college.name} has an unsupported ownership classification.`);
    seenIds.add(college.unitId);
    seenSlugs.add(college.slug);

    catalog.push({
      release_id: releaseId,
      unit_id: college.unitId,
      slug: college.slug,
      name: college.name,
      city: college.city,
      state: college.state,
      census_region: college.region,
      ownership_code: ownershipCode,
      ownership_label: college.ownership,
      catalog_category: college.catalogCategory,
      inclusion_reason: college.inclusionReason,
      aliases: college.aliases,
      website: college.website,
      record_json: college,
    });

    const referencedSourceIds = new Set([scorecardSource.id]);
    for (const evidence of [college.observations, college.alternateObservations]) {
      for (const [metricKey, observation] of Object.entries(evidence ?? {})) {
        if (!observation) continue;
        const source = sourcesById.get(observation.sourceId);
        if (!source) throw new Error(`${college.name} ${metricKey} source is not registered.`);
        referencedSourceIds.add(source.id);
        const factKey = metricKey;
        facts.push(makeFact({
          releaseId,
          unitId: college.unitId,
          source,
          sourceUrl: observation.sourceUrl,
          sourceField: observation.sourceField,
          factKey,
          metricKey,
          isPrimary: evidence === college.observations,
          valueNumeric: observation.value,
          unit: observation.unit,
          reportingYear: observation.reportingYear,
          periodLabel: observation.periodLabel,
          cohort: observation.cohort,
          definition: observation.definition,
          status: observation.status,
          finality: observation.finality,
          accessedOn: observation.accessedOn,
          comparabilityKey: observation.comparabilityKey,
        }));
      }
    }

    passages.push(makePassage({
      releaseId,
      unitId: college.unitId,
      slug: college.slug,
      source: scorecardSource,
      sourceUrl: scorecardSource.sourceUrl,
      sourceField: "UNITID, INSTNM, CITY, STABBR, CONTROL, MAIN, CURROPER, HIGHDEG, ICLEVEL, PREDDEG",
      reportingYear: null,
      periodLabel: `College Scorecard institution release dated ${dataset.release.federalReleaseDate}`,
      cohort: "Current College Scorecard institution-level identity record.",
      definition: "Institution name, location, federal ownership code, main-campus status, operating status, degree level, and UNITID are copied from the matched institution-level record.",
      title: college.name,
      content: `${college.name} (UNITID ${college.unitId}) is a federally classified ${college.institutionLevel.toLowerCase()} ${college.ownership.toLowerCase()} institution in ${college.city}, ${college.state}. It is identified as a ${college.mainCampus ? "main" : "branch"} campus and reported operating in PEPS as of April 30, 2026. The source assigns an undergraduate award classification; current programs and operating status should be rechecked with the institution. ${/^\d{6}$/.test(college.opeId6) ? `Federal outcomes may be reported across campuses sharing OPEID6 ${college.opeId6}.` : "The federal OPEID6 reporting-group identifier is unavailable in this record; campus-specific outcome coverage is not established."}`,
    }));

    const programPassageGroups = new Map();
    for (const major of college.majors) {
      const source = sourcesById.get(major.sourceId);
      const cip = major.sourceField.match(/^PCIP(\d{2}) \+ CIP\d{2}(?:BACHL|ASSOC)(?: \+ CIP\d{2}ASSOC)?$/)?.[1];
      if (!source || !cip) throw new Error(`${college.name} has malformed broad-field evidence.`);
      referencedSourceIds.add(source.id);
      const majorFacts = [
        makeFact({
          releaseId,
          unitId: college.unitId,
          source,
          sourceUrl: source.sourceUrl,
          sourceField: major.sourceField,
          factKey: `majorShare:${cip}`,
          metricKey: "majorShare",
          dimensionKey: cip,
          valueNumeric: major.share,
          unit: "ratio",
          reportingYear: major.reportingYear,
          periodLabel: major.periodLabel,
          cohort: major.cohort,
          definition: major.definition,
          status: "reported",
          finality: major.finality,
          accessedOn: source.accessedOn,
          comparabilityKey: "awards.share.institution-wide",
        }),
        makeFact({
          releaseId,
          unitId: college.unitId,
          source,
          sourceUrl: source.sourceUrl,
          sourceField: major.sourceField,
          factKey: `majorAvailable:${cip}`,
          metricKey: "majorAvailable",
          dimensionKey: cip,
          valueBoolean: major.bachelorsAvailable || major.associatesAvailable === true,
          unit: "boolean",
          reportingYear: major.reportingYear,
          periodLabel: major.periodLabel,
          cohort: major.cohort,
          definition: major.definition,
          status: "reported",
          finality: major.finality,
          accessedOn: source.accessedOn,
          comparabilityKey: `program-availability.${major.degreeLevel ?? "bachelors"}.broad-cip`,
        }),
        makeFact({
          releaseId,
          unitId: college.unitId,
          source,
          sourceUrl: source.sourceUrl,
          sourceField: major.sourceField,
          factKey: `majorDeliveryMode:${cip}`,
          metricKey: "majorDeliveryMode",
          dimensionKey: cip,
          valueText: major.deliveryMode,
          unit: "category",
          reportingYear: major.reportingYear,
          periodLabel: major.periodLabel,
          cohort: major.cohort,
          definition: major.definition,
          status: "reported",
          finality: major.finality,
          accessedOn: source.accessedOn,
          comparabilityKey: "program-delivery.broad-cip",
        }),
      ];
      facts.push(...majorFacts);

      const degreeLabel = major.degreeLevel === "bachelors-and-associate" ? "bachelor's and associate" : major.degreeLevel === "associate" ? "associate" : "bachelor's";
      // Exact numeric award shares remain in college_facts. Group short program
      // descriptions by identical provenance so the vector index stays small,
      // without crossing an institution, source, reporting period, or cohort.
      const groupKey = JSON.stringify([major.sourceId, major.reportingYear, major.periodLabel, major.cohort]);
      const group = programPassageGroups.get(groupKey) ?? { source, major, entries: [] };
      group.entries.push({
        text: `${major.name} (${degreeLabel}${major.deliveryMode === "includes-distance-program" ? "; a distance option is reported" : ""})`,
        sourceField: major.sourceField.split(" + ").filter((field) => !field.startsWith("PCIP")).join(" + "),
      });
      programPassageGroups.set(groupKey, group);
    }
    for (const { source, major, entries } of programPassageGroups.values()) {
      const prefix = `${college.name} reports these broad federal fields in ${major.periodLabel}: `;
      const suffix = ". These are broad degree-level indicators, not individual majors or current program guarantees. A distance indicator does not establish whether on-campus options also exist. This evidence is not a major-specific admission or completion rate.";
      const chunks = [];
      let chunk = [];
      let length = prefix.length + suffix.length;
      for (const entry of entries) {
        if (chunk.length && length + entry.text.length + 2 > 1_900) {
          chunks.push(chunk);
          chunk = [];
          length = prefix.length + suffix.length;
        }
        chunk.push(entry);
        length += entry.text.length + 2;
      }
      if (chunk.length) chunks.push(chunk);
      for (const entries of chunks) passages.push(makePassage({
        releaseId,
        unitId: college.unitId,
        slug: college.slug,
        source,
        sourceUrl: source.sourceUrl,
        sourceField: entries.map((entry) => entry.sourceField).join(", "),
        reportingYear: major.reportingYear,
        periodLabel: major.periodLabel,
        cohort: major.cohort,
        definition: "Reported degree-level availability in broad CIP families. Individual program names, current offerings, admissions, and major-level outcomes are not established by these indicators; numeric institution-wide award shares are stored as separate structured facts.",
        title: `${college.name}: fields of study`,
        content: prefix + entries.map((entry) => entry.text).join("; ") + suffix,
      }));
    }

    for (const sourceId of referencedSourceIds) {
      if (!sourcesById.has(sourceId)) throw new Error(`${college.name} references unregistered source ${sourceId}.`);
      bindings.set(`${college.unitId}:${sourceId}`, {
        release_id: releaseId,
        unit_id: college.unitId,
        source_id: sourceId,
      });
    }
  }

  const ids = new Set(catalog.map((college) => college.unit_id));
  for (const row of [...facts, ...passages]) {
    if (!ids.has(row.unit_id) || !bindings.has(`${row.unit_id}:${row.source_id}`)) {
      throw new Error(`Evidence for UNITID ${row.unit_id} has no institution/source binding.`);
    }
  }

  return {
    release,
    catalog,
    sources,
    bindings: [...bindings.values()],
    facts,
    passages,
  };
}
