import assert from "node:assert/strict";

const EXPECTED_RELEASE =
  "sha256:29f7d5e5b891020771ce191ae16d4da8250487a51682ba9763f01cb6ccb64563";
const EXPECTED_IDENTITY_COUNT = 3_912;
const STANFORD_UNIT_ID = 243744;
const UCLA_UNIT_ID = 110662;
const MISSING_TUITION_UNIT_ID = 188915;

const configuredOrigin = process.env.COLLEGE_SMOKE_ORIGIN;
assert.ok(
  configuredOrigin,
  "Set COLLEGE_SMOKE_ORIGIN to the deployment origin to verify (for example, https://example.com).",
);

const parsedOrigin = new URL(configuredOrigin);
assert.ok(
  parsedOrigin.protocol === "http:" || parsedOrigin.protocol === "https:",
  "COLLEGE_SMOKE_ORIGIN must use http or https.",
);
const origin = parsedOrigin.origin;

async function get(route, accept) {
  const response = await fetch(new URL(route, origin), {
    headers: { Accept: accept },
    redirect: "error",
  });
  assert.equal(response.status, 200, `GET ${route} returned ${response.status}.`);
  return response;
}

async function getJson(route) {
  const response = await get(route, "application/json");
  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json\b/i,
    `GET ${route} did not return JSON.`,
  );
  return response.json();
}

async function getHtml(route) {
  const response = await get(route, "text/html");
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
    `GET ${route} did not return HTML.`,
  );
  return response.text();
}

function itemsFrom(payload, route) {
  assert.ok(payload && typeof payload === "object", `${route} returned an invalid payload.`);
  assert.ok(Array.isArray(payload.items), `${route} did not return an items array.`);
  return payload.items;
}

function collegeByUnitId(payload, unitId, route) {
  return itemsFrom(payload, route).find((college) => college?.unitId === unitId);
}

async function verifyTuitionFilters() {
  const legacyRoute = "/api/colleges?q=Stanford%20University&price=30000";
  const tuitionRoute = "/api/colleges?q=Stanford%20University&tuition=30000";
  const [legacyResult, tuitionResult] = await Promise.all([
    getJson(legacyRoute),
    getJson(tuitionRoute),
  ]);

  const stanford = collegeByUnitId(legacyResult, STANFORD_UNIT_ID, legacyRoute);
  assert.ok(stanford, "The legacy price filter should include Stanford by average net price.");
  assert.equal(stanford.observations?.tuitionOutOfState?.value, 68_574);
  assert.equal(stanford.observations?.tuitionOutOfState?.periodLabel, "2026-2027");
  assert.equal(stanford.observations?.averageNetPrice?.value, 13_807);
  assert.equal(stanford.costs?.tuitionOutOfState?.value, 67_731);
  assert.equal(stanford.costs?.tuitionOutOfState?.periodLabel, "2026-2027");
  const tuitionOnlyRoute = "/api/colleges?q=Stanford%20University&tuitionOnly=30000";
  assert.equal(collegeByUnitId(await getJson(tuitionOnlyRoute), STANFORD_UNIT_ID, tuitionOnlyRoute), undefined);
  const tuitionOnlyIncludedRoute = "/api/colleges?q=Stanford%20University&tuitionOnly=70000";
  assert.ok(collegeByUnitId(await getJson(tuitionOnlyIncludedRoute), STANFORD_UNIT_ID, tuitionOnlyIncludedRoute));
  assert.equal(
    collegeByUnitId(tuitionResult, STANFORD_UNIT_ID, tuitionRoute),
    undefined,
    "The tuition filter must exclude Stanford when its published tuition exceeds the cap.",
  );
}

