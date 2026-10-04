#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  archive: "work/scorecard-current/Most-Recent-Cohorts-Institution_06102026.zip",
  dataset: "data/colleges.json",
  manifest: "data/college-catalog.json",
};
const maximumArchiveBytes = 250 * 1024 * 1024;
const maximumCsvBytes = 250 * 1024 * 1024;
const examplesLimit = 30;
const usJurisdictionCodes = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC", "PR", "GU", "VI", "AS", "MP",
]);
const ownershipLabels = Object.freeze({
  1: "Public",
  2: "Private nonprofit",
  3: "Private for-profit",
});

function eligibilityForScorecardRow(row) {
  const control = numberFromCsv(row.CONTROL);
  const level = numberFromCsv(row.ICLEVEL);
  const predominantDegree = numberFromCsv(row.PREDDEG);
  return (
    row.CURROPER === "1" &&
    [1, 2].includes(level) &&
    [1, 2, 3].includes(predominantDegree) &&
    [1, 2, 3].includes(control) &&
    usJurisdictionCodes.has(row.STABBR)
  );
}

function websiteFromScorecard(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function settingFromLocale(value) {
  const locale = numberFromCsv(value);
  if (locale >= 11 && locale <= 13) return "City";
  if (locale >= 21 && locale <= 23) return "Suburb";
  if (locale >= 31 && locale <= 33) return "Town";
  if (locale >= 41 && locale <= 43) return "Rural";
  return "Setting unavailable";
}

function parseArguments(argv) {
  const options = { ...defaults, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const names = {
      "--archive": "archive",
      "--dataset": "dataset",
      "--manifest": "manifest",
      "--report": "report",
    };
    const name = names[argument];
    if (!name) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Expected a path after ${argument}.`);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return [
    "Audit generated College Scorecard observations against the pinned institution ZIP.",
    "",
    "Usage:",
    "  node scripts/audit-catalog-federal-evidence.mjs [options]",
    "",
    "Options:",
    "  --archive PATH   Scorecard ZIP (default: work/scorecard-current/Most-Recent-Cohorts-Institution_06102026.zip)",
    "  --dataset PATH   Generated colleges JSON (default: data/colleges.json)",
    "  --manifest PATH  Reviewed catalog manifest (default: data/college-catalog.json)",
    "  --report PATH    Write the complete machine-readable audit result to PATH",
  ].join("\n");
}

function absoluteProjectPath(path) {
  return resolve(repositoryRoot, path);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error.message}`);
  }
}

