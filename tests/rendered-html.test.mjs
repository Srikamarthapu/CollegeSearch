import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const coreObservationUnits = {
  admitRate: "ratio",
  undergraduateEnrollment: "count",
  averageNetPrice: "usd",
  graduationRate: "ratio",
  medianEarnings: "usd",
  tuitionInState: "usd",
  tuitionOutOfState: "usd",
};

const federalSourceId = "college-scorecard-institution-2026-06-10";
const federalArtifactUrl =
  "https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip";
const federalArtifactSha256 =
  "f56a181b000ca4914e924c16b6b81dcc656e25aeb2ac68ab7d271ac0f29ffd58";

const expectedAsuFederalAlternates = {
  admitRate: { unit: "ratio", sourceField: "ADM_RATE" },
  undergraduateEnrollment: { unit: "count", sourceField: "UGDS" },
  graduationRate: { unit: "ratio", sourceField: "C150_4" },
  medianEarnings: { unit: "usd", sourceField: "MD_EARN_WNE_P10" },
  tuitionInState: { unit: "usd", sourceField: "TUITIONFEE_IN" },
  tuitionOutOfState: { unit: "usd", sourceField: "TUITIONFEE_OUT" },
};

const ucHeadlineObservationUnits = {
  applicants: "count",
  admits: "count",
};

const ucFinalizedObservationUnits = {
  enrollees: "count",
  yieldRate: "ratio",
};

const allowedObservationStatuses = new Set([
  "reported",
  "derived",
  "suppressed",
  "unavailable",
  "stale",
]);

const expectedUcFall2025 = new Map([
  [110635, { campus: "Berkeley", applicants: 126830, admits: 14360, enrollees: 6688 }],
  [110644, { campus: "Davis", applicants: 102988, admits: 45673, enrollees: 6805 }],
  [110653, { campus: "Irvine", applicants: 124223, admits: 35658, enrollees: 6423 }],
  [110662, { campus: "Los Angeles", applicants: 145060, admits: 13659, enrollees: 6551 }],
  [110671, { campus: "Riverside", applicants: 70863, admits: 61312, enrollees: 6682 }],
  [110680, { campus: "San Diego", applicants: 136727, admits: 38457, enrollees: 7801 }],
  [110705, { campus: "Santa Barbara", applicants: 110173, admits: 42094, enrollees: 5081 }],
  [110714, { campus: "Santa Cruz", applicants: 66393, admits: 48122, enrollees: 4597 }],
  [445188, { campus: "Merced", applicants: 49366, admits: 46565, enrollees: 1982 }],
]);

