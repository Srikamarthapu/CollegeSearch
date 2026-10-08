import { broadFieldDefinitions } from "../app/lib/broad-fields.ts";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readScorecardArchive } from "./lib/scorecard-archive.mjs";
import { atomicWriteFile } from "./lib/atomic-write.mjs";
import { cohortUnitIdSet, cohortUnitIds } from "./lib/college-cohort.mjs";
import {
  assertCollegeMatchesCatalog,
  assertScorecardRowMatchesCatalog,
  collegeCatalogByUnitId,
  collegeCatalogSource,
} from "./lib/college-catalog.mjs";
import { geographyForJurisdiction } from "./lib/us-census-regions.mjs";
import {
  resolveInstitutionOverlayObservationSourceId,
  validateInstitutionOverlays,
} from "./lib/institution-overlays.mjs";
import { fetchWithTimeout, readResponseBytes } from "./lib/limited-response.mjs";

const programFields = Object.fromEntries(broadFieldDefinitions.map(({ code, name }) => [name, {
  shareField: `PCIP${code}`, bachelorField: `CIP${code}BACHL`,
}]));

const scorecardArtifactUrl =
  process.env.SCORECARD_INSTITUTION_ZIP_URL ||
  collegeCatalogSource.artifactUrl;
const scorecardLandingUrl = "https://collegescorecard.ed.gov/data/";
const scorecardDictionaryUrl =
  "https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx";
const scorecardDocumentationUrl =
  "https://collegescorecard.ed.gov/files/InstitutionDataDocumentation.pdf";

const federalMetricPeriods = {
  admissions: {
    reportingYear: 2024,
    periodLabel: "Fall 2024",
    revisionStatus: "provisional",
    sourceFields: ["ADM_RATE"],
  },
  undergraduateEnrollment: {
    reportingYear: 2024,
    periodLabel: "Fall 2024",
    revisionStatus: "provisional",
    sourceFields: ["UGDS"],
  },
  averageNetPrice: {
    reportingYear: 2024,
    periodLabel: "2023-2024 aid cohort",
    revisionStatus: "provisional",
    sourceFields: ["NPT4_PUB", "NPT4_PRIV"],
  },
  graduationRate: {
    reportingYear: 2024,
    periodLabel: "Fall 2018 entering cohort",
    revisionStatus: "provisional",
    sourceFields: ["C150_4"],
  },
  graduationRateLessThanFourYear: {
    reportingYear: 2024,
    periodLabel: "Fall 2021 entering cohort",
    revisionStatus: "provisional",
    sourceFields: ["C150_L4"],
  },
  medianEarnings: {
    reportingYear: 2023,
    periodLabel: "2022-23 earnings",
    revisionStatus: "snapshot",
    sourceFields: ["MD_EARN_WNE_4YR"],
  },
  tuitionAndFees: {
    reportingYear: 2024,
    periodLabel: "2024-2025",
    revisionStatus: "provisional",
    sourceFields: ["TUITIONFEE_IN", "TUITIONFEE_OUT"],
  },
  fieldEvidence: {
    reportingYear: 2025,
    periodLabel: "2024-2025 programs and awards",
    revisionStatus: "provisional",
    sourceFields: Object.values(programFields).flatMap(
      ({ shareField, bachelorField }) => [shareField, bachelorField, bachelorField.replace("BACHL", "ASSOC")],
    ),
  },
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultDataDirectory = resolve(scriptDirectory, "../data");
const dataInputDirectory = process.env.DATA_INPUT_DIR
  ? resolve(process.env.DATA_INPUT_DIR)
  : defaultDataDirectory;
const dataOutputDirectory = process.env.DATA_OUTPUT_DIR
  ? resolve(process.env.DATA_OUTPUT_DIR)
  : defaultDataDirectory;
const localIsoDate = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};
const accessedOn = process.env.SOURCE_ACCESSED_ON || localIsoDate();
const ucFinalizedDataset = JSON.parse(
  await readFile(
    resolve(dataInputDirectory, "uc-admissions-2025.json"),
    "utf8",
  ),
);
const ucHeadlineDataset = JSON.parse(
  await readFile(
    resolve(dataInputDirectory, "uc-admissions-latest.json"),
    "utf8",
  ),
);
const institutionOverlays = JSON.parse(
  await readFile(
    process.env.INSTITUTION_OVERLAYS_PATH
      ? resolve(process.env.INSTITUTION_OVERLAYS_PATH)
      : resolve(defaultDataDirectory, "institution-overlays.json"),
    "utf8",
  ),
);
validateInstitutionOverlays(institutionOverlays);
for (const overlay of institutionOverlays.colleges) {
  if (!cohortUnitIdSet.has(overlay.unitId)) {
    throw new Error(
      `Institution overlay UNITID ${overlay.unitId} is outside the published cohort.`,
    );
  }
}
const ucHeadlineByUnitId = new Map(
  ucHeadlineDataset.campuses.map((campus) => [campus.unitId, campus]),
);
const ucFinalizedByUnitId = new Map(
  ucFinalizedDataset.campuses.map((campus) => [campus.unitId, campus]),
);
const overlaySourcesById = new Map(
  institutionOverlays.sources.map((source) => [source.id, source]),
);
const overlaysByUnitId = new Map(
  institutionOverlays.colleges.map((college) => [college.unitId, college]),
);

