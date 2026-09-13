import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const federalSourceId = "college-scorecard-institution-2026-06-10";

const reviewedAdmissionRecords = [
  {
    unitId: 123961,
    sourceId: "usc-cds-2025-26",
    artifactKind: "pdf",
    applicants: 83488,
    admits: 9345,
    enrollees: 3759,
    undergraduateEnrollment: 20768,
    graduationRate: 0.90310323,
  },
  {
    unitId: 170976,
    sourceId: "umich-cds-2025-26",
    artifactKind: "pdf",
    applicants: 109112,
    admits: 17915,
    enrollees: 8178,
    undergraduateEnrollment: 35358,
    graduationRate: 0.93,
    tuitionInState: 20082,
    tuitionOutOfState: 69447,
  },
  {
    unitId: 236948,
    sourceId: "uw-seattle-cds-2025-26",
    artifactKind: "pdf",
    applicants: 72933,
    admits: 30446,
    enrollees: 7129,
    undergraduateEnrollment: 40996,
    graduationRate: 0.85,
  },
  {
    unitId: 139755,
    sourceId: "gatech-cds-2025-26",
    artifactKind: "pdf",
    applicants: 66881,
    admits: 8921,
    enrollees: 4071,
    undergraduateEnrollment: 21028,
    graduationRate: 0.94,
    tuitionInState: 12134,
    tuitionOutOfState: 36120,
  },
  {
    unitId: 145637,
    sourceId: "illinois-cds-2025-26",
    artifactKind: "xlsx",
    applicants: 83045,
    admits: 30384,
    enrollees: 9207,
    undergraduateEnrollment: 38572,
    graduationRate: 0.8629653821032005,
  },
  {
    unitId: 122931,
    sourceId: "santa-clara-cds-2025-26",
    artifactKind: "pdf",
    applicants: 20032,
    admits: 9592,
    enrollees: 1641,
    undergraduateEnrollment: 6695,
    graduationRate: 0.8722021661,
  },
  {
    unitId: 111948,
    sourceId: "chapman-cds-2025-26",
    artifactKind: "pdf",
    applicants: 14769,
    admits: 10642,
    enrollees: 1727,
    undergraduateEnrollment: 7630,
    graduationRate: 0.8261,
    tuitionInState: 70394,
    tuitionOutOfState: 70394,
  },
  {
    unitId: 117946,
    sourceId: "lmu-cds-2025-26",
    artifactKind: "pdf",
    applicants: 22798,
    admits: 10992,
    enrollees: 1536,
    undergraduateEnrollment: 7187,
    graduationRate: 0.788,
    tuitionInState: 68940,
    tuitionOutOfState: 68940,
  },
  {
    unitId: 122409,
    sourceId: "sdsu-cds-2025-26",
    artifactKind: "pdf",
    applicants: 95444,
    admits: 35709,
    enrollees: 6911,
    undergraduateEnrollment: 36196,
    graduationRate: 0.78,
  },
  {
    unitId: 110422,
    sourceId: "calpoly-slo-cds-2025-26",
    artifactKind: "pdf",
    applicants: 71309,
    admits: 21367,
    enrollees: 5456,
    undergraduateEnrollment: 22313,
    graduationRate: 0.873,
  },
  {
    unitId: 166629,
    sourceId: "umass-amherst-cds-2025-26",
    artifactKind: "pdf",
    applicants: 53117,
    admits: 31813,
    enrollees: 5315,
    undergraduateEnrollment: 24019,
    graduationRate: 0.813,
  },
  {
    unitId: 193900,
    sourceId: "nyu-cds-2025-26-final-july-2026",
    artifactKind: "xlsx",
    applicants: 114125,
    admits: 10340,
    enrollees: 5662,
    undergraduateEnrollment: 29471,
    graduationRate: 0.8788410886742757,
  },
  {
    unitId: 166027,
    sourceId: "harvard-cds-2025-26",
    artifactKind: "pdf",
    applicants: 47893,
    admits: 2003,
    enrollees: 1675,
    undergraduateEnrollment: 6738,
    graduationRate: 0.97080292,
  },
  {
    unitId: 186131,
    sourceId: "princeton-cds-2025-26",
    artifactKind: "pdf",
    applicants: 42303,
    admits: 1868,
    enrollees: 1408,
    undergraduateEnrollment: 5916,
    graduationRate: 0.97,
    tuitionInState: 68454,
    tuitionOutOfState: 68454,
  },
  {
    unitId: 228778,
    sourceId: "ut-austin-cds-2025-26",
    artifactKind: "pdf",
    applicants: 90690,
    admits: 20154,
    enrollees: 9900,
    undergraduateEnrollment: 44314,
    graduationRate: 0.892,
  },
  {
    unitId: 199120,
    sourceId: "unc-chapel-hill-cds-2025-26",
    artifactKind: "pdf",
    applicants: 76247,
    admits: 12751,
    enrollees: 5091,
    undergraduateEnrollment: 22007,
    graduationRate: 0.911,
  },
];

