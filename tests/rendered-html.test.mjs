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

const ucCountObservationUnits = {
  applicants: "count",
  admits: "count",
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
  assert.match(observation.accessedOn, /^\d{4}-\d{2}-\d{2}$/, `${label} has an access date`);
  assert.match(observation.sourceUrl, /^https:\/\//, `${label} has an official source URL`);
  assert.ok(observation.sourceField, `${label} identifies the source field`);
  assert.ok(observation.cohort, `${label} identifies the cohort`);
  assert.ok(observation.definition, `${label} defines the metric`);

  const source = sourcesById.get(observation.sourceId);
  assert.ok(source, `${label} sourceId is registered in release.sources`);
  assert.equal(observation.publisher, source.publisher, `${label} publisher matches its release`);
  assert.equal(observation.sourceName, source.sourceName, `${label} source name matches its release`);
  assert.equal(
    observation.sourceUrl,
    source.sourcePage || source.sourceUrl,
    `${label} URL matches its registered source`,
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

test("server-renders the College Compass product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>College Compass<\/title>/i);
  assert.match(html, /Find a college you can/);
  assert.match(html, /College discovery, with receipts/);
  assert.match(html, /UC freshman admissions/);
  assert.match(html, /Fall 2025/);
  assert.match(html, /College Scorecard/);
  assert.match(html, /Recent degree-completion shares/);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("canonical discovery, evidence, comparison, and source routes render HTML", async () => {
  const routeCases = [
    {
      path: "/explore",
      markers: [
        /Search the evidence, not a ranking\./,
        /Major filters show degree evidence—not a major admit rate\./,
      ],
    },
    {
      path: "/colleges/university-of-california-berkeley",
      markers: [
        /UC Berkeley evidence profile · College Compass/,
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
        /different publishers or years/,
      ],
    },
    {
      path: "/methodology",
      markers: [
        /Methodology · College Compass/,
        /Every number should explain itself\./,
        /A suppressed or unavailable value remains missing; it never/,
      ],
    },
    {
      path: "/data-sources",
      markers: [
        /Data sources · College Compass/,
        /Primary sources, plainly labeled\./,
        /Linked, not yet normalized/,
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
  assert.equal(payload.release.institutionMetricsYear, 2024);
  assert.equal(payload.release.earningsCohortYear, 2020);
  assert.match(payload.release.sourceUrl, /^https:\/\/collegescorecard\.ed\.gov\//);
  assert.match(
    payload.release.notes,
    /UC headline admit rates use official Fall 2025 campus counts/i,
  );
  assert.match(
    payload.release.notes,
    /Major evidence reflects recent federal degree-completion shares and is not a major-specific admit rate/i,
  );

  const sourcesById = new Map(
    payload.release.sources.map((source) => [source.id, source]),
  );
  assert.equal(sourcesById.size, payload.release.sources.length);
  assert.ok(sourcesById.has("college-scorecard-2024"));
  assert.ok(sourcesById.has("uc-accountability-2026-chapter-2"));

  const unitIds = payload.colleges.map((college) => college.unitId);
  assert.equal(new Set(unitIds).size, 50);

  for (const college of payload.colleges) {
    assert.ok(Number.isInteger(college.unitId), `${college.name} has a UNITID`);
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
    assert.ok(
      college.majors.every(
        (major) =>
          major.evidence === "Recent degree completions" &&
          major.share > 0 &&
          major.share <= 1,
      ),
      `${college.name} labels broad federal degree-share evidence`,
    );
  }
});

test("all nine UC headline rates are derived from the official Fall 2025 counts", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
  );
  const sourcesById = new Map(
    payload.release.sources.map((source) => [source.id, source]),
  );
  const ucSource = sourcesById.get("uc-accountability-2026-chapter-2");

  assert.ok(ucSource);
  assert.equal(ucSource.publisher, "University of California");
  assert.equal(ucSource.reportingYear, 2025);
  assert.equal(ucSource.sourceSheet, "2.1.1");
  assert.equal(ucSource.cohort, "Fall 2025 freshman applicants");
  assert.match(ucSource.sourceUrl, /chapter02data2026\.xlsx$/);
  assert.match(ucSource.sourcePage, /accountability\.universityofcalifornia\.edu\/2026\/chapters\/chapter-2\.html$/);
  assert.match(ucSource.workbookSha256, /^[a-f0-9]{64}$/);

  const ucColleges = payload.colleges.filter((college) =>
    expectedUcFall2025.has(college.unitId),
  );
  assert.equal(ucColleges.length, 9);

  for (const college of ucColleges) {
    const expected = expectedUcFall2025.get(college.unitId);
    assert.ok(expected, `${college.name} has an expected UC row`);
    assert.match(college.name, new RegExp(expected.campus.replace(" ", "[- ]"), "i"));

    for (const [key, expectedUnit] of Object.entries(ucCountObservationUnits)) {
      assertObservation({
        observation: college.observations[key],
        expectedUnit,
        label: `${college.name} ${key}`,
        sourcesById,
      });
      assert.equal(
        college.observations[key].reportingYear,
        2025,
        `${college.name} ${key} uses Fall 2025`,
      );
      assert.equal(
        college.observations[key].sourceId,
        "uc-accountability-2026-chapter-2",
        `${college.name} ${key} uses the UC workbook release`,
      );
    }

    assert.equal(college.observations.applicants.value, expected.applicants);
    assert.equal(college.observations.admits.value, expected.admits);
    assert.equal(college.observations.enrollees.value, expected.enrollees);
    assert.equal(college.observations.admitRate.status, "derived");
    assert.equal(college.observations.yieldRate.status, "derived");
    assert.ok(
      Math.abs(
        college.observations.admitRate.value -
          expected.admits / expected.applicants,
      ) < Number.EPSILON,
      `${college.name} admit rate is admits divided by applicants`,
    );
    assert.ok(
      Math.abs(
        college.observations.yieldRate.value -
          expected.enrollees / expected.admits,
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
      "college-scorecard-2024",
    );
    assert.equal(college.alternateObservations.admitRate.reportingYear, 2024);
  }

  const nonUcColleges = payload.colleges.filter(
    (college) => !expectedUcFall2025.has(college.unitId),
  );
  assert.equal(nonUcColleges.length, 41);
  for (const college of nonUcColleges) {
    assert.equal(college.observations.admitRate.sourceId, "college-scorecard-2024");
    assert.equal(college.observations.admitRate.reportingYear, 2024);
    for (const key of Object.keys(ucCountObservationUnits)) {
      assert.equal(
        college.observations[key],
        null,
        `${college.name} does not receive invented UC ${key} evidence`,
      );
    }
  }
});
