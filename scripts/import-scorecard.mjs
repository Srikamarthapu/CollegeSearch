import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const cohortUnitIds = [
  110635, 110644, 110653, 110662, 445188, 110671, 110680, 110705, 110714,
  122755, 122409, 110422, 110583, 110565, 110608, 110617, 110592, 110556,
  110529, 243744, 123961, 110404, 122931, 117946, 111948, 122612, 121345,
  170976, 236948, 228778, 139755, 199120, 145637, 243780, 240444, 234076,
  204796, 104151, 104179, 209542, 236939, 166629, 166027, 166683, 130794,
  186131, 190150, 193900, 198419, 147767,
];

const aliases = {
  104151: ["ASU", "Arizona State"],
  110422: ["Cal Poly", "Cal Poly SLO"],
  110529: ["Cal Poly Pomona", "CPP"],
  110565: ["Cal State Fullerton", "CSUF"],
  110583: ["Cal State Long Beach", "CSULB", "Long Beach State"],
  110592: ["Cal State LA", "CSULA"],
  110608: ["Cal State Northridge", "CSUN"],
  110617: ["Sac State", "Sacramento State"],
  110635: ["UC Berkeley", "Berkeley", "Cal"],
  110644: ["UC Davis", "UCD"],
  110653: ["UC Irvine", "UCI"],
  110662: ["UCLA", "UC Los Angeles"],
  110671: ["UC Riverside", "UCR"],
  110680: ["UC San Diego", "UCSD"],
  110705: ["UC Santa Barbara", "UCSB"],
  110714: ["UC Santa Cruz", "UCSC"],
  110556: ["Fresno State", "CSU Fresno"],
  111948: ["Chapman"],
  117946: ["LMU", "Loyola Marymount"],
  121345: ["Pomona"],
  122409: ["San Diego State", "SDSU"],
  122612: ["USF", "University of San Francisco"],
  122755: ["San Jose State", "SJSU"],
  122931: ["Santa Clara", "SCU"],
  123961: ["USC", "Southern California"],
  139755: ["Georgia Tech", "GT"],
  145637: ["UIUC", "Illinois"],
  147767: ["Northwestern"],
  166027: ["Harvard"],
  166629: ["UMass Amherst", "Massachusetts Amherst"],
  166683: ["MIT", "Massachusetts Institute of Technology"],
  170976: ["Michigan", "UMich"],
  186131: ["Princeton"],
  190150: ["Columbia"],
  193900: ["NYU", "New York University"],
  198419: ["Duke"],
  199120: ["UNC", "UNC Chapel Hill"],
  204796: ["Ohio State", "OSU"],
  209542: ["Oregon State", "OSU"],
  228778: ["UT Austin", "Texas"],
  234076: ["UVA", "Virginia"],
  236939: ["Washington State", "WSU"],
  236948: ["UW", "University of Washington"],
  240444: ["Wisconsin", "UW Madison"],
  243744: ["Stanford"],
  243780: ["Purdue"],
  445188: ["UC Merced", "UCM"],
};

const programFields = {
  "Computing & Information Sciences": {
    shareField: "PCIP11",
    bachelorField: "CIP11BACHL",
  },
  "Business & Marketing": {
    shareField: "PCIP52",
    bachelorField: "CIP52BACHL",
  },
  Engineering: { shareField: "PCIP14", bachelorField: "CIP14BACHL" },
  "Biological & Biomedical Sciences": {
    shareField: "PCIP26",
    bachelorField: "CIP26BACHL",
  },
  "Health Professions": {
    shareField: "PCIP51",
    bachelorField: "CIP51BACHL",
  },
  Psychology: { shareField: "PCIP42", bachelorField: "CIP42BACHL" },
  "Social Sciences": {
    shareField: "PCIP45",
    bachelorField: "CIP45BACHL",
  },
  "Visual & Performing Arts": {
    shareField: "PCIP50",
    bachelorField: "CIP50BACHL",
  },
  Education: { shareField: "PCIP13", bachelorField: "CIP13BACHL" },
  "Mathematics & Statistics": {
    shareField: "PCIP27",
    bachelorField: "CIP27BACHL",
  },
  "Physical Sciences": {
    shareField: "PCIP40",
    bachelorField: "CIP40BACHL",
  },
  "English Language & Literature": {
    shareField: "PCIP23",
    bachelorField: "CIP23BACHL",
  },
};