const excludedTuitionUnitIds = [
  123961, 236948, 145637, 122931, 122409, 110422, 166629, 193900, 166027,
  130794, 228778, 199120,
];

const readJson = (path) =>
  readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);

test("the reviewed institution cohort has 26 artifacts and 19 admission headlines", async () => {
  const [overlays, generated] = await Promise.all([
    readJson("../data/institution-overlays.json"),
    readJson("../data/colleges.json"),
  ]);
  const expectedSourceIds = [
    "asu-cds-2025-26",
    "calpoly-slo-cds-2025-26",
    "caltech-financial-aid-costs-2026-27",
    "caltech-registrar-enrollment-2025",
    "chapman-cds-2025-26",
    "duke-cds-2025-26",
    "gatech-cds-2025-26",
    "harvard-cds-2025-26",
    "illinois-cds-2025-26",
    "lmu-cds-2025-26",
    "mit-cds-2025-26",
    "northwestern-data-book-enrollment-2025",
    "northwestern-data-book-graduation-2018",
    "nyu-cds-2025-26-final-july-2026",
    "pomona-tuition-costs-2026-27",
    "princeton-cds-2025-26",
    "santa-clara-cds-2025-26",
    "sdsu-cds-2025-26",
    "stanford-cds-2025-26",
    "umass-amherst-cds-2025-26",
    "umich-cds-2025-26",
    "unc-chapel-hill-cds-2025-26",
    "usc-cds-2025-26",
    "ut-austin-cds-2025-26",
    "uw-seattle-cds-2025-26",
    "yale-cds-2025-26",
  ];
  const actualSourceIds = overlays.sources
    .map((source) => source.id)
    .sort();

  assert.deepEqual(actualSourceIds, expectedSourceIds);
  assert.equal(overlays.colleges.length, 24);
  assert.equal(
    overlays.colleges.filter((college) => college.observations.admitRate)
      .length,
    19,
  );
  assert.deepEqual(
    overlays.colleges
      .filter((college) => !college.observations.admitRate)
      .map((college) => college.unitId)
      .sort((left, right) => left - right),
    [110404, 121345, 130794, 147767, 198419],
    "Caltech, Pomona, Yale, Northwestern, and Duke omit a reviewed admission headline",
  );
  assert.equal(
    overlays.sources.find((source) => source.id === "illinois-cds-2025-26")
      .artifactKind,
    "xlsx",
  );
  assert.equal(
    overlays.sources.find(
      (source) => source.id === "nyu-cds-2025-26-final-july-2026",
    ).artifactKind,
    "xlsx",
  );
  for (const deferredSourcePrefix of [
    "columbia-",
    "purdue-",
    "uva-",
  ]) {
    assert.equal(
      overlays.sources.some((source) =>
        source.id.startsWith(deferredSourcePrefix),
      ),
      false,
      `${deferredSourcePrefix.slice(0, -1)} remains deferred until its scoped first-party artifacts are independently reviewed`,
    );
  }
  assert.equal(
    overlays.sources.some((source) => source.id === "cornell-cds-2025-26"),
    false,
    "the reviewed Cornell artifact is not published outside the fixed 50-college cohort",
  );
  assert.equal(
    generated.colleges.some((college) => college.unitId === 190415),
    false,
    "Cornell is not silently added to the fixed 50-college release",
  );
});

