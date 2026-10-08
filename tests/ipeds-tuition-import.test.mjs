import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCollegeTuitionDataset } from "../scripts/import-ipeds-tuition.mjs";

const fixtureFields = (overrides = {}) => ({
  UNITID: 202,
  TUITION1: 1000,
  TUITION2: 2000,
  TUITION3: 9000,
  FEE1: 100,
  FEE2: 200,
  FEE3: 300,
  ...overrides,
});

test("keeps annual tuition and required fees separate with source field provenance", () => {
  const dataset = buildCollegeTuitionDataset({
    catalogColleges: [{ unitId: 202, name: "Annual Price College" }],
    tuitionRows: [fixtureFields()],
    flagsRows: [{ UNITID: 202, STAT_COS1: 1, IMP_COS1: -2 }],
    accessedOn: "2026-10-07",
    databaseSha256: "database-sha",
  });
  const college = dataset.colleges[0];

  assert.equal(college.tuition.inState.value, 2000);
  assert.equal(college.tuition.outOfState.value, 9000);
  assert.equal(college.fees.inState.value, 200);
  assert.equal(college.fees.outOfState.value, 300);
  assert.equal(college.tuition.inState.sourceField, "TUITION2");
  assert.equal(college.fees.inState.sourceField, "FEE2");
  assert.equal(college.tuition.inState.comparabilityKey, "annual-undergraduate-tuition-only-2024-25");
  assert.equal(college.fees.inState.comparabilityKey, "annual-undergraduate-required-fees-2024-25");
  assert.match(college.tuition.inState.definition, /required fees are excluded/);
  assert.equal(college.tuition.inState.value + college.fees.inState.value, 2200);
  assert.equal(college.evidenceStatus, "reported");
  assert.equal(college.tuition.inState.status, "reported");
  assert.equal(college.tuition.inState.periodLabel, "2024-25");
  assert.equal(college.tuition.inState.reportingYear, 2024);
  assert.equal(college.tuition.inState.sourceUrl, dataset.release.sourceArchiveUrl);
  assert.equal(college.tuition.inState.accessedOn, "2026-10-07");
  assert.equal(dataset.release.archiveMemberSha256, "database-sha");
});

test("leaves program-priced, unavailable, and absent annual charges null", () => {
  const dataset = buildCollegeTuitionDataset({
    catalogColleges: [
      { unitId: 101, name: "Absent College" },
      { unitId: 103, name: "Program College" },
      { unitId: 104, name: "Unknown Basis College" },
    ],
    tuitionRows: [
      fixtureFields({ UNITID: 103, TUITION1: null, TUITION2: null, TUITION3: null, FEE1: null, FEE2: null, FEE3: null, CIPCODE1: "52.0201" }),
      fixtureFields({ UNITID: 104, TUITION1: null, TUITION2: null, TUITION3: null, FEE1: null, FEE2: null, FEE3: null, CIPCODE1: null }),
    ],
    flagsRows: [],
  });

  const [absent, program, unknown] = dataset.colleges;
  assert.equal(absent.evidenceStatus, "no-source-record");
  assert.equal(absent.sourceRecordPresent, false);
  assert.equal(absent.tuition.inState.value, null);
  assert.equal(absent.fees.outOfState.value, null);
  assert.match(absent.tuition.inState.definition, /no value was inferred/);

  assert.equal(program.pricingBasis, "program");
  assert.equal(program.programPricingCipCode, "52.0201");
  assert.equal(program.evidenceStatus, "program-based-no-annual-rate");
  assert.equal(program.tuition.inState.value, null);
  assert.equal(program.fees.inState.value, null);
  assert.match(program.tuition.inState.definition, /program charges are not an annual academic-year tuition rate/);

  assert.equal(unknown.pricingBasis, "unknown");
  assert.equal(unknown.evidenceStatus, "annual-rate-unavailable");
  assert.equal(unknown.tuition.inState.value, null);
  assert.deepEqual(dataset.coverage, {
    catalogCollegeCount: 3,
    matchedArchiveRowCount: 2,
    missingArchiveRowCount: 1,
    academicYearPriceCollegeCount: 0,
    programBasedWithoutAnnualPriceCount: 1,
    annualPriceUnavailableCount: 1,
    institutionLevelImputationCount: 0,
    observationValueCounts: {
      TUITION1: 0,
      TUITION2: 0,
      TUITION3: 0,
      FEE1: 0,
      FEE2: 0,
      FEE3: 0,
    },
  });
});

