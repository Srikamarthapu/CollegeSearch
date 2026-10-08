import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { atomicWriteFile } from "./lib/atomic-write.mjs";

export const sourceArchiveUrl =
  "https://nces.ed.gov/ipeds/tablefiles/zipfiles/IPEDS_2024-25_Provisional.zip";
export const sourcePageUrl =
  "https://nces.ed.gov/ipeds/use-the-data/download-access-database";
export const dictionaryUrl =
  "https://nces.ed.gov/ipeds/tablefiles/tableDocs/IPEDS202425Tablesdoc.xlsx";
export const questionnaireUrl =
  "https://nces.ed.gov/ipeds/use-the-data/download-survey-material/2024/cost%20i/package_11_72.pdf";
export const sourceArchiveSha256 =
  "cd38e8b430184cdb9a7a6679b40e7480dbc41335e1596f7f14d300cc638e35f3";
export const sourceId = "ipeds-cost1-2024-provisional";

const publisher = "U.S. Department of Education";
const sourceName =
  "NCES IPEDS Cost I (COST1_2024), 2024-25 provisional release";
const databaseMemberName = "IPEDS202425.accdb";
const fields = {
  tuition: {
    inDistrict: ["TUITION1", "in-district", "annual-undergraduate-tuition-only-2024-25"],
    inState: ["TUITION2", "in-state", "annual-undergraduate-tuition-only-2024-25"],
    outOfState: ["TUITION3", "out-of-state", "annual-undergraduate-tuition-only-2024-25"],
  },
  fees: {
    inDistrict: ["FEE1", "in-district", "annual-undergraduate-required-fees-2024-25"],
    inState: ["FEE2", "in-state", "annual-undergraduate-required-fees-2024-25"],
    outOfState: ["FEE3", "out-of-state", "annual-undergraduate-required-fees-2024-25"],
  },
};
const responseStatusLabels = new Map([
  [1, "Response"],
  [2, "Partial respondent, imputed"],
  [4, "Nonrespondent, not imputed"],
  [5, "Nonrespondent, imputed"],
  [-2, "Not applicable"],
  [-9, "Not active"],
]);
const imputationMethodLabels = new Map([
  [1, "Carry forward"],
  [2, "Nearest neighbor"],
  [3, "Group median"],
  [-2, "Not applicable"],
]);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultArchivePath = resolve(repoRoot, "work/ipeds-cost1-2024/IPEDS_2024-25_Provisional.zip");
const defaultCatalogPath = resolve(repoRoot, "data/colleges.json");
const defaultOutputPath = resolve(repoRoot, "data/college-tuition.json");
const localIsoDate = () => new Date().toISOString().slice(0, 10);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isCipCode(value) {
  return typeof value === "string" && /^\d{2}\.\d{4}$/.test(value);
}

function assertUniqueIds(rows, label) {
  const seen = new Set();
  for (const row of rows) {
    const id = Number(row?.unitId ?? row?.UNITID);
    if (!Number.isInteger(id) || id < 1 || seen.has(id)) {
      throw new Error(label + " has a duplicate or invalid UNITID: " + (row?.unitId ?? row?.UNITID) + ".");
    }
    seen.add(id);
  }
}

function sourceResponse(flagsRow) {
  const statusCode = Number.isInteger(flagsRow?.STAT_COS1) ? flagsRow.STAT_COS1 : null;
  const imputationCode = Number.isInteger(flagsRow?.IMP_COS1) ? flagsRow.IMP_COS1 : null;
  return {
    statusCode,
    status: statusCode === null ? "not available" : responseStatusLabels.get(statusCode) ?? "unrecognized status",
    imputationMethodCode: imputationCode,
    imputationMethod: imputationCode === null ? "not available" : imputationMethodLabels.get(imputationCode) ?? "unrecognized method",
  };
}

function makeObservation({ field, value, type, missingReason, response, accessedOn }) {
  const [sourceField, label, comparabilityKey] = field;
  const definition = type === "tuition"
    ? "IPEDS " + label + " average undergraduate tuition for full-time students for the full academic year 2024-25. Tuition covers instructional services; separately reported required fees are excluded."
    : "IPEDS " + label + " required fees for full-time undergraduates for the full academic year 2024-25. Required fees are fixed charges outside tuition that apply to nearly all students.";
  const responseNote = response.statusCode === null || response.statusCode === 1
    ? ""
    : " Institution-level Cost I response status: " + response.status + " (code " + response.statusCode + "); imputation method: " + response.imputationMethod + " (code " + response.imputationMethodCode + "). The Access table does not expose field-specific imputation flags.";
  return {
    value,
    unit: "usd",
    reportingYear: 2024,
    periodLabel: "2024-25",
    finality: "provisional",
    comparabilityKey,
    sourceId,
    publisher,
    sourceName,
    sourceUrl: sourceArchiveUrl,
    accessedOn,
    sourceField,
    cohort: "All full-time undergraduate students at institutions reporting charges by academic year; residency category as specified.",
    definition: definition + (value === null ? " " + missingReason : responseNote),
    status: value === null ? "unavailable" : [2, 5].includes(response.statusCode) ? "derived" : "reported",
  };
}