test("Purdue stays on the federal baseline while its first-party workbook blocks automated verification", async () => {
  const [overlays, generated] = await Promise.all([
    readJson("../data/institution-overlays.json"),
    readJson("../data/colleges.json"),
  ]);
  const purdue = generated.colleges.find((college) => college.unitId === 243780);

  assert.ok(purdue);
  assert.equal(
    overlays.sources.some((source) => source.id.startsWith("purdue-")),
    false,
  );
  assert.equal(
    overlays.colleges.some((college) => college.unitId === 243780),
    false,
  );
  assert.equal(purdue.observations.admitRate.value, 0.4987);
  assert.equal(purdue.observations.admitRate.reportingYear, 2024);
  assert.equal(purdue.observations.admitRate.periodLabel, "Fall 2024");
  for (const metric of [
    "admitRate",
    "undergraduateEnrollment",
    "graduationRate",
    "tuitionInState",
    "tuitionOutOfState",
  ]) {
    assert.equal(purdue.observations[metric].sourceId, federalSourceId);
  }
  for (const metric of ["applicants", "admits", "enrollees", "yieldRate"]) {
    assert.equal(purdue.observations[metric], null);
  }
});

test("Northwestern uses two pinned Data Book PDFs without changing admission or cost", async () => {
  const [overlays, generated] = await Promise.all([
    readJson("../data/institution-overlays.json"),
    readJson("../data/colleges.json"),
  ]);
  const overlaySources = new Map(
    overlays.sources.map((source) => [source.id, source]),
  );
  const overlay = overlays.colleges.find((college) => college.unitId === 147767);
  const college = generated.colleges.find((candidate) => candidate.unitId === 147767);
  const enrollmentSourceId = "northwestern-data-book-enrollment-2025";
  const graduationSourceId = "northwestern-data-book-graduation-2018";

  assert.ok(overlay);
  assert.ok(college);
  assert.equal(overlay.sourceId, enrollmentSourceId);
  assert.deepEqual(overlay.sourceIds, [enrollmentSourceId, graduationSourceId]);

  for (const [sourceId, expected] of [
    [
      enrollmentSourceId,
      {
        artifactSha256:
          "2d467ce2ca06641c6db8366dc4b38602236c634270901951c633293692e1f8e0",
        artifactUrl:
          "https://www.northwestern.edu/provost/about/ir/data-book/v58/t3.01-total_enrollment.pdf",
      },
    ],
    [
      graduationSourceId,
      {
        artifactSha256:
          "94bd83d16c1c3da6962807f7e6ce4af8a263d1c0e17211f2c1b5e2bf7219b9f4",
        artifactUrl:
          "https://www.northwestern.edu/provost/about/ir/data-book/v57/t4.02-graduation-rates.pdf",
      },
    ],
  ]) {
    const source = overlaySources.get(sourceId);
    assert.ok(source);
    assert.equal(source.artifactKind, "pdf");
    assert.equal(source.artifactSha256, expected.artifactSha256);
    assert.equal(source.artifactUrl, expected.artifactUrl);
    assert.equal(source.review.status, "approved");
    assert.equal(source.review.approvedSha256, expected.artifactSha256);
  }

  assert.deepEqual(Object.keys(overlay.observations).sort(), [
    "graduationRate",
    "undergraduateEnrollment",
  ]);
  assert.equal(overlay.observations.undergraduateEnrollment.value, 9318);
  assert.equal(
    overlay.observations.undergraduateEnrollment.sourceId,
    enrollmentSourceId,
  );
  assert.equal(
    overlay.observations.undergraduateEnrollment.periodLabel,
    "Fall 2025",
  );
  assert.equal(
    overlay.observations.undergraduateEnrollment.finality,
    "provisional",
  );
  assert.match(
    overlay.observations.undergraduateEnrollment.sourceField,
    /Table 3\.01 p\.3.*9,318/,
  );

  const exactGraduationRate = 1835 / 1929;
  assert.equal(overlay.observations.graduationRate.value, exactGraduationRate);
  assert.equal(overlay.observations.graduationRate.status, "derived");
  assert.equal(
    overlay.observations.graduationRate.sourceId,
    graduationSourceId,
  );
  assert.equal(
    overlay.observations.graduationRate.periodLabel,
    "Fall 2018 entering cohort",
  );
  assert.match(
    overlay.observations.graduationRate.sourceField,
    /1,835 \/ 1,929/,
  );

  assert.equal(college.observations.undergraduateEnrollment.value, 9318);
  assert.equal(
    college.observations.undergraduateEnrollment.sourceId,
    enrollmentSourceId,
  );
  assert.equal(college.observations.graduationRate.value, exactGraduationRate);
  assert.equal(
    college.observations.graduationRate.sourceId,
    graduationSourceId,
  );
  assert.equal(college.observations.graduationRate.status, "derived");

  assert.equal(college.alternateObservations.undergraduateEnrollment.value, 9201);
  assert.equal(
    college.alternateObservations.undergraduateEnrollment.sourceId,
    federalSourceId,
  );
  assert.equal(college.alternateObservations.graduationRate.value, 0.9513);
  assert.equal(
    college.alternateObservations.graduationRate.sourceId,
    federalSourceId,
  );

  assert.equal(college.observations.admitRate.value, 0.0769);
  assert.equal(college.observations.admitRate.sourceId, federalSourceId);
  for (const metric of ["applicants", "admits", "enrollees", "yieldRate"]) {
    assert.equal(overlay.observations[metric], undefined);
    assert.equal(college.observations[metric], null);
  }
  for (const metric of ["tuitionInState", "tuitionOutOfState"]) {
    assert.equal(overlay.observations[metric], undefined);
    assert.equal(college.observations[metric].value, 68322);
    assert.equal(college.observations[metric].sourceId, federalSourceId);
  }
});