async function verifyCostBudgets() {
  const [stanford, berkeley, comparison] = await Promise.all([
    getHtml("/colleges/stanford-university"),
    getHtml("/colleges/university-of-california-berkeley"),
    getHtml("/compare?colleges=110635,243744"),
  ]);
  assert.match(stanford, /\$67,731/);
  assert.match(stanford, /\$97,545/);
  assert.match(stanford, /Student fees allowance/);
  assert.match(stanford, /financialaid\.stanford\.edu\/undergrad\/budget/);
  assert.match(berkeley, /\$53,472/);
  assert.match(berkeley, /\$14,202/);
  assert.match(berkeley, /\$93,944/);
  assert.match(berkeley, /registrar\.berkeley\.edu\/tuition-fees/);
  assert.match(comparison, /\$67,731/);
  assert.match(comparison, /\$53,472/);
}

async function verifyCompleteOnly() {
  const baseRoute = "/api/colleges?q=Arnot%20Ogden%20Medical%20Center";
  const completeRoute = `${baseRoute}&complete=1`;
  const [baseResult, completeResult] = await Promise.all([
    getJson(baseRoute),
    getJson(completeRoute),
  ]);

  const incompleteCollege = collegeByUnitId(baseResult, MISSING_TUITION_UNIT_ID, baseRoute);
  assert.ok(incompleteCollege, "The missing-tuition fixture must remain discoverable without complete-only.");
  assert.equal(incompleteCollege.observations?.tuitionOutOfState?.value, null);
  assert.equal(
    collegeByUnitId(completeResult, MISSING_TUITION_UNIT_ID, completeRoute),
    undefined,
    "Complete-only must exclude colleges without published tuition.",
  );
}

async function verifyAdmissionsSurface() {
  const [html, featuredPayload, californiaPayload, bostonPayload, aliasPayload] = await Promise.all([
    getHtml("/chances"),
    getJson("/api/colleges/admissions"),
    getJson("/api/colleges/admissions?q=California"),
    getJson("/api/colleges/admissions?q=Boston"),
    getJson("/api/colleges/admissions?q=UCLA"),
  ]);

  assert.ok(
    Buffer.byteLength(html, "utf8") < 250_000,
    "The initial Admissions HTML is unexpectedly large and may contain the full catalog.",
  );
  assert.doesNotMatch(
    html,
    /Arnot Ogden Medical Center/,
    "The initial Admissions HTML must not serialize an unselected catalog record.",
  );

  const featured = itemsFrom(featuredPayload, "/api/colleges/admissions");
  assert.equal(featured.length, 12, "Empty Admissions search must return the 12 featured colleges.");

  const california = itemsFrom(
    californiaPayload,
    "/api/colleges/admissions?q=California",
  );
  assert.equal(california.length, 24, "Admissions search must cap broad matches at 24.");
  assert.ok(california.every((college) => college.state === "CA"));

  const boston = itemsFrom(bostonPayload, "/api/colleges/admissions?q=Boston");
  assert.ok(boston.length > 1, "City search should return matching Boston colleges.");
  assert.ok(boston.every((college) => college.city === "Boston"));

  const ucla = collegeByUnitId(aliasPayload, UCLA_UNIT_ID, "/api/colleges/admissions?q=UCLA");
  assert.ok(ucla, "Admissions search must resolve the UCLA alias.");
}

async function verifyIdentityDirectory() {
  const route = "/api/colleges/identities";
  const payload = await getJson(route);
  const identities = itemsFrom(payload, route);

  assert.equal(payload.releaseId, EXPECTED_RELEASE);
  assert.equal(payload.total, EXPECTED_IDENTITY_COUNT);
  assert.equal(identities.length, EXPECTED_IDENTITY_COUNT);
  assert.equal(
    new Set(identities.map((college) => college.unitId)).size,
    EXPECTED_IDENTITY_COUNT,
    "The identity directory must contain one unique entry per college.",
  );
}

await Promise.all([
  verifyTuitionFilters(),
  verifyCompleteOnly(),
  verifyAdmissionsSurface(),
  verifyIdentityDirectory(),
  verifyCostBudgets(),
]);

console.log(`Product polish smoke checks passed for ${origin}.`);