export function buildCollegeTuitionDataset({
  catalogColleges,
  tuitionRows,
  flagsRows,
  accessedOn = localIsoDate(),
  archiveSha256 = sourceArchiveSha256,
  databaseSha256 = null,
}) {
  if (!Array.isArray(catalogColleges) || !Array.isArray(tuitionRows) || !Array.isArray(flagsRows)) {
    throw new Error("IPEDS tuition import needs catalog colleges, Cost I rows, and component flags.");
  }
  assertUniqueIds(catalogColleges, "Catalog");
  assertUniqueIds(tuitionRows, "COST1_2024");
  assertUniqueIds(flagsRows, "FLAGS2024");

  const costById = new Map(tuitionRows.map((row) => [Number(row.UNITID), row]));
  const flagsById = new Map(flagsRows.map((row) => [Number(row.UNITID), row]));
  const colleges = catalogColleges.map((college) => {
    const row = costById.get(college.unitId);
    const responseRow = flagsById.get(college.unitId);
    const response = sourceResponse(responseRow);
    const hasAnnualValue = Object.values(fields).some((group) =>
      Object.values(group).some(([sourceField]) => numberOrNull(row?.[sourceField]) !== null),
    );
    const hasProgramCode = isCipCode(row?.CIPCODE1);
    const pricingBasis = !row ? "not-in-release" : hasAnnualValue ? "academic-year" : hasProgramCode ? "program" : "unknown";
    const evidenceStatus = !row
      ? "no-source-record"
      : hasAnnualValue && [2, 5].includes(response.statusCode)
        ? "institution-level-imputation"
        : hasAnnualValue
          ? "reported"
          : hasProgramCode
            ? "program-based-no-annual-rate"
            : "annual-rate-unavailable";
    const missingReason = !row
      ? "No matching UNITID record exists in the 2024-25 COST1 archive; no value was inferred."
      : hasProgramCode && !hasAnnualValue
        ? "This institution reports its published charges by program (CIPCODE1 " + row.CIPCODE1 + "); those program charges are not an annual academic-year tuition rate, so no annual value is inferred."
        : "The annual academic-year field is blank or unavailable in the source record; no value was inferred.";
    const record = {
      unitId: college.unitId,
      name: college.name,
      institutionUrl: "https://nces.ed.gov/collegenavigator/?id=" + college.unitId,
      sourceRecordPresent: Boolean(row),
      pricingBasis,
      evidenceStatus,
      sourceResponse: response,
      tuition: {},
      fees: {},
    };
    if (hasProgramCode) record.programPricingCipCode = row.CIPCODE1;

    for (const type of ["tuition", "fees"]) {
      for (const [residency, field] of Object.entries(fields[type])) {
        const value = numberOrNull(row?.[field[0]]);
        record[type][residency] = makeObservation({
          field,
          value,
          type,
          missingReason,
          response,
          accessedOn,
        });
      }
    }
    return record;
  });

  const coverage = {
    catalogCollegeCount: catalogColleges.length,
    matchedArchiveRowCount: colleges.filter((college) => college.sourceRecordPresent).length,
    missingArchiveRowCount: colleges.filter((college) => !college.sourceRecordPresent).length,
    academicYearPriceCollegeCount: colleges.filter((college) => college.pricingBasis === "academic-year").length,
    programBasedWithoutAnnualPriceCount: colleges.filter((college) => college.pricingBasis === "program").length,
    annualPriceUnavailableCount: colleges.filter((college) => college.pricingBasis === "unknown").length,
    institutionLevelImputationCount: colleges.filter((college) => college.evidenceStatus === "institution-level-imputation").length,
    observationValueCounts: Object.fromEntries(
      Object.values(fields).flatMap((group) =>
        Object.values(group).map(([sourceField]) => [
          sourceField,
          colleges.filter((college) =>
            [...Object.values(college.tuition), ...Object.values(college.fees)]
              .some((item) => item.sourceField === sourceField && item.value !== null),
          ).length,
        ]),
      ),
    ),
  };

  return {
    release: {
      id: sourceId,
      publisher,
      sourceName,
      sourceUrl: sourceArchiveUrl,
      sourcePage: sourcePageUrl,
      dictionaryUrl,
      questionnaireUrl,
      sourceArchiveUrl,
      archiveSha256,
      archiveMemberName: databaseMemberName,
      archiveMemberSha256: databaseSha256,
      accessedOn,
      reportingYear: 2024,
      periodLabel: "2024-25",
      finality: "provisional",
      sourceFields: ["TUITION1", "FEE1", "TUITION2", "FEE2", "TUITION3", "FEE3"],
      notes: "IPEDS Cost I reports tuition and required fees in separate fields. These six academic-year fields are for full-time undergraduate students for the full 2024-25 academic year. COST1_2024 also contains program-priced charges; those are not used as annual tuition. NCES marks this database release provisional and notes that nonrespondent data may be imputed.",
    },
    coverage,
    colleges,
  };
}