test("Caltech and Pomona add only verifier-safe current fields and keep coherent federal admissions", async () => {
  const [overlays, generated] = await Promise.all([
    readJson("../data/institution-overlays.json"),
    readJson("../data/colleges.json"),
  ]);
  const overlaySources = new Map(
    overlays.sources.map((source) => [source.id, source]),
  );
  const overlayColleges = new Map(
    overlays.colleges.map((college) => [college.unitId, college]),
  );
  const generatedColleges = new Map(
    generated.colleges.map((college) => [college.unitId, college]),
  );

  for (const [sourceId, expected] of [
    [
      "caltech-registrar-enrollment-2025",
      {
        artifactSha256:
          "7b5985302b7530a771cc4ee1916c5b7c88cc32ecf28c5a633ad4beceb153beed",
        artifactUrl:
          "https://registrar.caltech.edu/records/enrollment-statistics",
      },
    ],
    [
      "caltech-financial-aid-costs-2026-27",
      {
        artifactSha256:
          "a197add41ecd482903c7174051a64564baeab99129aede51a541c192c3f0f3f5",
        artifactUrl: "https://www.finaid.caltech.edu/Costs",
      },
    ],
    [
      "pomona-tuition-costs-2026-27",
      {
        artifactSha256:
          "02a995ecc74dfc0a5fa3287a05ff1dcf1d6c108cdcdbb4b7acbf2ca136cbb76b",
        artifactUrl:
          "https://www.pomona.edu/administration/finance-office/student-accounts/tuition-and-costs",
      },
    ],
  ]) {
    const source = overlaySources.get(sourceId);
    assert.ok(source);
    assert.equal(source.artifactKind, "html");
    assert.equal(source.artifactSha256, expected.artifactSha256);
    assert.equal(source.artifactUrl, expected.artifactUrl);
    assert.equal(source.review.status, "approved");
    assert.equal(source.review.approvedSha256, expected.artifactSha256);
  }

  const caltechOverlay = overlayColleges.get(110404);
  const caltech = generatedColleges.get(110404);
  assert.ok(caltechOverlay);
  assert.ok(caltech);
  assert.deepEqual(caltechOverlay.sourceIds, [
    "caltech-registrar-enrollment-2025",
    "caltech-financial-aid-costs-2026-27",
  ]);
  assert.deepEqual(Object.keys(caltechOverlay.observations).sort(), [
    "tuitionInState",
    "tuitionOutOfState",
    "undergraduateEnrollment",
  ]);
  assert.equal(caltech.observations.undergraduateEnrollment.value, 971);
  assert.equal(
    caltech.observations.undergraduateEnrollment.sourceId,
    "caltech-registrar-enrollment-2025",
  );
  assert.equal(
    caltech.alternateObservations.undergraduateEnrollment.value,
    987,
  );
  assert.equal(
    caltech.alternateObservations.undergraduateEnrollment.sourceId,
    federalSourceId,
  );
  for (const metric of ["tuitionInState", "tuitionOutOfState"]) {
    assert.equal(caltech.observations[metric].value, 71229);
    assert.equal(
      caltech.observations[metric].sourceId,
      "caltech-financial-aid-costs-2026-27",
    );
    assert.equal(caltech.alternateObservations[metric].value, 65898);
    assert.equal(
      caltech.alternateObservations[metric].sourceId,
      federalSourceId,
    );
  }

  const pomonaOverlay = overlayColleges.get(121345);
  const pomona = generatedColleges.get(121345);
  assert.ok(pomonaOverlay);
  assert.ok(pomona);
  assert.deepEqual(Object.keys(pomonaOverlay.observations).sort(), [
    "tuitionInState",
    "tuitionOutOfState",
  ]);
  for (const metric of ["tuitionInState", "tuitionOutOfState"]) {
    assert.equal(pomona.observations[metric].value, 72080);
    assert.equal(
      pomona.observations[metric].sourceId,
      "pomona-tuition-costs-2026-27",
    );
    assert.equal(pomona.alternateObservations[metric].value, 65420);
    assert.equal(pomona.alternateObservations[metric].sourceId, federalSourceId);
  }
  assert.equal(pomona.observations.undergraduateEnrollment.value, 1666);
  assert.equal(
    pomona.observations.undergraduateEnrollment.sourceId,
    federalSourceId,
  );
  assert.equal(pomona.observations.graduationRate.value, 0.932);
  assert.equal(pomona.observations.graduationRate.sourceId, federalSourceId);

  for (const [name, overlay, college, expectedRate] of [
    ["Caltech", caltechOverlay, caltech, 0.0257],
    ["Pomona", pomonaOverlay, pomona, 0.0709],
  ]) {
    assert.equal(college.observations.admitRate.value, expectedRate);
    assert.equal(college.observations.admitRate.sourceId, federalSourceId);
    assert.equal(college.observations.admitRate.reportingYear, 2024);
    assert.equal(college.observations.admitRate.periodLabel, "Fall 2024");
    for (const metric of ["admitRate", "applicants", "admits", "enrollees", "yieldRate"]) {
      assert.equal(
        overlay.observations[metric],
        undefined,
        `${name} ${metric} is not overlaid from an incomplete current announcement`,
      );
    }
    for (const metric of ["applicants", "admits", "enrollees", "yieldRate"]) {
      assert.equal(college.observations[metric], null);
    }
  }

  for (const unsupportedSourceId of [
    "caltech-admissions-class-2030",
    "pomona-admissions-class-2030",
    "pomona-cds-2025-26",
  ]) {
    assert.equal(
      overlaySources.has(unsupportedSourceId),
      false,
      `${unsupportedSourceId} remains unregistered because it cannot support a coherent, verifier-safe current admission row`,
    );
  }
});