const scorecardArtifactUrl =
  process.env.SCORECARD_INSTITUTION_ZIP_URL ||
  "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip";
const scorecardLandingUrl = "https://collegescorecard.ed.gov/data/";
const scorecardDictionaryUrl =
  "https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
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
    resolve(scriptDirectory, "../data/uc-admissions-2025.json"),
    "utf8",
  ),
);
const ucHeadlineDataset = JSON.parse(
  await readFile(
    resolve(scriptDirectory, "../data/uc-admissions-latest.json"),
    "utf8",
  ),
);
const institutionOverlays = JSON.parse(
  await readFile(
    resolve(scriptDirectory, "../data/institution-overlays.json"),
    "utf8",
  ),
);
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

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value.replace(/\r$/, ""));
  return values;
}

async function loadScorecardRows() {
  const response = await fetch(scorecardArtifactUrl);
  if (!response.ok) {
    throw new Error(
      `College Scorecard download failed (${response.status}) from ${scorecardArtifactUrl}.`,
    );
  }

  const zipBytes = new Uint8Array(await response.arrayBuffer());
  const artifactSha256 = createHash("sha256")
    .update(zipBytes)
    .digest("hex");
  const archive = unzipSync(zipBytes);
  const csvEntry = Object.entries(archive).find(
    ([name]) =>
      name.endsWith("Most-Recent-Cohorts-Institution.csv") &&
      !name.startsWith("__MACOSX/"),
  );

  if (!csvEntry) {
    throw new Error("The College Scorecard archive did not contain the expected institution CSV.");
  }

  const csvText = new TextDecoder("utf-8").decode(csvEntry[1]);
  const headerEnd = csvText.indexOf("\n");
  if (headerEnd < 0) {
    throw new Error("The College Scorecard institution CSV has no data rows.");
  }

  const headers = parseCsvLine(csvText.slice(0, headerEnd));
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  const requiredFields = [
    "UNITID",
    "OPEID",
    "OPEID6",
    "INSTNM",
    "CITY",
    "STABBR",
    "CONTROL",
    "INSTURL",
    "LOCALE",
    "MAIN",
    "NUMBRANCH",
    "CURROPER",
    "ADM_RATE",
    "UGDS",
    "NPT4_PUB",
    "NPT4_PRIV",
    "C150_4",
    "MD_EARN_WNE_P10",
    "TUITIONFEE_IN",
    "TUITIONFEE_OUT",
    ...Object.values(programFields).flatMap(
      ({ shareField, bachelorField }) => [shareField, bachelorField],
    ),
  ];

  for (const requiredField of requiredFields) {
    if (!headerIndexes.has(requiredField)) {
      throw new Error(
        `The College Scorecard release is missing required field ${requiredField}.`,
      );
    }
  }

  const requestedUnitIds = new Set(cohortUnitIds);
  const rows = [];
  let lineStart = headerEnd + 1;

  while (lineStart < csvText.length) {
    let lineEnd = csvText.indexOf("\n", lineStart);
    if (lineEnd < 0) lineEnd = csvText.length;
    const line = csvText.slice(lineStart, lineEnd);
    lineStart = lineEnd + 1;
    if (!line) continue;

    const firstComma = line.indexOf(",");
    const unitId = Number(line.slice(0, firstComma));
    if (!requestedUnitIds.has(unitId)) continue;

    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      requiredFields.map((requiredField) => [
        requiredField,
        values[headerIndexes.get(requiredField)],
      ]),
    );
    rows.push(row);
  }

  const returnedUnitIds = new Set(rows.map((row) => Number(row.UNITID)));
  const missingUnitIds = cohortUnitIds.filter(
    (unitId) => !returnedUnitIds.has(unitId),
  );
  const unexpectedUnitIds = [...returnedUnitIds].filter(
    (unitId) => !requestedUnitIds.has(unitId),
  );
  if (missingUnitIds.length || unexpectedUnitIds.length) {
    throw new Error(
      `College Scorecard identity mismatch. Missing: ${missingUnitIds.join(", ") || "none"}; unexpected: ${unexpectedUnitIds.join(", ") || "none"}.`,
    );
  }

  return { rows, artifactSha256 };
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