function parseArguments(argv) {
  const options = {
    archive: defaultArchivePath,
    catalog: defaultCatalogPath,
    output: defaultOutputPath,
    accessedOn: process.env.SOURCE_ACCESSED_ON || localIsoDate(),
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (["--archive", "--catalog", "--output", "--accessed-on"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(argument + " requires a value.");
      const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error("Unknown option: " + argument);
  }
  return options;
}

function printHelp() {
  process.stdout.write(
    "Import separate tuition and required-fee fields from the official 2024-25 IPEDS Access database.\n\n" +
    "Usage: node scripts/import-ipeds-tuition.mjs [options]\n\n" +
    "Options:\n" +
    "  --archive PATH       Official Access ZIP cache (downloaded when absent)\n" +
    "  --catalog PATH       Catalog JSON (default: data/colleges.json)\n" +
    "  --output PATH        Output JSON (default: data/college-tuition.json)\n" +
    "  --accessed-on DATE   ISO date recorded in the observations\n\n" +
    "The archive parser uses optional package mdb-reader. Install it outside the project and set NODE_PATH if needed. The importer pins the official archive SHA-256 so a changed source must be reviewed before refresh.\n",
  );
}

async function loadArchiveBytes(archivePath) {
  try {
    return await readFile(archivePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const response = await fetch(sourceArchiveUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error("IPEDS source archive download failed: HTTP " + response.status + ".");
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(archivePath), { recursive: true });
  await atomicWriteFile(archivePath, bytes);
  return bytes;
}

function extractSourceRows(archiveBytes) {
  const actualHash = sha256(archiveBytes);
  if (actualHash !== sourceArchiveSha256) {
    throw new Error("IPEDS Access archive SHA-256 mismatch: expected " + sourceArchiveSha256 + ", got " + actualHash + ". Review the NCES release before updating the pin.");
  }
  const entries = unzipSync(archiveBytes, {
    filter: ({ name }) => name === databaseMemberName,
  });
  const databaseBytes = entries[databaseMemberName];
  if (!databaseBytes) throw new Error("Official Access archive is missing " + databaseMemberName + ".");

  const require = createRequire(import.meta.url);
  let MDBReader;
  try {
    const loaded = require("mdb-reader");
    MDBReader = loaded.default ?? loaded;
  } catch {
    throw new Error("The optional Access reader is unavailable. Install it outside the project (npm install --prefix /tmp/ipeds-reader --no-save mdb-reader) and run with NODE_PATH=/tmp/ipeds-reader/node_modules.");
  }
  const buffer = Buffer.from(databaseBytes.buffer, databaseBytes.byteOffset, databaseBytes.byteLength);
  const reader = new MDBReader(buffer);
  const tableNames = reader.getTableNames();
  if (!tableNames.includes("Cost1_2024") || !tableNames.includes("FLAGS2024")) {
    throw new Error("The Access archive is missing Cost1_2024 or FLAGS2024 tables.");
  }
  return {
    costRows: reader.getTable("Cost1_2024").getData(),
    flagsRows: reader.getTable("FLAGS2024").getData(),
    archiveSha256: actualHash,
    databaseSha256: sha256(databaseBytes),
  };
}

export async function runImporter(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    printHelp();
    return null;
  }
  const resolved = (path) => isAbsolute(path) ? path : resolve(repoRoot, path);
  const [archiveBytes, catalogText] = await Promise.all([
    loadArchiveBytes(resolved(options.archive)),
    readFile(resolved(options.catalog), "utf8"),
  ]);
  const catalog = JSON.parse(catalogText);
  if (!Array.isArray(catalog.colleges)) throw new Error("Catalog JSON is missing its colleges array.");
  const { costRows, flagsRows, archiveSha256, databaseSha256 } = extractSourceRows(archiveBytes);
  const dataset = buildCollegeTuitionDataset({
    catalogColleges: catalog.colleges,
    tuitionRows: costRows,
    flagsRows,
    accessedOn: options.accessedOn,
    archiveSha256,
    databaseSha256,
  });
  const outputPath = resolved(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await atomicWriteFile(outputPath, JSON.stringify(dataset, null, 2) + "\n");
  process.stdout.write(JSON.stringify(dataset.coverage) + "\n");
  return dataset;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runImporter().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