test("new reviewed admissions exactly match their approved PDF and XLSX records", async () => {
  const [overlays, generated] = await Promise.all([
    readJson("../data/institution-overlays.json"),
    readJson("../data/colleges.json"),
  ]);
  const overlaySources = new Map(
    overlays.sources.map((source) => [source.id, source]),
  );
  const overlayColleges = new Map(
    overlays.colleges.map((college) => [college.unitId, college]),
  );
  const generatedColleges = new Map(
    generated.colleges.map((college) => [college.unitId, college]),
  );

  for (const expected of reviewedAdmissionRecords) {
    const source = overlaySources.get(expected.sourceId);
    const overlay = overlayColleges.get(expected.unitId);
    const college = generatedColleges.get(expected.unitId);
    assert.ok(source, `${expected.sourceId} is present`);
    assert.ok(overlay, `overlay UNITID ${expected.unitId} is present`);
    assert.ok(college, `generated UNITID ${expected.unitId} is present`);
    assert.equal(source.artifactKind, expected.artifactKind);
    if (expected.artifactSha256 !== undefined) {
      assert.equal(source.artifactSha256, expected.artifactSha256);
      assert.equal(source.review.approvedSha256, expected.artifactSha256);
    }
    assert.equal(overlay.sourceId, expected.sourceId);

    for (const metric of [
      "admitRate",
      "applicants",
      "admits",
      "enrollees",
      "yieldRate",
      "undergraduateEnrollment",
      "graduationRate",
    ]) {
      assert.equal(
        college.observations[metric].sourceId,
        expected.sourceId,
        `UNITID ${expected.unitId} ${metric} uses the reviewed source`,
      );
    }
    for (const metric of ["applicants", "admits", "enrollees"]) {
      assert.equal(
        overlay.observations[metric].value,
        expected[metric],
        `UNITID ${expected.unitId} ${metric} remains pinned in the manifest`,
      );
      assert.equal(college.observations[metric].value, expected[metric]);
    }
    assert.equal(
      college.observations.undergraduateEnrollment.value,
      expected.undergraduateEnrollment,
    );
    assert.equal(
      college.observations.graduationRate.value,
      expected.graduationRate,
    );
    assert.equal(college.observations.admitRate.reportingYear, 2025);
    assert.equal(college.observations.admitRate.periodLabel, "Fall 2025");
    assert.ok(
      Math.abs(
        college.observations.admitRate.value -
          expected.admits / expected.applicants,
      ) < 1e-12,
    );
    assert.ok(
      Math.abs(
        college.observations.yieldRate.value -
          expected.enrollees / expected.admits,
      ) < 1e-12,
    );
    assert.equal(
      college.alternateObservations.admitRate.sourceId,
      federalSourceId,
      `UNITID ${expected.unitId} keeps the federal admit rate as alternate evidence`,
    );

    if (expected.tuitionInState !== undefined) {
      assert.equal(
        college.observations.tuitionInState.value,
        expected.tuitionInState,
      );
      assert.equal(
        college.observations.tuitionOutOfState.value,
        expected.tuitionOutOfState,
      );
      assert.equal(
        college.observations.tuitionInState.sourceId,
        expected.sourceId,
      );
      assert.equal(
        college.observations.tuitionOutOfState.sourceId,
        expected.sourceId,
      );
    }
  }
});