function regionLabel(state) {
  if (["CA", "OR", "WA", "AZ"].includes(state)) return "West";
  if (["IL", "IN", "MI", "OH", "WI"].includes(state)) return "Midwest";
  if (["GA", "NC", "TX", "VA"].includes(state)) return "South";
  return "Northeast";
}

const scorecardSnapshot = await loadScorecardRows();
federalSource = {
  id: "college-scorecard-institution-2026-06-10",
  publisher: "U.S. Department of Education",
  sourceName: "College Scorecard — June 2026 institution release",
  sourceUrl: scorecardLandingUrl,
  sourceUrls: [scorecardArtifactUrl, scorecardDictionaryUrl],
  artifactUrl: scorecardArtifactUrl,
  artifactSha256: scorecardSnapshot.artifactSha256,
  releaseDate: "2026-06-10",
  accessedOn,
  notes:
    "This June 2026 release combines metrics with different reporting lags. Every observation retains its exact academic year, fall term, entry cohort, or measurement period from the official cohort map.",
  finality: "finalized",
};

const colleges = scorecardSnapshot.rows
  .map((row) => {
    const unitId = Number(row.UNITID);
    const ucAdmission = ucHeadlineByUnitId.get(unitId);
    const ucFinalizedAdmission = ucFinalizedByUnitId.get(unitId);
    const ucHeadlineSource = ucAdmission
      ? { ...ucHeadlineDataset.release, sourcePage: ucAdmission.sourceUrl }
      : null;
    const federalAdmitRate = numericField(row, "ADM_RATE");
    const federalAdmitObservation = observation({
      value: federalAdmitRate,
      unit: "ratio",
      reportingYear: 2024,
      periodLabel: "Fall 2024",
      finality: "finalized",
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
          periodLabel: `Fall ${ucAdmission.fall} snapshot`,
          finality: "snapshot",
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
      .map(([name, { shareField, bachelorField }]) => ({
        name,
        share: numericField(row, shareField),
        evidence: "Broad federal bachelor's field",
        reportingYear: 2025,
        periodLabel: "2024-2025 programs and awards",
        sourceId: federalSource.id,
        sourceField: `${shareField} + ${bachelorField}`,
        cohort:
          "IPEDS 2024-2025 awards; bachelor's program availability reported for the broad CIP family",
        definition:
          "The bachelor's indicator confirms at least one program in this broad field. The percentage is this field's share of all institution-wide awards, not a major-specific admission rate.",
        bachelorsAvailable: numericField(row, bachelorField) === 1,
      }))
      .filter(
        (major) =>
          major.bachelorsAvailable &&
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
      slug: field(row, "INSTNM")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      name: field(row, "INSTNM"),
      aliases: aliases[unitId] || [],
      city: field(row, "CITY"),
      state: field(row, "STABBR"),
      region: regionLabel(field(row, "STABBR")),
      ownership: ownershipLabel(numericField(row, "CONTROL")),
      setting: settingLabel(numericField(row, "LOCALE")),
      website: normalizeWebsite(field(row, "INSTURL")),
      observations: {
        admitRate: primaryAdmitObservation,
        applicants: ucAdmission
          ? observation({
              value: ucAdmission.applicants,
              unit: "count",
              reportingYear: ucAdmission.fall,
              periodLabel: `Fall ${ucAdmission.fall} snapshot`,
              finality: "snapshot",
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
              periodLabel: `Fall ${ucAdmission.fall} snapshot`,
              finality: "snapshot",
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
          reportingYear: 2024,
          periodLabel: "Fall 2024",
          finality: "finalized",
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
          reportingYear: 2024,
          periodLabel: "2023-2024 aid cohort",
          finality: "finalized",
          comparabilityKey: "net-price.title-iv.overall",
          sourceField:
            numericField(row, "NPT4_PUB") !== null ? "NPT4_PUB" : "NPT4_PRIV",
          cohort:
            numericField(row, "NPT4_PUB") !== null
              ? "Academic year 2023-2024 first-time, full-time, degree/certificate-seeking in-state students receiving Title IV aid"
              : "Academic year 2023-2024 first-time, full-time, degree/certificate-seeking students receiving Title IV aid",
          definition:
            "Average annual net price after grants and scholarships for the exact reported federal cohort.",
        }),
        graduationRate: observation({
          value: numericField(row, "C150_4"),
          unit: "ratio",
          reportingYear: 2024,
          periodLabel: "Fall 2018 entering cohort",
          finality: "finalized",
          comparabilityKey: "completion.four-year-institution.150-percent",
          sourceField: "C150_4",
          cohort:
            "Fall 2018 or academic-year 2018-2019 first-time, full-time degree/certificate-seeking cohort",
          definition:
            "Share completing a degree or certificate at a four-year institution within 150% of normal time.",
        }),
        medianEarnings: observation({
          value: numericField(row, "MD_EARN_WNE_P10"),
          unit: "usd",
          reportingYear: 2020,
          periodLabel: "Measured 2020-2021",
          finality: "finalized",
          comparabilityKey: "earnings.median.10-years",
          sourceField: "MD_EARN_WNE_P10",
          cohort:
            "2009-2010 and 2010-2011 entrants; earnings measured in 2020-2021",
          definition:
            "Median earnings 10 years after entry for the pooled federal cohort, expressed in 2022 dollars.",
        }),
        tuitionInState: observation({
          value: numericField(row, "TUITIONFEE_IN"),
          unit: "usd",
          reportingYear: 2024,
          periodLabel: "2024-2025",
          finality: "finalized",
          comparabilityKey: "tuition-fees.in-state",
          sourceField: "TUITIONFEE_IN",
          cohort: "Academic year 2024-2025 published institutional price",
          definition: "Published in-state tuition and required fees.",
        }),
        tuitionOutOfState: observation({
          value: numericField(row, "TUITIONFEE_OUT"),
          unit: "usd",
          reportingYear: 2024,
          periodLabel: "2024-2025",
          finality: "finalized",
          comparabilityKey: "tuition-fees.out-of-state",
          sourceField: "TUITIONFEE_OUT",
          cohort: "Academic year 2024-2025 published institutional price",
          definition: "Published out-of-state tuition and required fees.",
        }),
      },
      alternateObservations: ucAdmission
        ? {
            admitRate: federalAdmitObservation,
          }
        : {},
      majors,
    };
  })
  .map((college) => {
    const overlay = overlaysByUnitId.get(college.unitId);
    if (!overlay) return college;

    const source = overlaySourcesById.get(overlay.sourceId);
    if (!source) {
      throw new Error(
        `Missing registered source ${overlay.sourceId} for UNITID ${college.unitId}.`,
      );
    }

    for (const [metric, value] of Object.entries(overlay.observations)) {
      if (college.observations[metric]) {
        college.alternateObservations[metric] = college.observations[metric];
      }
      college.observations[metric] = observation({ ...value, source });
    }

    return college;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

for (const college of colleges) {
  if (!college.mainCampus || !college.currentlyOperating) {
    throw new Error(
      `${college.name} is no longer a current main-campus Scorecard record. Review the institution identity before publishing.`,
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
    cohortName: "CollegeSearch verified starting cohort",
    institutionCount: colleges.length,
    accessedOn,
    federalReleaseDate: "2026-06-10",
    institutionMetricsYear: 2024,
    earningsCohortYear: 2020,
    earningsPeriodLabel: "Measured 2020-2021",
    publisher: "U.S. Department of Education",
    sourceName: "College Scorecard",
    sourceUrl: "https://collegescorecard.ed.gov/data/",
    ucAdmissionsSourceUrl:
      "https://admission.universityofcalifornia.edu/campuses-majors/",
    ucDisciplineSourceUrl:
      "https://www.universityofcalifornia.edu/about-us/information-center/freshman-admission-discipline",
    notes:
      "UC headline admit rates use official Fall 2026 UC Admissions campus snapshots; Fall 2025 Accountability data remains the finalized source for enrollees and yield. The federal baseline comes from the official June 2026 College Scorecard release, whose underlying metrics carry different reporting lags. Verified institution observations retain replaced federal records as alternates. Broad field filters require a 2024-2025 bachelor's-program indicator and pair it with the field's share of all awards; neither is a major-specific admit rate.",
    sources: [
      federalSource,
      ucHeadlineDataset.release,
      ucFinalizedDataset.release,
      ...institutionOverlays.sources,
    ],
  },
  colleges,
};

const outputPath = resolve(scriptDirectory, "../data/colleges.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `Imported ${colleges.length} colleges to ${outputPath} from College Scorecard.`,
);