const expectedUcFall2026 = new Map([
  [110635, { campus: "Berkeley", applicants: 133154, admits: 13967 }],
  [110644, { campus: "Davis", applicants: 104864, admits: 48015 }],
  [110653, { campus: "Irvine", applicants: 126005, admits: 38165 }],
  [110662, { campus: "Los Angeles", applicants: 146692, admits: 15903 }],
  [110671, { campus: "Riverside", applicants: 72542, admits: 63958 }],
  [110680, { campus: "San Diego", applicants: 141767, admits: 38571 }],
  [110705, { campus: "Santa Barbara", applicants: 108512, admits: 47716 }],
  [110714, { campus: "Santa Cruz", applicants: 79048, admits: 64867 }],
  [445188, { campus: "Merced", applicants: 49426, admits: 46812 }],
]);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "http://localhost"), {
      headers: {
        accept: "text/html",
        host: "localhost",
        "x-forwarded-proto": "http",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function assertObservation({
  observation,
  expectedUnit,
  label,
  sourcesById,
  mustHaveValue = true,
}) {
  assert.ok(observation && typeof observation === "object", `${label} exists`);
  assert.equal(observation.unit, expectedUnit, `${label} has the expected unit`);
  assert.ok(
    allowedObservationStatuses.has(observation.status),
    `${label} has a recognized status`,
  );
  assert.ok(
    Number.isInteger(observation.reportingYear),
    `${label} has an integer reporting year`,
  );
  assert.ok(observation.periodLabel, `${label} has an exact period label`);
  assert.ok(observation.finality, `${label} identifies snapshot finality`);
  assert.ok(observation.comparabilityKey, `${label} has a comparability key`);
  assert.match(observation.accessedOn, /^\d{4}-\d{2}-\d{2}$/, `${label} has an access date`);
  assert.match(observation.sourceUrl, /^https:\/\//, `${label} has an official source URL`);
  assert.ok(observation.sourceField, `${label} identifies the source field`);
  assert.ok(observation.cohort, `${label} identifies the cohort`);
  assert.ok(observation.definition, `${label} defines the metric`);

  const source = sourcesById.get(observation.sourceId);
  assert.ok(source, `${label} sourceId is registered in release.sources`);
  assert.equal(observation.publisher, source.publisher, `${label} publisher matches its release`);
  assert.equal(observation.sourceName, source.sourceName, `${label} source name matches its release`);
  assert.ok(
    observation.sourceUrl === (source.sourcePage || source.sourceUrl) ||
      source.sourceUrls?.includes(observation.sourceUrl),
    `${label} URL matches one of its registered sources`,
  );

  if (mustHaveValue) {
    assert.notEqual(observation.value, null, `${label} is not silently missing`);
    assert.ok(Number.isFinite(observation.value), `${label} has a finite value`);
  } else if (observation.value === null) {
    assert.ok(
      observation.status === "suppressed" || observation.status === "unavailable",
      `${label} keeps an explicit missing-data status`,
    );
  }
}

test("server-renders the CollegeSearch product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CollegeSearch<\/title>/i);
  assert.match(html, /Find a college you can/);
  assert.match(html, /College discovery, clearly sourced/);
  assert.match(html, /UC admissions/);
  assert.match(html, /Fall 2026/);
  assert.match(html, /College Scorecard/);
  assert.match(html, /Federal baseline \+ fields/);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("global responses prevent framing and set conservative browser policies", async () => {
  for (const pathname of ["/", "/explore"]) {
    const response = await render(pathname);

    assert.equal(
      response.headers.get("content-security-policy"),
      "frame-ancestors 'none'",
      `${pathname} prevents framing with CSP`,
    );
    assert.equal(
      response.headers.get("x-frame-options"),
      "DENY",
      `${pathname} prevents legacy framing`,
    );
    assert.equal(
      response.headers.get("x-content-type-options"),
      "nosniff",
      `${pathname} disables content-type sniffing`,
    );
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
      `${pathname} limits cross-origin referrer detail`,
    );
    assert.equal(
      response.headers.get("permissions-policy"),
      "camera=(), microphone=(), geolocation=()",
      `${pathname} disables unused sensitive browser features`,
    );
  }
});

test("account copy is student-facing and keeps the local-save boundary explicit", async () => {
  const source = await readFile(
    new URL("../app/components/auth/AuthDialog.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Accounts are not available in this preview yet\./);
  assert.match(
    source,
    /You can still search, compare, and save colleges on this\s+device\./,
  );
  assert.equal(
    source.match(
      /Saved colleges stay in this browser and are not synced\./g,
    )?.length,
    2,
  );
  assert.doesNotMatch(
    source,
    /pick up where you left off|keep your research together/i,
  );
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE|config\.missing/);
});

test("canonical discovery, evidence, comparison, and source routes render HTML", async () => {
  const routeCases = [
    {
      path: "/explore",
      markers: [
        /Search the evidence, not a ranking\./,
        /Field filters use 2024-2025 federal program and award data\./,
      ],
    },
    {
      path: "/colleges/university-of-california-berkeley",
      markers: [
        /UC Berkeley evidence profile · CollegeSearch/,
        /University of California-Berkeley/,
        /Official UC admissions record/,
        /Why two rates appear/,
      ],
    },
    {
      path: "/compare?colleges=110635,243744",
      markers: [
        /Compare the record, not a ranking\./,
        /UC Berkeley/,
        /Stanford/,
        /different definitions or reporting periods/,
      ],
    },
    {
      path: "/methodology",
      markers: [
        /Methodology · CollegeSearch/,
        /Every number should explain itself\./,
        /A suppressed or unavailable value remains missing; it never/,
      ],
    },
    {
      path: "/data-sources",
      markers: [
        /Data sources · CollegeSearch/,
        /Primary sources, plainly labeled\./,
        /Linked, not yet normalized/,
      ],
    },
    {
      path: "/majors",
      markers: [
        /Broad fields of study · CollegeSearch/,
        /Start with a field\. Keep the claim honest\./,
        /A zero and a missing record mean different things\./,
      ],
    },
    {
      path: "/match",
      markers: [
        /Preference match · CollegeSearch/,
        /A college list with reasons attached\./,
        /Fit and admission likelihood are different questions\./,
      ],
    },
    {
      path: "/chances",
      markers: [
        /Admit-rate context · CollegeSearch/,
        /Read the rate\. Keep its limits in view\./,
        /No “87% chance\.” No reach, target, or safety labels\./,
      ],
    },
    {
      path: "/saved",
      markers: [/Saved colleges \| CollegeSearch/, /Saved on this device\./],
    },
    {
      path: "/account",
      markers: [
        /Account \| CollegeSearch/,
        /A clear boundary for your account\./,
        /does not claim to[\s\S]*sync saved colleges/,
      ],
    },
    {
      path: "/privacy",
      markers: [
        /Privacy \| CollegeSearch/,
        /Your college list is yours\./,
        /No academic profile is collected in this release\./,
      ],
    },
    {
      path: "/data-health",
      markers: [
        /Data health \| CollegeSearch/,
        /What is current—and what is still a baseline\./,
        /Known refresh work is visible, not hidden\./,
      ],
    },
  ];

  for (const route of routeCases) {
    const response = await render(route.path);
    assert.equal(response.status, 200, `${route.path} returns 200`);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^text\/html\b/i,
      `${route.path} returns HTML`,
    );
    const html = await response.text();
    for (const marker of route.markers) {
      assert.match(html, marker, `${route.path} includes its canonical content`);
    }
    assert.doesNotMatch(
      html,
      /404: This page could not be found|Internal Server Error/i,
      `${route.path} does not render an error shell`,
    );
  }
});

test("the published cohort has complete, source-registered observations", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
  );

  assert.equal(payload.release.institutionCount, 50);
  assert.equal(payload.colleges.length, 50);
  assert.equal(payload.release.publisher, "U.S. Department of Education");
  assert.equal(payload.release.sourceName, "College Scorecard");
  assert.equal(payload.release.institutionMetricsYear, undefined);
  assert.equal(payload.release.earningsCohortYear, undefined);
  assert.equal(payload.release.metricPeriods.admissions.reportingYear, 2024);
  assert.equal(
    payload.release.metricPeriods.admissions.revisionStatus,
    "provisional",
  );
  assert.equal(
    payload.release.metricPeriods.medianEarnings.sourceFields[0],
    "MD_EARN_WNE_4YR",
  );
  assert.equal(
    payload.release.metricPeriods.medianEarnings.periodLabel,
    "2022-23 earnings",
  );
  assert.match(payload.release.sourceUrl, /^https:\/\/collegescorecard\.ed\.gov\//);
  assert.match(
    payload.release.notes,
    /UC headline admit rates use official preliminary Fall 2026 UC Admissions campus snapshots as of June 2026/i,
  );
  assert.match(
    payload.release.notes,
    /Broad field filters pair a provisional 2024-2025 bachelor's-program indicator with the field's share of all awards; neither is a major-specific admit rate/i,
  );

  const sourcesById = new Map(
    payload.release.sources.map((source) => [source.id, source]),
  );
  assert.equal(sourcesById.size, payload.release.sources.length);
  assert.ok(sourcesById.has(federalSourceId));
  assert.ok(sourcesById.has("uc-admissions-fall-2026-snapshots"));
  assert.ok(sourcesById.has("uc-accountability-2026-chapter-2"));
  assert.ok(sourcesById.has("asu-cds-2025-26"));

  const federalSource = sourcesById.get(federalSourceId);
  assert.equal(federalSource.publisher, "U.S. Department of Education");
  assert.equal(
    federalSource.sourceName,
    "College Scorecard — June 2026 institution release",
  );
  assert.equal(federalSource.releaseDate, "2026-06-10");
  assert.equal(federalSource.artifactUrl, federalArtifactUrl);
  assert.equal(federalSource.artifactSha256, federalArtifactSha256);
  assert.ok(federalSource.sourceUrls.includes(federalArtifactUrl));
  assert.ok(
    federalSource.sourceUrls.includes(
      "https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx",
    ),
  );

  const unitIds = payload.colleges.map((college) => college.unitId);
  assert.equal(new Set(unitIds).size, 50);

  for (const college of payload.colleges) {
    assert.ok(Number.isInteger(college.unitId), `${college.name} has a UNITID`);
    assert.match(college.opeId, /^\d{8}$/, `${college.name} has an eight-digit OPEID`);
    assert.match(college.opeId6, /^\d{6}$/, `${college.name} has a six-digit OPEID`);
    assert.ok(
      college.opeId.startsWith(college.opeId6),
      `${college.name} OPE identity fields agree`,
    );
    assert.equal(college.mainCampus, true, `${college.name} is the main campus record`);
    assert.equal(
      college.currentlyOperating,
      true,
      `${college.name} is currently operating`,
    );
    assert.ok(
      Number.isInteger(college.branchCount) && college.branchCount >= 1,
      `${college.name} retains a valid federal branch count`,
    );
    assert.ok(college.slug, `${college.name} has a canonical slug`);
    assert.ok(college.name, "College name is present");
    assert.ok(college.city && college.state, `${college.name} has a location`);
    assert.match(college.website, /^https:\/\//, `${college.name} has an HTTPS website`);
    assert.ok(
      !Object.hasOwn(college, "admitRate") &&
        !Object.hasOwn(college, "graduationRate") &&
        !Object.hasOwn(college, "averageNetPrice"),
      `${college.name} uses observations instead of untracked flat metrics`,
    );
    assert.ok(
      college.observations && college.alternateObservations,
      `${college.name} has primary and alternate observation containers`,
    );

    for (const [key, expectedUnit] of Object.entries(coreObservationUnits)) {
      assertObservation({
        observation: college.observations[key],
        expectedUnit,
        label: `${college.name} ${key}`,
        sourcesById,
      });
    }

    const admitRate = college.observations.admitRate.value;
    const graduationRate = college.observations.graduationRate.value;
    assert.ok(admitRate > 0 && admitRate <= 1, `${college.name} has a valid admit rate`);
    assert.ok(
      graduationRate > 0 && graduationRate <= 1,
      `${college.name} has a valid graduation rate`,
    );
    assert.ok(
      college.observations.averageNetPrice.value >= 0,
      `${college.name} has a non-negative net price`,
    );
    assert.ok(
      college.observations.undergraduateEnrollment.value > 0,
      `${college.name} has undergraduate enrollment`,
    );
    assert.ok(college.majors.length > 0, `${college.name} has major evidence`);
    for (const major of college.majors) {
      const label = `${college.name} ${major.name}`;
      assert.match(
        major.evidence,
        /^Broad federal bachelor's field(?: · exclusively distance education)?$/,
        `${label} labels its evidence and delivery modality`,
      );
      if (major.deliveryMode === "exclusively-distance") {
        assert.match(
          major.evidence,
          /exclusively distance education/,
          `${label} discloses distance-only delivery`,
        );
      }
      assert.equal(major.reportingYear, 2025, `${label} identifies the federal reporting year`);
      assert.equal(
        major.periodLabel,
        "2024-2025 programs and awards",
        `${label} identifies the exact evidence period`,
      );
      assert.equal(major.sourceId, federalSourceId, `${label} uses the registered federal release`);
      const sourceFields = major.sourceField.match(/^PCIP(\d{2}) \+ CIP(\d{2})BACHL$/);
      assert.ok(sourceFields, `${label} identifies both award share and bachelor's availability fields`);
      assert.equal(sourceFields[1], sourceFields[2], `${label} source fields use the same CIP family`);
      assert.equal(major.bachelorsAvailable, true, `${label} is available at the bachelor's level`);
      assert.ok(
        Number.isFinite(major.share) && major.share >= 0 && major.share <= 1,
        `${label} has a valid award share, including an explicit zero-award value`,
      );
      assert.ok(major.cohort, `${label} identifies the award cohort`);
      assert.ok(major.definition, `${label} defines the field evidence`);
    }
  }
});

test("all nine UC headlines use Fall 2026 snapshots without mixing Fall 2025 yield", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
  );
  const sourcesById = new Map(
    payload.release.sources.map((source) => [source.id, source]),
  );
  const headlineSource = sourcesById.get("uc-admissions-fall-2026-snapshots");
  const finalizedSource = sourcesById.get("uc-accountability-2026-chapter-2");

  assert.ok(headlineSource);
  assert.equal(headlineSource.publisher, "University of California");
  assert.equal(headlineSource.reportingYear, 2026);
  assert.equal(
    headlineSource.cohort,
    "Fall 2026 preliminary first-year admission snapshot",
  );
  assert.equal(headlineSource.finality, "provisional");
  assert.equal(headlineSource.revisionStatus, "provisional");
  assert.equal(headlineSource.sourceAsOf, "2026-06");
  assert.equal(headlineSource.sourceUrls.length, 10);
  assert.equal(headlineSource.sourceHashes.length, 10);
  assert.match(headlineSource.notes, /preliminary as of June 2026/i);
  assert.match(headlineSource.notes, /must not be summed/i);
  assert.ok(finalizedSource);
  assert.equal(finalizedSource.reportingYear, 2025);
  assert.equal(finalizedSource.sourceSheet, "2.1.1");
  assert.match(finalizedSource.workbookSha256, /^[a-f0-9]{64}$/);

  const ucColleges = payload.colleges.filter((college) =>
    expectedUcFall2026.has(college.unitId),
  );
  assert.equal(ucColleges.length, 9);

  for (const college of ucColleges) {
    const current = expectedUcFall2026.get(college.unitId);
    const finalized = expectedUcFall2025.get(college.unitId);
    assert.ok(current && finalized, `${college.name} has current and finalized rows`);
    assert.match(college.name, new RegExp(current.campus.replace(" ", "[- ]"), "i"));

    assertObservation({
      observation: college.observations.admitRate,
      expectedUnit: "ratio",
      label: `${college.name} headline admit rate`,
      sourcesById,
    });
    assert.equal(college.observations.admitRate.reportingYear, 2026);
    assert.equal(
      college.observations.admitRate.sourceId,
      "uc-admissions-fall-2026-snapshots",
    );

    for (const [key, expectedUnit] of Object.entries(ucHeadlineObservationUnits)) {
      assertObservation({
        observation: college.observations[key],
        expectedUnit,
        label: `${college.name} ${key}`,
        sourcesById,
      });
      assert.equal(
        college.observations[key].reportingYear,
        2026,
        `${college.name} ${key} uses Fall 2026`,
      );
      assert.equal(
        college.observations[key].sourceId,
        "uc-admissions-fall-2026-snapshots",
        `${college.name} ${key} uses the current UC campus snapshot`,
      );
    }

    for (const [key, expectedUnit] of Object.entries(ucFinalizedObservationUnits)) {
      assertObservation({
        observation: college.observations[key],
        expectedUnit,
        label: `${college.name} finalized ${key}`,
        sourcesById,
      });
      assert.equal(college.observations[key].reportingYear, 2025);
      assert.equal(
        college.observations[key].sourceId,
        "uc-accountability-2026-chapter-2",
      );
    }

    assert.equal(college.observations.applicants.value, current.applicants);
    assert.equal(college.observations.admits.value, current.admits);
    assert.equal(college.observations.enrollees.value, finalized.enrollees);
    assert.equal(college.observations.admitRate.status, "derived");
    assert.equal(college.observations.yieldRate.status, "derived");
    assert.ok(
      Math.abs(
        college.observations.admitRate.value -
          current.admits / current.applicants,
      ) < Number.EPSILON,
      `${college.name} admit rate is admits divided by applicants`,
    );
    assert.ok(
      Math.abs(
        college.observations.yieldRate.value -
          finalized.enrollees / finalized.admits,
      ) < Number.EPSILON,
      `${college.name} yield is enrollees divided by admits`,
    );

    assertObservation({
      observation: college.alternateObservations.admitRate,
      expectedUnit: "ratio",
      label: `${college.name} alternate federal admit rate`,
      sourcesById,
    });
    assert.equal(
      college.alternateObservations.admitRate.sourceId,
      federalSourceId,
    );
    assert.equal(college.alternateObservations.admitRate.reportingYear, 2024);
  }

  const firstPartyOverlayUnitIds = new Set([104151, 166683, 243744]);
  const nonUcColleges = payload.colleges.filter(
    (college) =>
      !expectedUcFall2026.has(college.unitId) &&
      !firstPartyOverlayUnitIds.has(college.unitId),
  );
  assert.equal(nonUcColleges.length, 38);
  for (const college of nonUcColleges) {
    assert.equal(college.observations.admitRate.sourceId, federalSourceId);
    assert.equal(college.observations.admitRate.reportingYear, 2024);
    for (const key of [
      ...Object.keys(ucHeadlineObservationUnits),
      ...Object.keys(ucFinalizedObservationUnits),
    ]) {
      assert.equal(
        college.observations[key],
        null,
        `${college.name} does not receive invented UC ${key} evidence`,
      );
    }
  }
});

test("ASU uses its latest official campus-immersion record and keeps the federal alternate", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
  );
  const sourcesById = new Map(
    payload.release.sources.map((source) => [source.id, source]),
  );
  const asu = payload.colleges.find((college) => college.unitId === 104151);

  assert.ok(asu);
  for (const [key, expectedUnit] of Object.entries({
    admitRate: "ratio",
    applicants: "count",
    admits: "count",
    enrollees: "count",
    yieldRate: "ratio",
    undergraduateEnrollment: "count",
    graduationRate: "ratio",
    tuitionInState: "usd",
    tuitionOutOfState: "usd",
  })) {
    assertObservation({
      observation: asu.observations[key],
      expectedUnit,
      label: `ASU official ${key}`,
      sourcesById,
    });
    assert.equal(asu.observations[key].sourceId, "asu-cds-2025-26");
  }
  assert.equal(asu.observations.admitRate.reportingYear, 2025);
  assert.equal(asu.observations.applicants.value, 69617);
  assert.equal(asu.observations.admits.value, 61533);
  assert.equal(asu.observations.enrollees.value, 13665);
  assert.equal(asu.observations.undergraduateEnrollment.value, 64662);
  assert.equal(asu.observations.graduationRate.value, 0.693);
  assert.equal(asu.observations.tuitionInState.value, 13534);
  assert.equal(asu.observations.tuitionOutOfState.value, 37072);
  assert.equal(asu.observations.tuitionInState.reportingYear, 2026);
  assert.equal(asu.observations.tuitionOutOfState.reportingYear, 2026);
  assert.equal(asu.observations.tuitionInState.periodLabel, "2026-2027");
  assert.equal(asu.observations.tuitionOutOfState.periodLabel, "2026-2027");
  assert.equal(
    asu.observations.tuitionInState.sourceField,
    "CDS G1: $12,527 in-state tuition + $1,007 required fees",
  );
  assert.equal(
    asu.observations.tuitionOutOfState.sourceField,
    "CDS G1: $36,065 out-of-state tuition + $1,007 required fees",
  );
  assert.ok(
    Math.abs(asu.observations.admitRate.value - 61533 / 69617) < 1e-9,
    "ASU's derived admit rate agrees with its reported counts to at least nine decimal places",
  );
  assert.deepEqual(
    Object.keys(asu.alternateObservations).sort(),
    Object.keys(expectedAsuFederalAlternates).sort(),
    "ASU retains every federal observation replaced by campus-specific evidence",
  );
  for (const [key, expected] of Object.entries(expectedAsuFederalAlternates)) {
    const alternate = asu.alternateObservations[key];
    assertObservation({
      observation: alternate,
      expectedUnit: expected.unit,
      label: `ASU alternate federal ${key}`,
      sourcesById,
    });
    assert.equal(alternate.sourceId, federalSourceId);
    assert.equal(alternate.sourceField, expected.sourceField);
  }
  assert.equal(asu.alternateObservations.admitRate.value, 0.8989);
  assert.equal(asu.alternateObservations.undergraduateEnrollment.value, 64674);
  assert.equal(asu.alternateObservations.graduationRate.value, 0.6804);
  assert.equal(asu.alternateObservations.medianEarnings.value, 62668);
  assert.equal(asu.alternateObservations.tuitionInState.value, 12223);
  assert.equal(asu.alternateObservations.tuitionOutOfState.value, 33139);
});

