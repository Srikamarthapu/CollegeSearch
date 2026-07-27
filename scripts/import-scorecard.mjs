import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  "Computer Science": "computer",
  Business: "business_marketing",
  Engineering: "engineering",
  Biology: "biological",
  "Health Professions": "health",
  Psychology: "psychology",
  "Social Sciences": "social_science",
  "Arts & Design": "visual_performing",
  Education: "education",
  Mathematics: "mathematics",
  "Physical Sciences": "physical_science",
  English: "language",
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const ucDataset = JSON.parse(
  await readFile(
    resolve(scriptDirectory, "../data/uc-admissions-2025.json"),
    "utf8",
  ),
);
const ucAdmissionsByUnitId = new Map(
  ucDataset.campuses.map((campus) => [campus.unitId, campus]),
);

const federalSource = {
  id: "college-scorecard-2024",
  publisher: "U.S. Department of Education",
  sourceName: "College Scorecard",
  sourceUrl: "https://collegescorecard.ed.gov/data/",
  accessedOn: new Date().toISOString().slice(0, 10),
};

function observation({
  value,
  unit,
  reportingYear,
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

const fields = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.ownership",
  "school.school_url",
  "school.locale",
  "2024.student.size",
  "2024.admissions.admission_rate.overall",
  "2024.cost.avg_net_price.overall",
  "2024.completion.completion_rate_4yr_150nt",
  "2020.earnings.10_yrs_after_entry.median",
  "2024.cost.tuition.in_state",
  "2024.cost.tuition.out_of_state",
  ...Object.values(programFields).map(
    (field) => `2024.academics.program_percentage.${field}`,
  ),
];

const field = (row, key) => row[key] ?? null;

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

const params = new URLSearchParams({
  api_key: process.env.DATA_GOV_API_KEY || "DEMO_KEY",
  id: cohortUnitIds.join(","),
  per_page: "100",
  fields: fields.join(","),
});

const response = await fetch(
  `https://api.data.gov/ed/collegescorecard/v1/schools.json?${params}`,
);

if (!response.ok) {
  throw new Error(`College Scorecard request failed (${response.status}).`);
}

const payload = await response.json();
if (payload.results?.length !== cohortUnitIds.length) {
  throw new Error(
    `Expected ${cohortUnitIds.length} colleges; received ${payload.results?.length ?? 0}.`,
  );
}

const colleges = payload.results
  .map((row) => {
    const ucAdmission = ucAdmissionsByUnitId.get(row.id);
    const federalAdmitRate = field(
      row,
      "2024.admissions.admission_rate.overall",
    );
    const federalAdmitObservation = observation({
      value: federalAdmitRate,
      unit: "ratio",
      reportingYear: 2024,
      sourceField: "2024.admissions.admission_rate.overall",
      cohort: "IPEDS fall admissions reporting cohort",
      definition:
        "Admitted undergraduate applicants divided by undergraduate applicants.",
    });
    const primaryAdmitObservation = ucAdmission
      ? observation({
          value: ucAdmission.admitRate,
          unit: "ratio",
          reportingYear: ucAdmission.fall,
          sourceField: ucDataset.release.sourceField,
          cohort: ucDataset.release.cohort,
          definition:
            "Fall freshman admits divided by fall freshman applicants for this UC campus.",
          status: "derived",
          source: ucDataset.release,
        })
      : federalAdmitObservation;
    const majors = Object.entries(programFields)
      .map(([name, apiField]) => ({
        name,
        share: field(row, `2024.academics.program_percentage.${apiField}`),
        evidence: "Recent degree completions",
      }))
      .filter((major) => typeof major.share === "number" && major.share > 0);

    return {
      unitId: row.id,
      slug: field(row, "school.name")
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      name: field(row, "school.name"),
      aliases: aliases[row.id] || [],
      city: field(row, "school.city"),
      state: field(row, "school.state"),
      region: regionLabel(field(row, "school.state")),
      ownership: ownershipLabel(field(row, "school.ownership")),
      setting: settingLabel(field(row, "school.locale")),
      website: `https://${field(row, "school.school_url")}`,
      observations: {
        admitRate: primaryAdmitObservation,
        applicants: ucAdmission
          ? observation({
              value: ucAdmission.applicants,
              unit: "count",
              reportingYear: ucAdmission.fall,
              sourceField: "Fall Applicants",
              cohort: ucDataset.release.cohort,
              definition:
                "Applications submitted to this UC campus for fall freshman admission.",
              source: ucDataset.release,
            })
          : null,
        admits: ucAdmission
          ? observation({
              value: ucAdmission.admits,
              unit: "count",
              reportingYear: ucAdmission.fall,
              sourceField: "Fall Admits",
              cohort: ucDataset.release.cohort,
              definition:
                "Applicants admitted to this UC campus for fall freshman admission.",
              source: ucDataset.release,
            })
          : null,
        enrollees: ucAdmission
          ? observation({
              value: ucAdmission.enrollees,
              unit: "count",
              reportingYear: ucAdmission.fall,
              sourceField: "Fall Enrollees",
              cohort: ucDataset.release.cohort,
              definition:
                "Admitted fall freshman applicants who enrolled at this UC campus.",
              source: ucDataset.release,
            })
          : null,
        yieldRate: ucAdmission
          ? observation({
              value: ucAdmission.yieldRate,
              unit: "ratio",
              reportingYear: ucAdmission.fall,
              sourceField:
                "Derived yield rate: Fall Enrollees divided by Fall Admits",
              cohort: ucDataset.release.cohort,
              definition:
                "Fall freshman enrollees divided by fall freshman admits for this UC campus.",
              status: "derived",
              source: ucDataset.release,
            })
          : null,
        undergraduateEnrollment: observation({
          value: field(row, "2024.student.size"),
          unit: "count",
          reportingYear: 2024,
          sourceField: "2024.student.size",
          cohort: "College Scorecard institutional reporting cohort",
          definition: "Reported undergraduate enrollment.",
        }),
        averageNetPrice: observation({
          value: field(row, "2024.cost.avg_net_price.overall"),
          unit: "usd",
          reportingYear: 2024,
          sourceField: "2024.cost.avg_net_price.overall",
          cohort: "Title IV federal aid recipients",
          definition:
            "Average annual net price after grants and scholarships for the reported federal cohort.",
        }),
        graduationRate: observation({
          value: field(
            row,
            "2024.completion.completion_rate_4yr_150nt",
          ),
          unit: "ratio",
          reportingYear: 2024,
          sourceField: "2024.completion.completion_rate_4yr_150nt",
          cohort: "First-time, full-time students",
          definition:
            "Completion of a four-year award within 150% of expected time.",
        }),
        medianEarnings: observation({
          value: field(
            row,
            "2020.earnings.10_yrs_after_entry.median",
          ),
          unit: "usd",
          reportingYear: 2020,
          sourceField: "2020.earnings.10_yrs_after_entry.median",
          cohort: "Federal earnings cohort, 10 years after entry",
          definition:
            "Median earnings 10 years after entering the institution for the reported federal cohort.",
        }),
        tuitionInState: observation({
          value: field(row, "2024.cost.tuition.in_state"),
          unit: "usd",
          reportingYear: 2024,
          sourceField: "2024.cost.tuition.in_state",
          cohort: "Published institutional price",
          definition: "Published in-state tuition and required fees.",
        }),
        tuitionOutOfState: observation({
          value: field(row, "2024.cost.tuition.out_of_state"),
          unit: "usd",
          reportingYear: 2024,
          sourceField: "2024.cost.tuition.out_of_state",
          cohort: "Published institutional price",
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
  .sort((a, b) => a.name.localeCompare(b.name));

for (const college of colleges) {
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
    cohortName: "College Compass verified starting cohort",
    institutionCount: colleges.length,
    accessedOn: new Date().toISOString().slice(0, 10),
    institutionMetricsYear: 2024,
    earningsCohortYear: 2020,
    publisher: "U.S. Department of Education",
    sourceName: "College Scorecard",
    sourceUrl: "https://collegescorecard.ed.gov/data/",
    ucAdmissionsSourceUrl:
      "https://www.universityofcalifornia.edu/about-us/information-center/freshman-admissions-summary",
    ucDisciplineSourceUrl:
      "https://www.universityofcalifornia.edu/about-us/information-center/freshman-admission-discipline",
    notes:
      "UC headline admit rates use official Fall 2025 campus counts from the UC Accountability Report. Other colleges use the 2024 College Scorecard institution rate. Major evidence reflects recent federal degree-completion shares and is not a major-specific admit rate.",
    sources: [federalSource, ucDataset.release],
  },
  colleges,
};

const outputPath = resolve(scriptDirectory, "../data/colleges.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `Imported ${colleges.length} colleges to ${outputPath} from College Scorecard.`,
);