test("marks values from institution-level imputed responses as derived", () => {
  const dataset = buildCollegeTuitionDataset({
    catalogColleges: [{ unitId: 205, name: "Imputed College" }],
    tuitionRows: [fixtureFields({ UNITID: 205 })],
    flagsRows: [{ UNITID: 205, STAT_COS1: 2, IMP_COS1: 1 }],
  });
  const tuition = dataset.colleges[0].tuition.inState;

  assert.equal(dataset.colleges[0].evidenceStatus, "institution-level-imputation");
  assert.equal(tuition.status, "derived");
  assert.match(tuition.definition, /Institution-level Cost I response status: Partial respondent, imputed/);
  assert.match(tuition.definition, /does not expose field-specific imputation flags/);
  assert.equal(dataset.coverage.institutionLevelImputationCount, 1);
});

test("rejects duplicate or invalid UNITIDs in source and catalog input", () => {
  const common = {
    catalogColleges: [{ unitId: 1, name: "College" }],
    tuitionRows: [],
    flagsRows: [],
  };
  assert.throws(() => buildCollegeTuitionDataset({
    ...common,
    catalogColleges: [{ unitId: 1, name: "One" }, { unitId: 1, name: "Duplicate" }],
  }), /Catalog has a duplicate or invalid UNITID/);
  assert.throws(() => buildCollegeTuitionDataset({
    ...common,
    tuitionRows: [{ UNITID: 0 }],
  }), /COST1_2024 has a duplicate or invalid UNITID/);
});

test("generated sidecar covers every catalog row with six separate observations", async () => {
  const data = JSON.parse(await readFile(new URL("../data/college-tuition.json", import.meta.url), "utf8"));
  const catalog = JSON.parse(await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"));
  const ids = data.colleges.map((college) => college.unitId);

  assert.equal(data.release.periodLabel, "2024-25");
  assert.equal(data.release.finality, "provisional");
  assert.match(data.release.sourceUrl, /^https:\/\/nces\.ed\.gov\/ipeds\//);
  assert.equal(data.coverage.catalogCollegeCount, 3912);
  assert.equal(data.colleges.length, catalog.colleges.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, catalog.colleges.map((college) => college.unitId));
  assert.equal(data.coverage.matchedArchiveRowCount, 3875);
  assert.equal(data.coverage.missingArchiveRowCount, 37);
  assert.equal(data.coverage.academicYearPriceCollegeCount, 3384);
  assert.equal(data.coverage.programBasedWithoutAnnualPriceCount, 472);
  assert.equal(data.coverage.annualPriceUnavailableCount, 19);
  assert.deepEqual(data.coverage.observationValueCounts, {
    TUITION1: 3384,
    TUITION2: 3384,
    TUITION3: 3384,
    FEE1: 3384,
    FEE2: 3384,
    FEE3: 3384,
  });

  for (const college of data.colleges) {
    for (const [type, fields] of Object.entries({
      tuition: { inDistrict: "TUITION1", inState: "TUITION2", outOfState: "TUITION3" },
      fees: { inDistrict: "FEE1", inState: "FEE2", outOfState: "FEE3" },
    })) {
      for (const [residency, sourceField] of Object.entries(fields)) {
        const observation = college[type][residency];
        assert.equal(observation.sourceField, sourceField);
        assert.equal(observation.value === null, observation.status === "unavailable");
        assert.equal(observation.unit, "usd");
        assert.equal(observation.reportingYear, 2024);
        assert.equal(observation.periodLabel, "2024-25");
        assert.equal(observation.comparabilityKey, type === "tuition"
          ? "annual-undergraduate-tuition-only-2024-25"
          : "annual-undergraduate-required-fees-2024-25");
      }
    }
  }
});