test("unsupported Duke and Yale admissions and deliberately excluded costs stay federal", async () => {
  const [overlays, generated] = await Promise.all([
    readJson("../data/institution-overlays.json"),
    readJson("../data/colleges.json"),
  ]);
  const overlayColleges = new Map(
    overlays.colleges.map((college) => [college.unitId, college]),
  );
  const generatedColleges = new Map(
    generated.colleges.map((college) => [college.unitId, college]),
  );
  for (const { name, unitId } of [
    { name: "Duke", unitId: 198419 },
    { name: "Yale", unitId: 130794 },
  ]) {
    const overlay = overlayColleges.get(unitId);
    const college = generatedColleges.get(unitId);
    assert.ok(overlay);
    assert.ok(college);
    for (const metric of ["admitRate", "applicants", "admits", "yieldRate"]) {
      assert.equal(
        overlay.observations[metric],
        undefined,
        `${name} ${metric} is deliberately absent from the reviewed overlay`,
      );
    }
    assert.equal(college.observations.admitRate.sourceId, federalSourceId);
    assert.equal(college.observations.admitRate.reportingYear, 2024);
  }
  assert.equal(
    generatedColleges.get(198419).observations.enrollees.sourceId,
    "duke-cds-2025-26",
  );

  for (const unitId of excludedTuitionUnitIds) {
    const overlay = overlayColleges.get(unitId);
    const college = generatedColleges.get(unitId);
    assert.ok(overlay);
    assert.ok(college);
    for (const metric of ["tuitionInState", "tuitionOutOfState"]) {
      assert.equal(
        overlay.observations[metric],
        undefined,
        `UNITID ${unitId} ${metric} is not overlaid without a supported 2026-2027 value`,
      );
      assert.equal(college.observations[metric].sourceId, federalSourceId);
      assert.equal(college.observations[metric].reportingYear, 2024);
      assert.equal(college.observations[metric].periodLabel, "2024-2025");
    }
  }
});