let federalSource;

function observation({
  value,
  unit,
  reportingYear,
  periodLabel,
  finality = "finalized",
  comparabilityKey,
  sourceField,
  cohort,
  definition,
  status,
  source = federalSource,
}) {
  return {
    value: Number.isFinite(value) ? value : null,
    unit,
    reportingYear,
    periodLabel: periodLabel || String(reportingYear),
    finality,
    comparabilityKey: comparabilityKey || sourceField,
    sourceId: source.id,
    publisher: source.publisher,
    sourceName: source.sourceName,
    sourceUrl: source.sourcePage || source.sourceUrl,
    accessedOn: source.accessedOn,
    sourceField,
    cohort,
    definition,
    status:
      status || (Number.isFinite(value) ? "reported" : "unavailable"),
  };
}

const field = (row, key) => row[key] ?? null;

function numericField(row, key) {
  const value = row[key];
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "NA" ||
    value === "NULL" ||
    value === "PrivacySuppressed"
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadScorecardRows() {
  let zipBytes;
  if (process.env.SCORECARD_ARCHIVE_PATH) {
    zipBytes = await readFile(resolve(process.env.SCORECARD_ARCHIVE_PATH));
  } else {
    const response = await fetchWithTimeout(scorecardArtifactUrl, 60_000);
    if (!response.ok) throw new Error(`College Scorecard download failed (${response.status}).`);
    zipBytes = await readResponseBytes(response, 250 * 1024 * 1024, "College Scorecard archive");
  }
  const fields = ["UNITID", "OPEID", "OPEID6", "INSTNM", "ALIAS", "CITY", "STABBR", "CONTROL", "INSTURL", "LOCALE",
    "MAIN", "NUMBRANCH", "CURROPER", "HIGHDEG", "PREDDEG", "ICLEVEL", "ADM_RATE", "UGDS", "NPT4_PUB", "NPT4_PRIV",
    "C150_4", "C150_L4", "MD_EARN_WNE_4YR", "MD_EARN_WNE_P10", "TUITIONFEE_IN", "TUITIONFEE_OUT",
    ...Object.values(programFields).flatMap(({ shareField, bachelorField }) => [shareField, bachelorField, bachelorField.replace("BACHL", "ASSOC")])];
  const { rows: allRows, sha256 } = readScorecardArchive(zipBytes, collegeCatalogSource.artifactSha256, fields);
  const rows = allRows.filter(row => cohortUnitIdSet.has(Number(row.UNITID)));
  if (rows.length !== cohortUnitIds.length) throw new Error("Scorecard rows do not match the reviewed catalog.");
  for (const row of rows) assertScorecardRowMatchesCatalog(row);
  return { rows, artifactSha256: sha256 };
}

function normalizeWebsite(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function ownershipLabel(value) {
  return value === 1
    ? "Public"
    : value === 2
      ? "Private nonprofit"
      : "Private for-profit";
}

function settingLabel(locale) {
  if (locale >= 11 && locale <= 13) return "City";
  if (locale >= 21 && locale <= 23) return "Suburb";
  if (locale >= 31 && locale <= 33) return "Town";
  if (locale >= 41 && locale <= 43) return "Rural";
  return "Setting unavailable";
}

const scorecardSnapshot = await loadScorecardRows();
federalSource = {
  id: `college-scorecard-institution-${collegeCatalogSource.releaseDate}`,
  publisher: "U.S. Department of Education",
  sourceName: `College Scorecard — ${collegeCatalogSource.releaseDate} institution release`,
  sourceUrl: scorecardLandingUrl,
  sourceUrls: [scorecardArtifactUrl, scorecardDictionaryUrl, scorecardDocumentationUrl],
  artifactUrl: scorecardArtifactUrl,
  artifactSha256: scorecardSnapshot.artifactSha256,
  releaseDate: collegeCatalogSource.releaseDate,
  accessedOn,
  notes:
    `This published ${collegeCatalogSource.releaseDate} artifact combines metrics with different reporting lags and revision states. IPEDS 2024-2025 admissions, enrollment, tuition, and program fields remain provisional; every observation retains its exact period and revision state. TUITIONFEE_IN is the federal in-district tuition-and-fees field and may differ from a college's in-state resident price. Institution-level field definitions follow the linked September 2025 technical documentation.`,
  publicationStatus: "published",
  revisionStatus: "mixed",
};

const colleges = scorecardSnapshot.rows
  .map((row) => {
    const unitId = Number(row.UNITID);
    const manifestEntry = collegeCatalogByUnitId.get(unitId);
    const ucAdmission = ucHeadlineByUnitId.get(unitId);
    const ucFinalizedAdmission = ucFinalizedByUnitId.get(unitId);
    const ucHeadlineSource = ucAdmission
      ? { ...ucHeadlineDataset.release, sourcePage: ucAdmission.sourceUrl }
      : null;
    const federalAdmitRate = numericField(row, "ADM_RATE");
    const federalAdmitObservation = observation({
      value: federalAdmitRate,
      unit: "ratio",
      reportingYear: federalMetricPeriods.admissions.reportingYear,
      periodLabel: federalMetricPeriods.admissions.periodLabel,
      finality: federalMetricPeriods.admissions.revisionStatus,
      comparabilityKey: "admissions.undergraduate.overall.rate",
      sourceField: "ADM_RATE",
      cohort: "IPEDS Fall 2024 admissions collection",
      definition:
        "Admitted first-time, degree/certificate-seeking undergraduate applicants divided by applicants in that same IPEDS admissions population.",
    });
    const primaryAdmitObservation = ucAdmission
      ? observation({
          value: ucAdmission.admitRate,
          unit: "ratio",
          reportingYear: ucAdmission.fall,
          periodLabel: `Fall ${ucAdmission.fall} preliminary`,
          finality: ucHeadlineDataset.release.finality,
          comparabilityKey: "admissions.first-year.rate",
          sourceField: ucHeadlineDataset.release.sourceField,
          cohort: ucHeadlineDataset.release.cohort,
          definition:
            "Fall freshman admits divided by fall freshman applicants for this UC campus.",
          status: "derived",
          source: ucHeadlineSource,
        })
      : federalAdmitObservation;
    const majors = Object.entries(programFields)
      .map(([name, { shareField, bachelorField }]) => {
        const associateField = bachelorField.replace("BACHL", "ASSOC");
        const bachelorCode = numericField(row, bachelorField);
        const associateCode = numericField(row, associateField);
        const hasBachelor = [1, 2].includes(bachelorCode);
        const hasAssociate = [1, 2].includes(associateCode);
        const selectedFields = [hasBachelor ? bachelorField : null, hasAssociate ? associateField : null].filter(Boolean);
        const degreeLevel = hasBachelor && hasAssociate ? "bachelors-and-associate" : hasBachelor ? "bachelors" : "associate";
        const degreeLabel = degreeLevel === "bachelors-and-associate" ? "bachelor's and associate" : degreeLevel === "bachelors" ? "bachelor's" : "associate";
        const includesDistanceProgram = (hasBachelor && bachelorCode === 2) || (hasAssociate && associateCode === 2);
        return {
          name,
          share: numericField(row, shareField),
          degreeLevel,
          evidence: `Broad federal ${degreeLabel} field${includesDistanceProgram ? " · includes a distance-learning program" : ""}`,
          reportingYear: federalMetricPeriods.fieldEvidence.reportingYear,
          periodLabel: federalMetricPeriods.fieldEvidence.periodLabel,
          finality: federalMetricPeriods.fieldEvidence.revisionStatus,
          sourceId: federalSource.id,
          sourceField: [shareField, ...selectedFields].join(" + "),
          cohort:
            `IPEDS 2024-2025 awards; ${degreeLabel} program availability reported for the broad CIP family`,
          definition: includesDistanceProgram
            ? `The federal indicator confirms program availability at ${degreeLabel} level in this broad field. At least one reported program at these levels can be completed through distance education. It does not show that every program in the broad field is online or whether campus options are also available. The percentage is this field's share of all institution-wide awards, not a major-specific admission rate.`
            : `The federal indicator confirms program availability at ${degreeLabel} level in this broad field. It does not establish delivery mode. The percentage is this field's share of all institution-wide awards, not a major-specific admission rate.`,
          bachelorsAvailable: hasBachelor,
          associatesAvailable: hasAssociate,
          deliveryMode: includesDistanceProgram
            ? "includes-distance-program"
            : "delivery-not-specified",
        };
      })
      .filter(
        (major) =>
          (major.bachelorsAvailable || major.associatesAvailable) &&
          typeof major.share === "number" &&
          major.share >= 0,
      );

    return {
      unitId,
      opeId: field(row, "OPEID"),
      opeId6: field(row, "OPEID6"),
      mainCampus: numericField(row, "MAIN") === 1,
      branchCount: numericField(row, "NUMBRANCH"),
      currentlyOperating: numericField(row, "CURROPER") === 1,
      institutionLevel: numericField(row, "ICLEVEL") === 1 ? "Four-year" : "Two-year",
      highestDegree: numericField(row, "HIGHDEG"),
      predominantDegree: numericField(row, "PREDDEG"),
      undergraduateOffering: [1, 2, 3].includes(numericField(row, "PREDDEG")),
      slug: manifestEntry.slug,
      name: manifestEntry.expectedName,
      aliases: [...manifestEntry.aliases],
      city: field(row, "CITY"),
      state: field(row, "STABBR"),
      region: geographyForJurisdiction(field(row, "STABBR")),
      ownership: ownershipLabel(numericField(row, "CONTROL")),
      catalogCategory: manifestEntry.catalogCategory,
      inclusionReason: manifestEntry.inclusionReason,
      setting: settingLabel(numericField(row, "LOCALE")),
      website: normalizeWebsite(field(row, "INSTURL")),
      observations: {
        admitRate: primaryAdmitObservation,
        applicants: ucAdmission
          ? observation({
              value: ucAdmission.applicants,
              unit: "count",
              reportingYear: ucAdmission.fall,
              periodLabel: `Fall ${ucAdmission.fall} preliminary`,
              finality: ucHeadlineDataset.release.finality,
              comparabilityKey: "admissions.first-year.applicants",
              sourceField: "Fall Applicants",
              cohort: ucHeadlineDataset.release.cohort,
              definition:
                "Applications submitted to this UC campus for fall freshman admission.",
              source: ucHeadlineSource,
            })
          : null,
        admits: ucAdmission
          ? observation({
              value: ucAdmission.admits,
              unit: "count",
              reportingYear: ucAdmission.fall,
              periodLabel: `Fall ${ucAdmission.fall} preliminary`,
              finality: ucHeadlineDataset.release.finality,
              comparabilityKey: "admissions.first-year.admits",
              sourceField: "Fall Admits",
              cohort: ucHeadlineDataset.release.cohort,
              definition:
                "Applicants admitted to this UC campus for fall freshman admission.",
              source: ucHeadlineSource,
            })
          : null,
        enrollees: ucFinalizedAdmission
          ? observation({
              value: ucFinalizedAdmission.enrollees,
              unit: "count",
              reportingYear: ucFinalizedAdmission.fall,
              periodLabel: `Fall ${ucFinalizedAdmission.fall} finalized`,
              finality: "finalized",
              comparabilityKey: "admissions.first-year.enrollees",
              sourceField: "Fall Enrollees",
              cohort: ucFinalizedDataset.release.cohort,
              definition:
                "Admitted fall freshman applicants who enrolled at this UC campus.",
              source: ucFinalizedDataset.release,
            })
          : null,
        yieldRate: ucFinalizedAdmission
          ? observation({
              value: ucFinalizedAdmission.yieldRate,
              unit: "ratio",
              reportingYear: ucFinalizedAdmission.fall,
              periodLabel: `Fall ${ucFinalizedAdmission.fall} finalized`,
              finality: "finalized",
              comparabilityKey: "admissions.first-year.yield",
              sourceField:
                "Derived yield rate: Fall Enrollees divided by Fall Admits",
              cohort: ucFinalizedDataset.release.cohort,
              definition:
                "Fall freshman enrollees divided by fall freshman admits for this UC campus.",
              status: "derived",
              source: ucFinalizedDataset.release,
            })
          : null,
        undergraduateEnrollment: observation({
          value: numericField(row, "UGDS"),
          unit: "count",
          reportingYear:
            federalMetricPeriods.undergraduateEnrollment.reportingYear,
          periodLabel:
            federalMetricPeriods.undergraduateEnrollment.periodLabel,
          finality:
            federalMetricPeriods.undergraduateEnrollment.revisionStatus,
          comparabilityKey:
            "undergraduate-enrollment.degree-certificate-seeking",
          sourceField: "UGDS",
          cohort:
            "IPEDS Fall 2024 certificate/degree-seeking undergraduate enrollment",
          definition:
            "Certificate- or degree-seeking undergraduate enrollment reported at the fall census date.",
        }),
        averageNetPrice: observation({
          value:
            numericField(row, "NPT4_PUB") ?? numericField(row, "NPT4_PRIV"),
          unit: "usd",
          reportingYear: federalMetricPeriods.averageNetPrice.reportingYear,
          periodLabel: federalMetricPeriods.averageNetPrice.periodLabel,
          finality: federalMetricPeriods.averageNetPrice.revisionStatus,
          comparabilityKey: "net-price.title-iv.overall",
          sourceField:
            numericField(row, "NPT4_PUB") !== null ? "NPT4_PUB" : "NPT4_PRIV",
          cohort:
            numericField(row, "NPT4_PUB") !== null
              ? "Academic year 2023-2024 first-time, full-time, degree/certificate-seeking in-state students receiving Title IV aid"
              : "Academic year 2023-2024 first-time, full-time, degree/certificate-seeking students receiving Title IV aid",
          definition:
            "Average annual net price after grants and scholarships for the exact reported federal cohort. A negative value means average grant/scholarship aid exceeded the cost of attendance for this group; it is not a promise of free attendance or individual aid.",
        }),
        graduationRate: observation({
          value: numericField(row, Number(row.ICLEVEL) === 2 ? "C150_L4" : "C150_4"),
          unit: "ratio",
          reportingYear: federalMetricPeriods.graduationRate.reportingYear,
          periodLabel: Number(row.ICLEVEL) === 2 ? federalMetricPeriods.graduationRateLessThanFourYear.periodLabel : federalMetricPeriods.graduationRate.periodLabel,
          finality: federalMetricPeriods.graduationRate.revisionStatus,
          comparabilityKey: Number(row.ICLEVEL) === 2 ? "completion.less-than-four-year-institution.150-percent" : "completion.four-year-institution.150-percent",
          sourceField: Number(row.ICLEVEL) === 2 ? "C150_L4" : "C150_4",
          cohort:
            Number(row.ICLEVEL) === 2 ? "Fall 2021 or academic-year 2021-2022 first-time, full-time degree/certificate-seeking cohort" : "Fall 2018 or academic-year 2018-2019 first-time, full-time degree/certificate-seeking cohort",
          definition:
            Number(row.ICLEVEL) === 2 ? "Share completing a degree or certificate at a less-than-four-year institution within 150% of normal time; usually three years for associate degrees, varying by certificate program length. Not the six-year bachelor's completion measure." : "Share completing a degree or certificate at a four-year institution within 150% of normal time.",
        }),
        medianEarnings: observation({
          value: numericField(row, "MD_EARN_WNE_4YR"),
          unit: "usd",
          reportingYear: federalMetricPeriods.medianEarnings.reportingYear,
          periodLabel: federalMetricPeriods.medianEarnings.periodLabel,
          finality: federalMetricPeriods.medianEarnings.revisionStatus,
          comparabilityKey: "earnings.median.4-years-after-completion",
          sourceField: "MD_EARN_WNE_4YR",
          cohort:
            "2017-18 and 2018-19 completers, measured four years after completion",
          definition:
            "Median earnings four years after completion for the pooled federal completer cohort, measured in 2022-23 and inflation-adjusted to 2024 dollars. Federal earnings may cover multiple campuses in the same OPEID6 reporting group; they are not necessarily campus-only outcomes.",
        }),
        tuitionInState: observation({
          value: numericField(row, "TUITIONFEE_IN"),
          unit: "usd",
          reportingYear: federalMetricPeriods.tuitionAndFees.reportingYear,
          periodLabel: federalMetricPeriods.tuitionAndFees.periodLabel,
          finality: federalMetricPeriods.tuitionAndFees.revisionStatus,
          comparabilityKey: "tuition-fees.in-district",
          sourceField: "TUITIONFEE_IN",
          cohort: "Academic year 2024-2025 published in-district tuition and required fees",
          definition:
            "Published in-district tuition and required fees. College Scorecard documentation warns that some institutions have a different in-state resident price that this federal field does not reflect.",
        }),
        tuitionOutOfState: observation({
          value: numericField(row, "TUITIONFEE_OUT"),
          unit: "usd",
          reportingYear: federalMetricPeriods.tuitionAndFees.reportingYear,
          periodLabel: federalMetricPeriods.tuitionAndFees.periodLabel,
          finality: federalMetricPeriods.tuitionAndFees.revisionStatus,
          comparabilityKey: "tuition-fees.out-of-state",
          sourceField: "TUITIONFEE_OUT",
          cohort: "Academic year 2024-2025 published institutional price",
          definition: "Published out-of-state tuition and required fees.",
        }),
      },
      alternateObservations: {
        ...(ucAdmission ? { admitRate: federalAdmitObservation } : {}),
        medianEarnings: observation({
          value: numericField(row, "MD_EARN_WNE_P10"),
          unit: "usd",
          reportingYear: 2020,
          periodLabel: "Measured 2020-2021",
          finality: "finalized",
          comparabilityKey: "earnings.median.10-years-after-entry",
          sourceField: "MD_EARN_WNE_P10",
          cohort:
            "2009-2010 and 2010-2011 entrants; earnings measured in 2020-2021",
          definition:
            "Median earnings 10 years after entry for the pooled federal cohort, expressed in 2022 dollars. Federal earnings may cover multiple campuses in the same OPEID6 reporting group.",
        }),
      },
      majors,
    };
  })
  .map((college) => {
    const overlay = overlaysByUnitId.get(college.unitId);
    if (!overlay) return college;

    for (const [metric, value] of Object.entries(overlay.observations)) {
      const sourceId = resolveInstitutionOverlayObservationSourceId(
        overlay,
        value,
      );
      const source = overlaySourcesById.get(sourceId);
      if (!source) {
        throw new Error(
          `Missing registered source ${sourceId} for UNITID ${college.unitId} ${metric}.`,
        );
      }
      if (college.observations[metric]) {
        college.alternateObservations[metric] = college.observations[metric];
      }
      college.observations[metric] = observation({ ...value, source });
    }

    return college;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

for (const college of colleges) {
  assertCollegeMatchesCatalog(college);
  if (typeof college.mainCampus !== "boolean" || !college.currentlyOperating || !college.undergraduateOffering) {
    throw new Error(
      `${college.name} is no longer an eligible federal undergraduate record. Review the institution identity before publishing.`,
    );
  }

  const admitRate = college.observations.admitRate.value;
  if (
    admitRate !== null &&
    (admitRate < 0 || admitRate > 1)
  ) {
    throw new Error(`Invalid admit rate for ${college.name}.`);
  }
}

const output = {
  release: {
    cohortName: "CollegeSearch federal undergraduate catalog",
    institutionCount: colleges.length,
    accessedOn,
    federalReleaseDate: collegeCatalogSource.releaseDate,
    metricPeriods: federalMetricPeriods,
    earningsPeriodLabel: federalMetricPeriods.medianEarnings.periodLabel,
    publisher: "U.S. Department of Education",
    sourceName: "College Scorecard",
    sourceUrl: "https://collegescorecard.ed.gov/data/",
    ucAdmissionsSourceUrl:
      "https://admission.universityofcalifornia.edu/campuses-majors/",
    ucDisciplineSourceUrl:
      "https://www.universityofcalifornia.edu/about-us/information-center/freshman-admission-discipline",
    notes:
      "UC headline admit rates use official preliminary Fall 2026 UC Admissions campus snapshots as of June 2026; they may change, and campus rows must not be summed to infer an unduplicated systemwide total. Fall 2025 Accountability data remains the finalized source for enrollees and yield. The federal baseline comes from the published June 2026 College Scorecard artifact; underlying 2024-2025 IPEDS admissions, enrollment, tuition, and program fields remain provisional. Federal TUITIONFEE_IN is in-district tuition and may differ from a college's in-state resident price. Every observation retains its exact reporting period. Verified institution observations retain replaced federal records as alternates. Operating status is PEPS as of April 30, 2026, not a real-time guarantee. Branch UNITIDs remain separate; some federal outcomes are shared within OPEID6 groups. Broad field filters pair a provisional 2024-2025 bachelor's or associate program indicator with the field's share of all awards; neither is a major-specific admit rate.",
    sources: [
      federalSource,
      ucHeadlineDataset.release,
      ucFinalizedDataset.release,
      ...institutionOverlays.sources,
    ],
  },
  colleges,
};

const outputPath = resolve(dataOutputDirectory, "colleges.json");
await mkdir(dirname(outputPath), { recursive: true });
await atomicWriteFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `Imported ${colleges.length} colleges to ${outputPath} from College Scorecard.`,
);