test("Stanford and MIT use reviewed current Common Data Set records", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
  );
  const sourcesById = new Map(
    payload.release.sources.map((source) => [source.id, source]),
  );
  const expected = [
    {
      unitId: 243744,
      sourceId: "stanford-cds-2025-26",
      applicants: 60646,
      admits: 2302,
      enrollees: 1839,
      enrollment: 7346,
      graduationRate: 0.9164,
      tuition: 68574,
    },
    {
      unitId: 166683,
      sourceId: "mit-cds-2025-26",
      applicants: 29281,
      admits: 1334,
      enrollees: 1152,
      enrollment: 4561,
      graduationRate: 0.96,
      tuition: 67140,
    },
  ];

  for (const record of expected) {
    const college = payload.colleges.find(
      (candidate) => candidate.unitId === record.unitId,
    );
    assert.ok(college);
    for (const key of [
      "admitRate",
      "applicants",
      "admits",
      "enrollees",
      "undergraduateEnrollment",
      "graduationRate",
      "tuitionInState",
      "tuitionOutOfState",
    ]) {
      assert.equal(college.observations[key].sourceId, record.sourceId);
      assert.ok(sourcesById.has(record.sourceId));
    }
    assert.equal(college.observations.applicants.value, record.applicants);
    assert.equal(college.observations.admits.value, record.admits);
    assert.equal(college.observations.enrollees.value, record.enrollees);
    assert.equal(
      college.observations.undergraduateEnrollment.value,
      record.enrollment,
    );
    assert.equal(
      college.observations.graduationRate.value,
      record.graduationRate,
    );
    assert.equal(college.observations.tuitionInState.value, record.tuition);
    assert.equal(college.observations.tuitionOutOfState.value, record.tuition);
    assert.equal(college.observations.admitRate.reportingYear, 2025);
    assert.equal(college.observations.tuitionInState.reportingYear, 2026);
    assert.equal(college.observations.tuitionInState.periodLabel, "2026-2027");
    assert.equal(college.alternateObservations.admitRate.sourceId, federalSourceId);
  }
});