function* csvRecords(text, selectedIndexes = null) {
  let row = selectedIndexes === null ? [] : Object.create(null);
  let cell = "";
  let column = 0;
  let quoted = false;
  const collectCell = () =>
    selectedIndexes === null || selectedIndexes.has(column);
  const finishCell = () => {
    if (collectCell()) {
      if (selectedIndexes === null) row.push(cell);
      else row[column] = cell;
    }
    cell = "";
    column += 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          if (collectCell()) cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else if (collectCell()) {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      finishCell();
    } else if (character === "\n" || character === "\r") {
      finishCell();
      yield row;
      row = selectedIndexes === null ? [] : Object.create(null);
      column = 0;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else if (collectCell()) {
      cell += character;
    }
  }

  if (cell.length > 0 || column > 0) {
    finishCell();
    yield row;
  }
}

function numberFromCsv(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (
    normalized === "" ||
    ["NA", "NULL", "PrivacySuppressed", "PS"].includes(normalized)
  ) {
    return null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function sameNumber(expected, actual) {
  if (expected === null || actual === null) return expected === actual;
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  return Math.abs(expected - actual) <= 1e-12 * Math.max(1, Math.abs(expected), Math.abs(actual));
}

function sourceFieldsFromPeriods(release) {
  const fields = new Set();
  for (const period of Object.values(release?.metricPeriods || {})) {
    for (const field of period?.sourceFields || []) {
      if (typeof field === "string") fields.add(field);
    }
  }
  return fields;
}

function sourceFieldParts(sourceField) {
  if (typeof sourceField !== "string") return [];
  const trimmed = sourceField.trim();
  if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) return [trimmed];
  if (/^[A-Z][A-Z0-9_]*(?:\s*\+\s*[A-Z][A-Z0-9_]*){1,2}$/.test(trimmed)) {
    return trimmed.split("+").map((part) => part.trim());
  }
  return [];
}

function knownDerivedSourceField(sourceField) {
  return (
    typeof sourceField === "string" &&
    (/^derived\b/i.test(sourceField.trim()) ||
      /\bdivided by\b/i.test(sourceField) ||
      /\bcomputed from\b/i.test(sourceField))
  );
}

function observationEntries(college) {
  const results = [];
  for (const [collectionName, collection] of [
    ["observations", college.observations],
    ["alternateObservations", college.alternateObservations],
  ]) {
    if (!collection || typeof collection !== "object") continue;
    for (const [metric, observation] of Object.entries(collection)) {
      if (observation && typeof observation === "object") {
        results.push({ collectionName, metric, observation });
      }
    }
  }
  return results;
}

function fail(result, category, detail) {
  result.counts.errors += 1;
  result.errors.push({ category, ...detail });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const archivePath = absoluteProjectPath(options.archive);
  const datasetPath = absoluteProjectPath(options.dataset);
  const manifestPath = absoluteProjectPath(options.manifest);
  const [dataset, manifest] = await Promise.all([
    readJson(datasetPath, "generated dataset"),
    readJson(manifestPath, "reviewed catalog manifest"),
  ]);
  const colleges = Array.isArray(dataset.colleges) ? dataset.colleges : [];
  const catalogInstitutions = Array.isArray(manifest.institutions)
    ? manifest.institutions
    : [];
  const report = {
    status: "FAIL",
    archive: archivePath,
    dataset: datasetPath,
    manifest: manifestPath,
    counts: {
      errors: 0,
      warnings: 0,
      datasetColleges: colleges.length,
      manifestInstitutions: catalogInstitutions.length,
      sourceRowsLoaded: 0,
      officialEligibleSourceRows: 0,
      identitiesChecked: 0,
      primaryFederalObservations: 0,
      alternateFederalObservations: 0,
      directValueChecks: 0,
      numericValueChecks: 0,
      unavailableValueChecks: 0,
      majorFieldPairsChecked: 0,
      dualDegreeAvailabilityPairs: 0,
      graduationPopulationChecks: 0,
      negativeAverageNetPriceValues: 0,
      nonScorecardObservationsExcluded: 0,
      notDirectFieldObservations: 0,
    },
    hashes: {},
    source: {},
    selection: {
      rules: {
        jurisdictionCodes: [...usJurisdictionCodes].sort(),
        currentOperation: "CURROPER = 1 (PEPS snapshot dated 2026-04-30)",
        institutionLevel: "ICLEVEL = 1 or 2",
        predominantDegree: "PREDDEG = 1, 2, or 3",
        ownership: "CONTROL = 1, 2, or 3",
        unitIdentity: "Every qualifying UNITID, with MAIN = 0 branch records kept separately",
      },
      sourceRowsByLevel: {},
      sourceRowsByOwnership: {},
      sourceRowsByPredominantDegree: {},
      sourceRowsByMain: {},
      sourceRowsByJurisdiction: {},
    },
    nonScorecardSourceCounts: {},
    notDirectFields: [],
    errors: [],
    warnings: [],
  };

  const manifestSource = manifest.source || {};
  const scorecardSources = (dataset.release?.sources || []).filter(
    (source) =>
      source.artifactSha256 === manifestSource.artifactSha256 ||
      source.artifactUrl === manifestSource.artifactUrl,
  );
  if (scorecardSources.length !== 1) {
    fail(report, "source-registration", {
      message: `Expected exactly one registered Scorecard release matching the manifest; found ${scorecardSources.length}.`,
    });
  }
  const scorecardSource = scorecardSources[0] || null;
  const scorecardSourceId = scorecardSource?.id || null;
  report.source = {
    id: scorecardSourceId,
    artifactUrl: scorecardSource?.artifactUrl || null,
    manifestArtifactUrl: manifestSource.artifactUrl || null,
    releaseDate: scorecardSource?.releaseDate || null,
    manifestReleaseDate: manifestSource.releaseDate || null,
    datasetReleaseDate: dataset.release?.federalReleaseDate || null,
  };

  const zipBytes = await readFile(archivePath);
  if (zipBytes.byteLength > maximumArchiveBytes) {
    throw new Error(`Archive exceeds the ${maximumArchiveBytes}-byte safety limit.`);
  }
  const archiveSha256 = createHash("sha256").update(zipBytes).digest("hex");
  report.hashes = {
    archiveSha256,
    manifestSha256: manifestSource.artifactSha256 || null,
    datasetSourceSha256: scorecardSource?.artifactSha256 || null,
  };
  if (!manifestSource.artifactSha256 || archiveSha256 !== manifestSource.artifactSha256) {
    fail(report, "archive-hash", {
      message: "The supplied ZIP does not match the reviewed catalog manifest fingerprint.",
      expected: manifestSource.artifactSha256 || null,
      actual: archiveSha256,
    });
  }
  if (scorecardSource?.artifactSha256 !== archiveSha256) {
    fail(report, "archive-hash", {
      message: "The generated dataset's registered Scorecard source hash does not match the supplied ZIP.",
      expected: scorecardSource?.artifactSha256 || null,
      actual: archiveSha256,
    });
  }
  if (
    scorecardSource?.artifactUrl &&
    manifestSource.artifactUrl &&
    scorecardSource.artifactUrl !== manifestSource.artifactUrl
  ) {
    fail(report, "artifact-url", {
      message: "The manifest and generated dataset reference different Scorecard artifact URLs.",
      manifest: manifestSource.artifactUrl,
      dataset: scorecardSource.artifactUrl,
    });
  }
  const dates = [
    ["manifest release date", manifestSource.releaseDate],
    ["dataset source release date", scorecardSource?.releaseDate],
    ["generated federal release date", dataset.release?.federalReleaseDate],
  ];
  const distinctDates = new Set(dates.map(([, date]) => date).filter(Boolean));
  if (distinctDates.size > 1) {
    fail(report, "release-date", {
      message: "The manifest and generated data disagree on the pinned Scorecard release date.",
      dates: Object.fromEntries(dates),
    });
  }
  const lessThanFourYearGraduation = dataset.release?.metricPeriods?.graduationRateLessThanFourYear;
  if (
    lessThanFourYearGraduation?.reportingYear !== 2024 ||
    lessThanFourYearGraduation?.periodLabel !== "Fall 2021 entering cohort" ||
    !lessThanFourYearGraduation?.sourceFields?.includes("C150_L4")
  ) {
    fail(report, "graduation-period-metadata", {
      message: "The less-than-four-year completion period must follow the official C150_L4 Fall 2021 / 2021-22 cohort map.",
      actual: lessThanFourYearGraduation || null,
    });
  }
  if (!/PEPS as of April 30, 2026/i.test(manifest.selectionRules?.currentlyOperatingField || "")) {
    fail(report, "operating-period-metadata", {
      message: "Catalog eligibility must describe CURROPER as a PEPS snapshot dated April 30, 2026, not as live status.",
      actual: manifest.selectionRules?.currentlyOperatingField || null,
    });
  }

  const unitIds = new Set();
  for (const college of colleges) {
    const unitId = Number(college.unitId);
    if (!Number.isInteger(unitId)) {
      fail(report, "dataset-unitid", {
        message: "A generated college has a missing or invalid UNITID.",
        slug: college.slug || null,
      });
      continue;
    }
    if (unitIds.has(unitId)) {
      fail(report, "duplicate-dataset-unitid", { unitId });
    }
    unitIds.add(unitId);
  }

  const manifestByUnitId = new Map();
  const manifestSlugs = new Set();
  for (const entry of catalogInstitutions) {
    const unitId = Number(entry.unitId);
    if (!Number.isInteger(unitId)) {
      fail(report, "manifest-unitid", {
        message: "A manifest entry has a missing or invalid UNITID.",
        expectedName: entry.expectedName || null,
      });
      continue;
    }
    if (manifestByUnitId.has(unitId)) {
      fail(report, "duplicate-manifest-unitid", { unitId });
    }
    manifestByUnitId.set(unitId, entry);
    if (typeof entry.slug !== "string" || !entry.slug.trim()) {
      fail(report, "manifest-slug", { unitId, message: "Missing catalog slug." });
    } else if (manifestSlugs.has(entry.slug)) {
      fail(report, "duplicate-manifest-slug", { slug: entry.slug });
    } else {
      manifestSlugs.add(entry.slug);
    }
  }

  const datasetByUnitId = new Map(
    colleges
      .filter((college) => Number.isInteger(Number(college.unitId)))
      .map((college) => [Number(college.unitId), college]),
  );
  for (const unitId of manifestByUnitId.keys()) {
    if (!datasetByUnitId.has(unitId)) {
      fail(report, "catalog-coverage", {
        unitId,
        message: "Reviewed manifest institution is absent from generated data.",
      });
    }
  }
  for (const unitId of datasetByUnitId.keys()) {
    if (!manifestByUnitId.has(unitId)) {
      fail(report, "catalog-coverage", {
        unitId,
        message: "Generated institution is absent from the reviewed manifest.",
      });
    }
  }
  const datasetSlugs = new Set();
  for (const college of colleges) {
    if (datasetSlugs.has(college.slug)) {
      fail(report, "duplicate-dataset-slug", { slug: college.slug || null });
    }
    datasetSlugs.add(college.slug);
  }

  const requestedFields = new Set([
    "UNITID",
    "INSTNM",
    "STABBR",
    "CONTROL",
    "OPEID",
    "OPEID6",
    "CITY",
    "INSTURL",
    "LOCALE",
    "MAIN",
    "NUMBRANCH",
    "CURROPER",
    ...((manifestSource.identityFields || []).filter((field) => typeof field === "string")),
    ...sourceFieldsFromPeriods(dataset.release),
  ]);
  for (const college of colleges) {
    for (const { observation } of observationEntries(college)) {
      if (observation.sourceId !== scorecardSourceId) continue;
      for (const part of sourceFieldParts(observation.sourceField)) {
        requestedFields.add(part);
      }
    }
    for (const major of college.majors || []) {
      if (major?.sourceId !== scorecardSourceId) continue;
      for (const part of sourceFieldParts(major.sourceField)) {
        requestedFields.add(part);
      }
    }
  }

  let matchingCsvEntries = 0;
  const zipContents = unzipSync(zipBytes, {
    filter: ({ name, originalSize }) => {
      const matches =
        name.endsWith("Most-Recent-Cohorts-Institution.csv") &&
        !name.startsWith("__MACOSX/");
      if (matches) {
        matchingCsvEntries += 1;
        if (originalSize > maximumCsvBytes) {
          throw new Error(`Institution CSV exceeds the ${maximumCsvBytes}-byte safety limit.`);
        }
        if (matchingCsvEntries > 1) {
          throw new Error("Archive contains more than one institution CSV.");
        }
      }
      return matches;
    },
  });
  const csvName = Object.keys(zipContents).find(
    (name) =>
      name.endsWith("Most-Recent-Cohorts-Institution.csv") &&
      !name.startsWith("__MACOSX/"),
  );
  if (!csvName || matchingCsvEntries !== 1) {
    throw new Error("Archive must contain exactly one Scorecard institution CSV.");
  }
  const csvBytes = zipContents[csvName];
  if (csvBytes.byteLength > maximumCsvBytes) {
    throw new Error(`Institution CSV exceeds the ${maximumCsvBytes}-byte safety limit.`);
  }
  const csvText = new TextDecoder("utf-8", { fatal: true }).decode(csvBytes);
  const records = csvRecords(csvText);
  const headerRecord = records.next();
  if (headerRecord.done || !Array.isArray(headerRecord.value)) {
    throw new Error("Institution CSV is empty or malformed.");
  }
  const headers = headerRecord.value;
  if (headers.length > 0) headers[0] = headers[0].replace(/^\uFEFF/, "");
  const headerIndexes = new Map();
  headers.forEach((header, index) => {
    if (headerIndexes.has(header)) {
      fail(report, "duplicate-csv-header", { header });
    } else {
      headerIndexes.set(header, index);
    }
  });
  for (const field of requestedFields) {
    if (!headerIndexes.has(field)) {
      fail(report, "missing-csv-field", { field });
    }
  }

  const selectedIndexes = new Set(
    [...requestedFields]
      .map((field) => headerIndexes.get(field))
      .filter((index) => Number.isInteger(index)),
  );
  const selectedUnitIds = new Set([
    ...manifestByUnitId.keys(),
    ...datasetByUnitId.keys(),
  ]);
  const csvRowsByUnitId = new Map();
  const officialEligibleUnitIds = new Set();
  const unitIndex = headerIndexes.get("UNITID");
  const incrementRosterCount = (dimension, value) => {
    const key = String(value);
    const counts = report.selection[dimension];
    counts[key] = (counts[key] || 0) + 1;
  };
  for (const row of csvRecords(csvText, selectedIndexes)) {
    const unitId = Number(row[unitIndex]);
    const sourceRow = Object.fromEntries(
      [...headerIndexes]
        .filter(([, index]) => selectedIndexes.has(index))
        .map(([field, index]) => [field, row[index]]),
    );
    if (eligibilityForScorecardRow(sourceRow)) {
      if (officialEligibleUnitIds.has(unitId)) {
        fail(report, "duplicate-eligible-source-unitid", { unitId });
      } else if (Number.isInteger(unitId)) {
        officialEligibleUnitIds.add(unitId);
        incrementRosterCount("sourceRowsByLevel", sourceRow.ICLEVEL);
        incrementRosterCount("sourceRowsByOwnership", sourceRow.CONTROL);
        incrementRosterCount("sourceRowsByPredominantDegree", sourceRow.PREDDEG);
        incrementRosterCount("sourceRowsByMain", sourceRow.MAIN);
        incrementRosterCount(
          "sourceRowsByJurisdiction",
          usJurisdictionCodes.has(sourceRow.STABBR)
            ? ["PR", "GU", "VI", "AS", "MP"].includes(sourceRow.STABBR)
              ? "territory"
              : "states-and-dc"
            : "outside-scope",
        );
      }
    }
    if (!selectedUnitIds.has(unitId)) continue;
    if (csvRowsByUnitId.has(unitId)) {
      fail(report, "duplicate-source-unitid", { unitId });
      continue;
    }
    csvRowsByUnitId.set(unitId, sourceRow);
  }
  report.counts.sourceRowsLoaded = csvRowsByUnitId.size;
  report.counts.officialEligibleSourceRows = officialEligibleUnitIds.size;
  for (const unitId of officialEligibleUnitIds) {
    if (!manifestByUnitId.has(unitId)) {
      fail(report, "official-roster-coverage", {
        unitId,
        message: "An eligible UNITID in the pinned Scorecard source is absent from the reviewed manifest.",
      });
    }
    if (!datasetByUnitId.has(unitId)) {
      fail(report, "official-roster-coverage", {
        unitId,
        message: "An eligible UNITID in the pinned Scorecard source is absent from generated data.",
      });
    }
  }
  for (const unitId of manifestByUnitId.keys()) {
    if (!officialEligibleUnitIds.has(unitId)) {
      fail(report, "official-roster-eligibility", {
        unitId,
        message: "Manifest includes a UNITID outside the reviewed federal undergraduate roster.",
      });
    }
  }
  for (const unitId of datasetByUnitId.keys()) {
    if (!officialEligibleUnitIds.has(unitId)) {
      fail(report, "official-roster-eligibility", {
        unitId,
        message: "Generated data includes a UNITID outside the reviewed federal undergraduate roster.",
      });
    }
  }

  function compareIdentity(unitId, entry, college, sourceRow) {
    if (!sourceRow) {
      fail(report, "missing-source-row", {
        unitId,
        message: "UNITID has no row in the pinned institution CSV.",
      });
      return;
    }
    report.counts.identitiesChecked += 1;
    const officialName = sourceRow.INSTNM || "";
    const nameMatches =
      officialName === entry?.expectedName ||
      (Array.isArray(entry?.aliases) && entry.aliases.includes(officialName));
    if (!nameMatches) {
      fail(report, "catalog-official-name", {
        unitId,
        officialName,
        expectedName: entry?.expectedName || null,
        aliases: entry?.aliases || [],
        message: "Official Scorecard name is not the reviewed catalog name or an explicit alias.",
      });
    }
    if (college) {
      if (college.name !== entry?.expectedName) {
        fail(report, "generated-name", {
          unitId,
          expected: entry?.expectedName || null,
          actual: college.name || null,
        });
      }
      if (college.slug !== entry?.slug) {
        fail(report, "generated-slug", {
          unitId,
          expected: entry?.slug || null,
          actual: college.slug || null,
        });
      }
    }
    if (entry?.state !== sourceRow.STABBR) {
      fail(report, "catalog-state", {
        unitId,
        official: sourceRow.STABBR || null,
        manifest: entry?.state || null,
      });
    }
    if (!eligibilityForScorecardRow(sourceRow)) {
      fail(report, "source-row-outside-roster", {
        unitId,
        source: {
          jurisdiction: sourceRow.STABBR || null,
          control: numberFromCsv(sourceRow.CONTROL),
          currentOperation: numberFromCsv(sourceRow.CURROPER),
          level: numberFromCsv(sourceRow.ICLEVEL),
          predominantDegree: numberFromCsv(sourceRow.PREDDEG),
        },
      });
    }
    if (college && college.state !== sourceRow.STABBR) {
      fail(report, "generated-state", {
        unitId,
        official: sourceRow.STABBR || null,
        generated: college.state || null,
      });
    }
    const sourceControl = numberFromCsv(sourceRow.CONTROL);
    if (Number(entry?.scorecardControl) !== sourceControl) {
      fail(report, "catalog-control", {
        unitId,
        official: sourceControl,
        manifest: entry?.scorecardControl ?? null,
      });
    }
    const ownership = ownershipLabels[sourceControl];
    if (!ownership) {
      fail(report, "unknown-control-code", {
        unitId,
        control: sourceControl,
        message: "The source control code is not one of the reviewed U.S. ownership categories.",
      });
    } else if (college && college.ownership !== ownership) {
      fail(report, "generated-ownership", {
        unitId,
        control: sourceControl,
        expected: ownership,
        actual: college.ownership || null,
      });
    }
    if (college && college.catalogCategory !== entry?.catalogCategory) {
      fail(report, "generated-catalog-category", {
        unitId,
        expected: entry?.catalogCategory || null,
        actual: college.catalogCategory || null,
      });
    }
    const sourceMain = numberFromCsv(sourceRow.MAIN);
    const sourceLevel = numberFromCsv(sourceRow.ICLEVEL);
    const sourceHighestDegree = numberFromCsv(sourceRow.HIGHDEG);
    const sourcePredominantDegree = numberFromCsv(sourceRow.PREDDEG);
    if (![0, 1].includes(sourceMain)) {
      fail(report, "source-main-code", {
        unitId,
        sourceValue: sourceRow.MAIN || null,
        message: "The source MAIN code must distinguish a main UNITID (1) from a branch UNITID (0).",
      });
    }
    for (const [attribute, sourceValue] of [
      ["scorecardMain", sourceMain],
      ["scorecardLevel", sourceLevel],
      ["scorecardHighestDegree", sourceHighestDegree],
      ["scorecardPredominantDegree", sourcePredominantDegree],
    ]) {
      if (Number(entry?.[attribute]) !== sourceValue) {
        fail(report, "catalog-source-attribute", {
          unitId,
          attribute,
          sourceValue,
          manifestValue: entry?.[attribute] ?? null,
        });
      }
    }
    if (college) {
      const expectedLevel = sourceLevel === 1 ? "Four-year" : sourceLevel === 2 ? "Two-year" : null;
      for (const [attribute, expected, actual] of [
        ["mainCampus", sourceMain === 1, college.mainCampus],
        ["institutionLevel", expectedLevel, college.institutionLevel],
        ["highestDegree", sourceHighestDegree, college.highestDegree],
        ["predominantDegree", sourcePredominantDegree, college.predominantDegree],
        ["undergraduateOffering", [1, 2, 3].includes(sourcePredominantDegree), college.undergraduateOffering],
        ["website", websiteFromScorecard(sourceRow.INSTURL), college.website],
        ["setting", settingFromLocale(sourceRow.LOCALE), college.setting],
      ]) {
        if (expected !== actual) {
          fail(report, `generated-${attribute}`, {
            unitId,
            sourceValue: attribute === "website" ? sourceRow.INSTURL || null : attribute === "setting" ? sourceRow.LOCALE || null : expected,
            expected,
            actual: actual ?? null,
          });
        }
      }
    }
    if (college && college.city !== sourceRow.CITY) {
      fail(report, "generated-city", {
        unitId,
        official: sourceRow.CITY || null,
        generated: college.city || null,
      });
    }
    if (college && college.opeId !== sourceRow.OPEID) {
      fail(report, "generated-opeid", {
        unitId,
        official: sourceRow.OPEID || null,
        generated: college.opeId || null,
      });
    }
    if (college && college.opeId6 !== sourceRow.OPEID6) {
      fail(report, "generated-opeid6", {
        unitId,
        official: sourceRow.OPEID6 || null,
        generated: college.opeId6 || null,
      });
    }
    const branches = numberFromCsv(sourceRow.NUMBRANCH);
    if (college && !sameNumber(college.branchCount ?? null, branches)) {
      fail(report, "generated-branch-count", {
        unitId,
        official: branches,
        generated: college.branchCount ?? null,
      });
    }
    if (college && college.currentlyOperating !== (numberFromCsv(sourceRow.CURROPER) === 1)) {
      fail(report, "generated-operating-status", {
        unitId,
        official: sourceRow.CURROPER || null,
        generated: college.currentlyOperating,
      });
    }
  }

  for (const [unitId, entry] of manifestByUnitId) {
    compareIdentity(unitId, entry, datasetByUnitId.get(unitId), csvRowsByUnitId.get(unitId));
  }
  for (const [unitId, college] of datasetByUnitId) {
    if (!manifestByUnitId.has(unitId)) {
      compareIdentity(unitId, null, college, csvRowsByUnitId.get(unitId));
    }
  }

  for (const college of colleges) {
    const unitId = Number(college.unitId);
    const sourceRow = csvRowsByUnitId.get(unitId);
    if (!sourceRow) continue;
    const graduation = college.observations?.graduationRate;
    if (graduation?.sourceId === scorecardSourceId) {
      report.counts.graduationPopulationChecks += 1;
      const isTwoYear = numberFromCsv(sourceRow.ICLEVEL) === 2;
      const expectedField = isTwoYear ? "C150_L4" : "C150_4";
      const expectedPeriod = isTwoYear
        ? dataset.release?.metricPeriods?.graduationRateLessThanFourYear
        : dataset.release?.metricPeriods?.graduationRate;
      const expectedStartYear = isTwoYear ? "Fall 2021" : "Fall 2018";
      const expectedAcademicYear = isTwoYear ? "2021-2022" : "2018-2019";
      if (
        graduation.sourceField !== expectedField ||
        graduation.reportingYear !== expectedPeriod?.reportingYear ||
        graduation.periodLabel !== expectedPeriod?.periodLabel ||
        !String(graduation.cohort || "").includes(expectedStartYear) ||
        !String(graduation.cohort || "").includes(expectedAcademicYear) ||
        !/within 150% of normal time/i.test(graduation.definition || "")
      ) {
        fail(report, "graduation-population", {
          unitId,
          institutionLevel: sourceRow.ICLEVEL,
          expectedSourceField: expectedField,
          actualSourceField: graduation.sourceField || null,
          expectedPeriodLabel: expectedPeriod?.periodLabel || null,
          actualPeriodLabel: graduation.periodLabel || null,
          cohort: graduation.cohort || null,
          message: "Completion source, reporting period, cohort, and 150%-of-normal-time definition must match the institution-level federal measure.",
        });
      }
    }
    for (const { collectionName, metric, observation } of observationEntries(college)) {
      if (observation.sourceId !== scorecardSourceId) {
        if (observation.sourceId) {
          report.counts.nonScorecardObservationsExcluded += 1;
          report.nonScorecardSourceCounts[observation.sourceId] =
            (report.nonScorecardSourceCounts[observation.sourceId] || 0) + 1;
        }
        continue;
      }
      if (collectionName === "observations") report.counts.primaryFederalObservations += 1;
      else report.counts.alternateFederalObservations += 1;
      if (typeof observation.value === "number") {
        report.counts.numericValueChecks += 1;
        if (metric === "averageNetPrice" && observation.value < 0) {
          report.counts.negativeAverageNetPriceValues += 1;
        } else if (
          observation.value < 0 ||
          (observation.unit === "ratio" && observation.value > 1) ||
          (observation.unit === "count" && !Number.isInteger(observation.value))
        ) {
          fail(report, "invalid-federal-number-domain", {
            unitId,
            collection: collectionName,
            metric,
            value: observation.value,
            unit: observation.unit || null,
            message: "Federal numeric observations must be nonnegative; ratios stay within 0–1 and counts are whole numbers. Negative average net price is permitted by the official Scorecard definition.",
          });
        }
      }
      const field = typeof observation.sourceField === "string" ? observation.sourceField.trim() : "";
      if (headerIndexes.has(field)) {
        report.counts.directValueChecks += 1;
        const raw = sourceRow[field];
        const actual = numberFromCsv(raw);
        report.counts[observation.value === null ? "unavailableValueChecks" : "numericValueChecks"] +=
          observation.value === null ? 1 : 0;
        if (!sameNumber(observation.value ?? null, actual)) {
          fail(report, "metric-value", {
            unitId,
            collection: collectionName,
            metric,
            sourceField: field,
            expected: observation.value ?? null,
            sourceValue: actual,
            sourceRaw: raw ?? null,
          });
        }
      } else if (knownDerivedSourceField(field)) {
        report.counts.notDirectFieldObservations += 1;
        report.notDirectFields.push({
          unitId,
          collection: collectionName,
          metric,
          sourceField: field,
          value: observation.value ?? null,
          reason: "Recognized as an explicitly labeled derived field; the sourceField text is a formula or formula description, not a CSV column.",
        });
      } else {
        report.counts.notDirectFieldObservations += 1;
        fail(report, "non-direct-source-field", {
          unitId,
          collection: collectionName,
          metric,
          sourceField: field || null,
          value: observation.value ?? null,
          message: "Scorecard-bound observation is not traceable to a direct CSV column or a recognized derived-field label.",
        });
      }
    }
  }

  const expectedMajorFields = [
    ...(dataset.release?.metricPeriods?.fieldEvidence?.sourceFields || []),
  ];
  const programGroups = [];
  if (expectedMajorFields.length % 3 !== 0) {
    fail(report, "major-field-registry", {
      message: "fieldEvidence.sourceFields must contain PCIPxx, CIPxxBACHL, CIPxxASSOC triplets.",
      sourceFields: expectedMajorFields,
    });
  }
  for (let index = 0; index + 2 < expectedMajorFields.length; index += 3) {
    const shareField = expectedMajorFields[index];
    const bachelorField = expectedMajorFields[index + 1];
    const associateField = expectedMajorFields[index + 2];
    const match = /^PCIP(\d{2})$/.exec(shareField);
    if (
      !match ||
      bachelorField !== `CIP${match[1]}BACHL` ||
      associateField !== `CIP${match[1]}ASSOC`
    ) {
      fail(report, "major-field-registry", {
        message: "fieldEvidence.sourceFields contains a mismatched broad-share / degree-availability triplet.",
        shareField,
        bachelorField,
        associateField,
      });
      continue;
    }
    programGroups.push({ shareField, bachelorField, associateField });
  }

  for (const college of colleges) {
    const unitId = Number(college.unitId);
    const sourceRow = csvRowsByUnitId.get(unitId);
    if (!sourceRow) continue;
    const majorsByShareField = new Map();
    for (const major of college.majors || []) {
      if (major?.sourceId !== scorecardSourceId) continue;
      const parts = sourceFieldParts(major.sourceField);
      const shareMatch = /^PCIP(\d{2})$/.exec(parts[0] || "");
      const availabilityFields = parts.slice(1);
      if (
        !shareMatch ||
        availabilityFields.length < 1 ||
        availabilityFields.some((field) => {
          const match = /^CIP(\d{2})(BACHL|ASSOC)$/.exec(field);
          return !match || match[1] !== shareMatch[1];
        })
      ) {
        fail(report, "major-source-field", {
          unitId,
          name: major.name || null,
          sourceField: major.sourceField || null,
          message: "Major evidence must identify one PCIPxx and one or both matching CIPxxBACHL/CIPxxASSOC indicators.",
        });
        continue;
      }
      if (majorsByShareField.has(parts[0])) {
        fail(report, "duplicate-major-evidence", {
          unitId,
          sourceField: major.sourceField,
        });
      }
      majorsByShareField.set(parts[0], major);
    }

    for (const { shareField, bachelorField, associateField } of programGroups) {
      const share = numberFromCsv(sourceRow[shareField]);
      const bachelorCode = numberFromCsv(sourceRow[bachelorField]);
      const associateCode = numberFromCsv(sourceRow[associateField]);
      const bachelorsAvailable = [1, 2].includes(bachelorCode);
      const associatesAvailable = [1, 2].includes(associateCode);
      if (bachelorsAvailable && associatesAvailable) {
        report.counts.dualDegreeAvailabilityPairs += 1;
      }
      for (const [availabilityField, code] of [
        [bachelorField, bachelorCode],
        [associateField, associateCode],
      ]) {
        if (code !== null && ![0, 1, 2].includes(code)) {
          fail(report, "major-availability-code", {
            unitId,
            shareField,
            availabilityField,
            availabilityCode: code,
            message: "CIP degree-level availability fields must use a documented 0, 1, or 2 value.",
          });
        }
      }
      if (share !== null && (share < 0 || share > 1)) {
        fail(report, "major-share-range", {
          unitId,
          shareField,
          share,
          message: "PCIP is a share of awards and must be between zero and one.",
        });
      }
      const expectedAvailabilityFields = [
        ...(bachelorsAvailable ? [bachelorField] : []),
        ...(associatesAvailable ? [associateField] : []),
      ];
      const expectedSourceField = [shareField, ...expectedAvailabilityFields].join(" + ");
      const shouldHaveMajor = expectedAvailabilityFields.length > 0 && share !== null && share >= 0;
      const major = majorsByShareField.get(shareField);
      if (!shouldHaveMajor && major) {
        fail(report, "major-availability", {
          unitId,
          shareField,
          share,
          bachelorCode,
          associateCode,
          message: "Generated broad field exists without an affirmative degree-level availability code and numeric award share.",
        });
      }
      if (shouldHaveMajor && !major) {
        fail(report, "major-coverage", {
          unitId,
          expectedSourceField,
          share,
          bachelorCode,
          associateCode,
          message: "An officially available broad associate or bachelor's field with a reported share is missing from generated evidence.",
        });
      }
      if (!major) continue;
      report.counts.majorFieldPairsChecked += 1;
      if (major.sourceField !== expectedSourceField) {
        fail(report, "major-source-field", {
          unitId,
          expected: expectedSourceField,
          actual: major.sourceField || null,
          message: "The source locator must include every affirmative degree-level indicator represented by this broad field.",
        });
      }
      if (!sameNumber(major.share ?? null, share)) {
        fail(report, "major-share", {
          unitId,
          sourceField: major.sourceField,
          expected: major.share ?? null,
          sourceValue: share,
          sourceRaw: sourceRow[shareField] ?? null,
        });
      }
      if (major.bachelorsAvailable !== bachelorsAvailable) {
        fail(report, "major-bachelors-availability", {
          unitId,
          sourceField: major.sourceField,
          availabilityCode: bachelorCode,
          expected: bachelorsAvailable,
          actual: major.bachelorsAvailable ?? null,
        });
      }
      if (major.associatesAvailable !== associatesAvailable) {
        fail(report, "major-associate-availability", {
          unitId,
          sourceField: major.sourceField,
          availabilityCode: associateCode,
          expected: associatesAvailable,
          actual: major.associatesAvailable ?? null,
        });
      }
      const expectedDegreeLevel =
        bachelorsAvailable && associatesAvailable
          ? "bachelors-and-associate"
          : bachelorsAvailable
            ? "bachelors"
            : "associate";
      if (major.degreeLevel !== expectedDegreeLevel) {
        fail(report, "major-degree-level", {
          unitId,
          sourceField: major.sourceField,
          expected: expectedDegreeLevel,
          actual: major.degreeLevel || null,
        });
      }
      const includesDistanceProgram =
        (bachelorsAvailable && bachelorCode === 2) ||
        (associatesAvailable && associateCode === 2);
      const expectedDelivery = includesDistanceProgram
        ? "includes-distance-program"
        : "delivery-not-specified";
      if (major.deliveryMode !== expectedDelivery) {
        fail(report, "major-delivery-mode", {
          unitId,
          sourceField: major.sourceField,
          bachelorCode,
          associateCode,
          expected: expectedDelivery,
          actual: major.deliveryMode || null,
          message: "Code 2 records at least one distance-only program in a broad field; it does not mean every program in that field is distance-learning.",
        });
      }
      const claim = `${major.evidence || ""} ${major.definition || ""}`;
      if (includesDistanceProgram) {
        if (
          !/includes a distance-learning program/i.test(major.evidence || "") ||
          !/at least one|one or more/i.test(major.definition || "") ||
          /exclusively|only\s+(online|distance)|all\s+(programs|offerings).{0,30}(online|distance)|entire\s+(field|group).{0,30}(online|distance)/i.test(claim)
        ) {
          fail(report, "overstated-distance-claim", {
            unitId,
            sourceField: major.sourceField,
            message: "Code 2 must be described as at least one distance-learning program, not as applying to the entire field.",
            evidence: major.evidence || null,
            definition: major.definition || null,
          });
        }
      } else if (/includes a distance-learning program/i.test(major.evidence || "")) {
        fail(report, "unsupported-distance-claim", {
          unitId,
          sourceField: major.sourceField,
          message: "No available degree-level field carries Scorecard's distance-learning code 2.",
        });
      }
    }
    for (const [shareField, major] of majorsByShareField) {
      if (!programGroups.some((group) => group.shareField === shareField)) {
        fail(report, "unregistered-major-field", {
          unitId,
          sourceField: major.sourceField,
          message: "Generated Scorecard field evidence is absent from release.metricPeriods.fieldEvidence.sourceFields.",
        });
      }
    }
  }

  report.counts.warnings = report.warnings.length;
  report.status = report.counts.errors === 0 ? "PASS" : "FAIL";
  report.summary = {
    archiveSha256,
    csvEntry: csvName,
    datasetCount: colleges.length,
    manifestCount: catalogInstitutions.length,
    eligibleFederalRosterCount: report.counts.officialEligibleSourceRows,
    rosterByLevel: report.selection.sourceRowsByLevel,
    rosterByOwnership: report.selection.sourceRowsByOwnership,
    rosterByMainBranch: report.selection.sourceRowsByMain,
    identitiesChecked: report.counts.identitiesChecked,
    directMetricComparisons: report.counts.directValueChecks,
    broadProgramComparisons: report.counts.majorFieldPairsChecked,
    dualDegreeAvailabilityPairs: report.counts.dualDegreeAvailabilityPairs,
    graduationPopulationChecks: report.counts.graduationPopulationChecks,
    negativeAverageNetPriceValues: report.counts.negativeAverageNetPriceValues,
    externalObservationsNotCompared: report.counts.nonScorecardObservationsExcluded,
    explicitNotDirectFields: report.counts.notDirectFieldObservations,
    errors: report.counts.errors,
  };

  if (options.report) {
    const reportPath = resolve(process.cwd(), options.report);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  process.stdout.write(`College Scorecard source-value audit: ${report.status}\n`);
  process.stdout.write(`Archive SHA-256: ${archiveSha256}\n`);
  process.stdout.write(`Generated colleges / reviewed manifest: ${colleges.length} / ${catalogInstitutions.length}\n`);
  process.stdout.write(`Exact eligible federal roster: ${report.counts.officialEligibleSourceRows} (${report.selection.sourceRowsByLevel["1"] || 0} four-year, ${report.selection.sourceRowsByLevel["2"] || 0} two-year; ${report.selection.sourceRowsByMain["1"] || 0} main, ${report.selection.sourceRowsByMain["0"] || 0} branch UNITIDs)\n`);
  process.stdout.write(`Campus identities checked: ${report.counts.identitiesChecked}\n`);
  process.stdout.write(`Direct observation checks: ${report.counts.directValueChecks} (${report.counts.numericValueChecks} numeric, ${report.counts.unavailableValueChecks} unavailable)\n`);
  process.stdout.write(`Broad program records checked: ${report.counts.majorFieldPairsChecked} (${report.counts.dualDegreeAvailabilityPairs} with both degree levels available)\n`);
  process.stdout.write(`Completion population checks: ${report.counts.graduationPopulationChecks}; negative average net-price values preserved: ${report.counts.negativeAverageNetPriceValues}\n`);
  process.stdout.write(`Non-Scorecard observations excluded from comparison: ${report.counts.nonScorecardObservationsExcluded}\n`);
  process.stdout.write(`Recognized not-direct fields documented: ${report.counts.notDirectFieldObservations}\n`);
  process.stdout.write(`Errors: ${report.counts.errors}\n`);
  for (const error of report.errors.slice(0, examplesLimit)) {
    process.stdout.write(`- [${error.category}] ${JSON.stringify(error)}\n`);
  }
  if (report.errors.length > examplesLimit) {
    process.stdout.write(`- … ${report.errors.length - examplesLimit} more; use --report for the full report.\n`);
  }
  if (options.report) process.stdout.write(`Full report: ${resolve(process.cwd(), options.report)}\n`);
  return report.status === "PASS" ? 0 : 1;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    process.stderr.write(`Source-value audit failed to run: ${error.message}\n`);
    process.exitCode = 2;
  });
