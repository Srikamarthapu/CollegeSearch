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

function hasReviewedInstitutionRecord(college) {
  return Object.values(college.observations).some(
    (observation) =>
      observation &&
      observation.sourceId !== federalSourceId &&
      !observation.sourceId.startsWith("uc-"),
  );
}

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
  }

  if (observation.value === null) {
    assert.ok(
      observation.status === "suppressed" || observation.status === "unavailable",
      `${label} keeps an explicit missing-data status`,
    );
  } else {
    assert.ok(Number.isFinite(observation.value), `${label} has a finite value`);
    assert.ok(
      observation.status === "reported" || observation.status === "derived" || observation.status === "stale",
      `${label} has a status consistent with a reported value`,
    );
  }
}

test("server-renders the CollegeSearch product shell", async () => {
  const [response, payload] = await Promise.all([
    render(),
    readFile(new URL("../data/colleges.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
  ]);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CollegeSearch<\/title>/i);
  assert.match(html, /Find a college(?:<[^>]*>|\s)*that fits you\./);
  assert.match(html, /YOUR COLLEGE SEARCH/);
  assert.match(html, /UC admissions/);
  assert.match(html, /Fall 2026/);
  assert.match(html, /College Scorecard/);
  assert.match(html, /Federal baseline metrics use their own dated cohorts/);
  const firstPartyAdmissions = payload.colleges.filter(
    (college) => college.observations.admitRate.sourceId !== federalSourceId,
  ).length;
  const reviewedCollegeAdmissions = payload.colleges.filter(
    (college) =>
      college.observations.admitRate.sourceId !== federalSourceId &&
      !college.observations.admitRate.sourceId.startsWith("uc-"),
  ).length;
  const reviewedInstitutionRecords = payload.colleges.filter(
    hasReviewedInstitutionRecord,
  ).length;
  const federalAdmissionBaselines =
    payload.colleges.length - firstPartyAdmissions;
  assert.equal(reviewedInstitutionRecords, 24);
  assert.equal(reviewedCollegeAdmissions, 19);
  assert.equal(firstPartyAdmissions, 28);
  assert.equal(federalAdmissionBaselines, payload.colleges.length - 28);
  assert.match(
    html,
    new RegExp(
      `${firstPartyAdmissions}(?:<!-- -->)? first-party admission headlines`,
    ),
  );
  assert.match(
    html,
    new RegExp(
      `${reviewedInstitutionRecords}(?:<!-- -->)? reviewed institution records`,
    ),
  );
  assert.match(
    html,
    new RegExp(
      `${reviewedCollegeAdmissions}(?:(?:<!-- -->)|\\s)*college admission headlines`,
    ),
  );
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("headline costs show Stanford tuition and fees instead of the historical aid-cohort average", async () => {
  const response = await render("/colleges/stanford-university");
  assert.equal(response.status, 200);
  const html = await response.text();
  const overview = html.match(/<div class="profile-overview"[\s\S]*?<\/div>\s*<p class="profile-cost-context"/)?.[0];
  assert.ok(overview, "the profile exposes a distinct cost overview");
  assert.match(overview, /Published tuition \+ required fees \/ year/);
  assert.match(overview, /\$68,574/);
  assert.match(overview, /2026-2027/);
  assert.doesNotMatch(overview, /\$13,807/);
  assert.match(html, /Housing, meals, and other living costs are extra/);
  assert.match(html, /Historical average net price/);
  assert.match(html, /\$13,807/);
});

test("global HTML responses enforce one fresh nonce on every executable block", async () => {
  const observedNonces = [];

  for (const pathname of ["/", "/explore"]) {
    const response = await render(pathname);
    const html = await response.text();
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonceMatch = policy.match(/'nonce-([A-Za-z0-9_-]{16,128})'/);

    assert.ok(nonceMatch, `${pathname} has a URL-safe CSP nonce`);
    const nonce = nonceMatch[1];
    observedNonces.push(nonce);
    assert.match(html, new RegExp(`<meta property="csp-nonce" nonce="${nonce}"`), "Vite dynamic style modules receive the document nonce");

    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /script-src 'self' 'nonce-/);
    assert.match(policy, /script-src-elem 'self' 'nonce-/);
    assert.doesNotMatch(policy, /'strict-dynamic'/);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
    assert.match(policy, /script-src-attr 'none'/);
    assert.match(policy, /style-src-attr 'unsafe-inline'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /base-uri 'none'/);
    assert.match(policy, /form-action 'self'/);
    assert.match(policy, /frame-src 'none'/);
    assert.match(policy, /frame-ancestors 'none'/);

    const executableBlocks = [
      ...html.matchAll(/<(script|style)\b([^>]*)>/gi),
    ];
    assert.ok(
      executableBlocks.some(([, element]) => element.toLowerCase() === "script"),
      `${pathname} has framework hydration scripts`,
    );
    for (const [, element, attributes] of executableBlocks) {
      assert.match(
        attributes,
        new RegExp(`\\bnonce=["']${nonce}["']`),
        `${pathname} ${element} uses its response nonce`,
      );
    }

    // React 19/Vinext emits some modulepreload hints without nonce attributes.
    // Keeping 'self' (and deliberately omitting strict-dynamic) allows only
    // these local module files while inline executable blocks still need nonce.
    const modulePreloads = [
      ...html.matchAll(
        /<link\b(?=[^>]*\brel=["']modulepreload["'])([^>]*)>/gi,
      ),
    ];
    assert.ok(modulePreloads.length > 0, `${pathname} preloads its module entry`);
    for (const [, attributes] of modulePreloads) {
      assert.match(
        attributes,
        /\bhref=["']\/(?:assets|_next\/static\/chunks)\/[A-Za-z0-9._-]+\.js["']/,
        `${pathname} module preload stays on the content-hashed local asset path`,
      );
    }

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
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
      `${pathname} disables unused sensitive browser features`,
    );
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-cache, no-store, must-revalidate, max-age=0",
      `${pathname} prevents caching of its request-specific nonce`,
    );
  }

  assert.notEqual(
    observedNonces[0],
    observedNonces[1],
    "separate document requests never reuse a nonce",
  );
});

test("auth redirects inherit CSP and reject an external next destination", async () => {
  const response = await render(
    "/auth/callback?code=untrusted&next=https%3A%2F%2Fevil.example%2F",
  );

  assert.equal(response.status, 307);
  const target = new URL(response.headers.get("location"));
  assert.equal(target.origin, "http://localhost");
  assert.equal(target.pathname, "/auth/auth-code-error");
  assert.ok(["configuration", "exchange"].includes(target.searchParams.get("reason")));
  assert.equal(target.searchParams.has("next"), false);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  );
  assert.deepEqual(
    response.headers.get("cache-control").split(",").map((part) => part.trim()).sort(),
    ["private", "no-cache", "no-store", "must-revalidate", "max-age=0"].sort(),
    "auth redirects cannot be cached with a request-specific nonce",
  );
});

test("account copy is student-facing and keeps the local-save boundary explicit", async () => {
  const source = await readFile(
    new URL("../app/components/auth/AuthDialog.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Accounts are not available in this preview yet\./);
  assert.match(
    source,
    /You can still search, compare, and save colleges on this\s+browser profile\./,
  );
  assert.match(
    source,
    /Existing browser-only saves remain separate until you explicitly import them\./,
  );
  assert.match(
    source,
    /Existing browser-only saves are never imported automatically\./,
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
      path: "/compare?colleges=180203,485500&major=Natural%20Resources%20and%20Conservation",
      markers: [
        /Aaniiih Nakoda College/,
        /ABCO Technology/,
        /Completion \/ graduation rate/,
        /less-than-four-year institution within 150%/,
        /Broad federal associate field/,
      ],
    },
    {
      path: "/majors/natural-resources-and-conservation?state=MT&sort=name",
      markers: [/Associate indicator present/, /CIP03ASSOC/, /All locations/],
    },
    {
      path: "/explore",
      markers: [
        /Find a college(?:<[^>]*>|\s)*that fits you\./,
        /Field filters use 2024-2025 federal program and award data\./,
      ],
    },
    {
      path: "/colleges/university-of-california-berkeley",
      markers: [
        /UC Berkeley evidence profile · CollegeSearch/,
        /University of California-Berkeley/,
        /Official UC admission headline/,
        /Why two rates appear/,
      ],
    },
    {
      path: "/colleges/yale-university",
      markers: [
        /Yale University evidence profile · CollegeSearch/,
        /Federal admission baseline · reviewed college enrollment and outcomes/,
        /This admission value remains federal\./,
        /Why current tuition is not shown/,
        /Current first-party Yale enrollment and graduation values are used\./,
      ],
    },
    {
      path: "/colleges/california-institute-of-technology",
      markers: [
        /Federal admission baseline · reviewed college enrollment and cost/,
        /This admission value remains federal\./,
        /Fall 2025/,
        /\$71,229/,
      ],
    },
    {
      path: "/colleges/pomona-college",
      markers: [
        /Federal admission baseline · reviewed college cost/,
        /This admission value remains federal\./,
        /\$72,080/,
      ],
    },
    {
      path: "/compare?colleges=110635,243744&major=Engineering",
      markers: [
        /Your options, side by side\./,
        /UC Berkeley/,
        /Stanford/,
        /different definitions or reporting periods/,
        /Add a broad field to the table\./,
        /This shows broad field availability and share of all awards, not a[\s\S]*major-specific admit rate/,
        /Clear field/,
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
        /What would you like to study\?/,
        /A zero and a missing record mean different things\./,
      ],
    },
    {
      path: "/match",
      markers: [
        /Preference match · CollegeSearch/,
        /What matters to you in a college\?/,
        /Fit and admission likelihood are different questions\./,
      ],
    },
    {
      path: "/chances",
      markers: [
        /Admit-rate context · CollegeSearch/,
        /Understand admission rates\./,
        /Past admit rates aren’t personal admission odds\./,
      ],
    },
    {
      path: "/my-colleges",
      markers: [/My colleges \| CollegeSearch/, /Saved colleges/, /Deadlines/],
    },
    {
      path: "/account",
      markers: [
        /Account \| CollegeSearch/,
        /Your shortlist, wherever you go\./,
        /Keep your shortlist across devices[\s\S]*profile, and deadlines stay in this browser/,
      ],
    },
    {
      path: "/privacy",
      markers: [
        /Privacy \| CollegeSearch/,
        /Your college list is yours\./,
        /Your optional application profile stays local\./,
        /Signing out[\s\S]*does not erase that recovery copy/,
      ],
    },
    {
      path: "/data-health",
      markers: [
        /Data health \| CollegeSearch/,
        /What is current—and what is still a baseline\./,
        /reviewed institutional records/,
        /Duke University[\s\S]*Northwestern University[\s\S]*Yale University[\s\S]*are partial records/,
        /total first-party admission headlines/,
        /federal admission baselines/,
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

test("comparison field form preserves colleges and renders the selected broad field", async () => {
  const response = await render(
    "/compare?colleges=110635,243744&major=Engineering",
  );
  assert.equal(response.status, 200);

  const html = await response.text();
  const form = html.match(
    /<form[^>]*class="comparison-field-form"[\s\S]*?<\/form>/,
  )?.[0];
  assert.ok(form, "comparison renders the broad-field GET form");
  assert.match(form, /action="\/compare"/);
  assert.match(form, /method="get"/);
  assert.match(
    form,
    /<input type="hidden" name="colleges" value="110635,243744"\/?/,
  );
  assert.match(form, /<select[^>]*name="major"/);
  assert.match(
    form,
    /<option value="Engineering" selected="">Engineering<\/option>/,
  );
  assert.match(
    form,
    /href="\/compare\?colleges=110635%2C243744"[^>]*>Clear field<\/a>/,
  );
  assert.match(
    html,
    /Engineering<small>Degree field · share of all awards<\/small>/,
  );
});

test("the source ledger renders one action per unique source URL", async () => {
  const [response, payload] = await Promise.all([
    render("/data-sources"),
    readFile(new URL("../data/colleges.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
  ]);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const sourceId of ["yale-cds-2025-26", "mit-cds-2025-26"]) {
    const source = payload.release.sources.find(
      (candidate) => candidate.id === sourceId,
    );
    assert.ok(source);
    const uniqueUrls = new Set(
      [source.sourcePage, source.sourceUrl, source.artifactUrl].filter(Boolean),
    );
    for (const url of uniqueUrls) {
      assert.equal(
        html.split(`<a href="${url}"`).length - 1,
        1,
        `${sourceId} renders one action for ${url}`,
      );
    }
  }
});

test("cost displays distinguish federal district charges, verified resident charges and private tuition", async () => {
  const cases = [
    ["california-state-university-bakersfield", "In-district tuition + required fees"],
    ["arizona-state-university-campus-immersion", "In-state tuition + required fees"],
    ["california-institute-of-technology", "Published tuition + required fees"],
  ];
  for (const [slug, label] of cases) {
    const response = await render(`/colleges/${slug}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<dt>${label}</dt>`), `${slug} labels its actual tuition basis`);
    assert.match(html, /Tuition and required fees exclude housing/);
    if (slug === "california-institute-of-technology") {
      assert.ok(!html.includes("<dt>In-state tuition + required fees</dt>"));
      assert.ok(!html.includes("<dt>Out-of-state tuition + required fees</dt>"));
    }
  }
  const comparison = await (await render("/compare?colleges=110404,166027")).text();
  assert.match(comparison, /Published tuition \+ required fees/);
  assert.ok(!comparison.includes('<th scope="row">In-district / in-state tuition + required fees</th>'));
});

test("mobile broad-field comparison preserves distance-learning program evidence", async () => {
  const html = await (await render("/compare?colleges=209542&major=Computing%20%26%20Information%20Sciences")).text();
  const mobile = html.slice(html.indexOf('class="comparison-mobile-card"'));
  assert.match(mobile, /includes a distance-learning program/);
});

test("the published cohort has complete, source-registered observations", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
  );

  assert.ok(payload.release.institutionCount >= 100);
  assert.equal(payload.colleges.length, payload.release.institutionCount);
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
    /Broad field filters pair a provisional 2024-2025 bachelor's or associate program indicator with the field's share of all awards; neither is a major-specific admit rate/i,
  );
  assert.match(
    payload.release.notes,
    /Operating status is PEPS as of April 30, 2026, not a real-time guarantee/i,
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
    "College Scorecard — 2026-06-10 institution release",
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
  assert.equal(new Set(unitIds).size, payload.colleges.length);

  for (const college of payload.colleges) {
    assert.ok(Number.isInteger(college.unitId), `${college.name} has a UNITID`);
    assert.match(college.opeId, /^(?:NA|\d{8})$/, `${college.name} retains an eight-digit OPEID or the source missing marker`);
    assert.match(college.opeId6, /^(?:NA|\d{6})$/, `${college.name} retains a six-digit OPEID or the source missing marker`);
    assert.equal(typeof college.mainCampus, "boolean", `${college.name} retains its federal main-or-branch designation`);
    assert.equal(
      college.currentlyOperating,
      true,
      `${college.name} is marked operating in the April 30, 2026 PEPS snapshot`,
    );
    assert.ok(
      Number.isInteger(college.branchCount) && college.branchCount >= 1,
      `${college.name} retains a valid federal branch count`,
    );
    assert.ok(
      ["Four-year", "Two-year"].includes(college.institutionLevel),
      `${college.name} has a supported undergraduate institution level`,
    );
    assert.ok(
      ["Public", "Private nonprofit", "Private for-profit"].includes(college.ownership),
      `${college.name} retains a recognized federal ownership type`,
    );
    assert.ok(
      ["Northeast", "Midwest", "South", "West", "U.S. territories"].includes(college.region),
      `${college.name} retains its Census region or territory classification`,
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
        mustHaveValue: false,
      });
    }

    const admitRate = college.observations.admitRate.value;
    const graduationRate = college.observations.graduationRate.value;
    if (admitRate !== null) {
      assert.ok(admitRate >= 0 && admitRate <= 1, `${college.name} has a valid admit rate`);
    }
    if (graduationRate !== null) {
      assert.ok(
        graduationRate >= 0 && graduationRate <= 1,
        `${college.name} has a valid graduation rate`,
      );
    }
    for (const [key, expectedUnit] of Object.entries(coreObservationUnits)) {
      const value = college.observations[key].value;
      if (value === null) continue;
      if (expectedUnit === "count") {
        assert.ok(Number.isInteger(value) && value >= 0, `${college.name} ${key} is a non-negative count`);
      } else if (expectedUnit === "usd" && key !== "averageNetPrice") {
        assert.ok(value >= 0, `${college.name} ${key} is a non-negative published price or earnings value`);
      }
    }
    assert.ok(Array.isArray(college.majors), `${college.name} has an explicit major-evidence collection`);
    for (const major of college.majors) {
      const label = `${college.name} ${major.name}`;
      assert.match(
        major.evidence,
        /^Broad federal (?:associate|bachelor's(?: and associate)?) field(?: · includes a distance-learning program)?$/,
        `${label} labels its evidence and delivery modality`,
      );
      if (major.deliveryMode === "includes-distance-program") {
        assert.match(
          major.evidence,
          /includes a distance-learning program/,
          `${label} discloses an online offering without calling the whole field online-only`,
        );
      }
      assert.equal(major.reportingYear, 2025, `${label} identifies the federal reporting year`);
      assert.equal(
        major.periodLabel,
        "2024-2025 programs and awards",
        `${label} identifies the exact evidence period`,
      );
      assert.equal(major.sourceId, federalSourceId, `${label} uses the registered federal release`);
      const sourceFields = major.sourceField.match(
        /^PCIP(\d{2}) \+ CIP(\d{2})(BACHL|ASSOC)(?: \+ CIP(\d{2})(BACHL|ASSOC))?$/,
      );
      assert.ok(sourceFields, `${label} identifies award share and degree-level availability fields`);
      assert.equal(sourceFields[1], sourceFields[2], `${label} source fields use the same CIP family`);
      if (sourceFields[4]) {
        assert.equal(sourceFields[1], sourceFields[4], `${label} paired degree fields use the same CIP family`);
        assert.notEqual(sourceFields[3], sourceFields[5], `${label} pairs associate and bachelor's indicators`);
      }
      const degreeLevels = [sourceFields[3], sourceFields[5]].filter(Boolean);
      assert.equal(major.bachelorsAvailable, degreeLevels.includes("BACHL"), `${label} reports bachelor's availability accurately`);
      assert.equal(major.associatesAvailable, degreeLevels.includes("ASSOC"), `${label} reports associate availability accurately`);
      assert.equal(
        major.degreeLevel,
        major.bachelorsAvailable && major.associatesAvailable
          ? "bachelors-and-associate"
          : major.bachelorsAvailable
            ? "bachelors"
            : "associate",
        `${label} classifies the federal degree-level availability`,
      );
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

  const nonUcColleges = payload.colleges.filter(
    (college) => !expectedUcFall2026.has(college.unitId),
  );
  assert.equal(nonUcColleges.length, payload.colleges.length - expectedUcFall2026.size);
  for (const college of nonUcColleges) {
    for (const key of [
      ...Object.keys(ucHeadlineObservationUnits),
      ...Object.keys(ucFinalizedObservationUnits),
    ]) {
      const observation = college.observations[key];
      if (observation) {
        assert.ok(
          !observation.sourceId.startsWith("uc-"),
          `${college.name} does not receive UC ${key} evidence`,
        );
      }
    }
  }

  const federalAdmissionBaselines = nonUcColleges.filter(
    (college) => college.observations.admitRate.sourceId === federalSourceId,
  );
  const reviewedInstitutionRecords = nonUcColleges.filter(
    hasReviewedInstitutionRecord,
  );
  const reviewedAdmissionHeadlines = reviewedInstitutionRecords.filter(
    (college) => college.observations.admitRate.sourceId !== federalSourceId,
  );
  const partialInstitutionRecords = reviewedInstitutionRecords
    .filter(
      (college) => college.observations.admitRate.sourceId === federalSourceId,
    )
    .map((college) => college.unitId)
    .sort((left, right) => left - right);
  assert.equal(reviewedInstitutionRecords.length, 24);
  assert.equal(reviewedAdmissionHeadlines.length, 19);
  assert.deepEqual(partialInstitutionRecords, [
    110404, 121345, 130794, 147767, 198419,
  ]);
  assert.equal(federalAdmissionBaselines.length, payload.colleges.length - 28);
  for (const college of federalAdmissionBaselines) {
    assert.equal(college.observations.admitRate.reportingYear, 2024);
  }

  for (const unitId of [130794, 166027, 193900]) {
    const college = payload.colleges.find(
      (candidate) => candidate.unitId === unitId,
    );
    assert.ok(college);
    for (const metric of ["tuitionInState", "tuitionOutOfState"]) {
      assert.equal(college.observations[metric].sourceId, federalSourceId);
      assert.equal(college.observations[metric].reportingYear, 2024);
      assert.equal(college.observations[metric].periodLabel, "2024-2025");
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
