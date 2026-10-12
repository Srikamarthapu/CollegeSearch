import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildJudgedCases,
  createQueryEmbeddingCache,
  exactCipAvailabilityTokens,
  scoreJudgedCase,
  validateQueryEmbeddingCache,
  validateRetrievalFixture,
} from "../scripts/lib/college-retrieval-evaluation.mjs";
import { buildPreflightSql, buildSearchSql, parseArgs, validatePublicRelease, validateSearchRow } from "../scripts/evaluate-college-retrieval.mjs";

const releaseId = `sha256:${"a".repeat(64)}`;
const model = "nvidia/nemotron-3-embed-1b";
const modelVersion = "reviewed-test-version";

function makeFixture(cases) {
  return { schemaVersion: 1, releaseId, candidateScope: "global-current-release", cases };
}

function makeCase(id, judgment) {
  return { id, query: `Question for ${id}?`, judgment, rationale: "Predeclared source-locator judgment." };
}

function makeCanonical() {
  const catalog = [
    { unit_id: 1001, name: "California College", slug: "california-college", state: "CA", census_region: "West", ownership_code: 1, ownership_label: "Public" },
    { unit_id: 1002, name: "Texas University", slug: "texas-university", state: "TX", census_region: "South", ownership_code: 2, ownership_label: "Private nonprofit" },
    { unit_id: 1003, name: "Another California College", slug: "another-california-college", state: "CA", census_region: "West", ownership_code: 1, ownership_label: "Public" },
  ];
  const passages = [
    { passage_id: "p-ca-assoc", unit_id: 1001, source_field: "CIP11ASSOC, CIP14BACHL" },
    { passage_id: "p-tx-bach", unit_id: 1002, source_field: "CIP14BACHL" },
    { passage_id: "p-ca-bach", unit_id: 1003, source_field: "CIP11BACHL" },
    { passage_id: "p-bad-substring", unit_id: 1003, source_field: "CIP114ASSOC" },
  ];
  return { catalog, passages };
}

function sampleRow(passageId, unitId = 1001) {
  return {
    release_id: releaseId,
    unit_id: unitId,
    college_slug: "california-college",
    college_name: "California College",
    state: "CA",
    census_region: "West",
    ownership_code: 1,
    passage_id: passageId,
    title: "California College: fields of study",
    content: "Reported availability includes a broad federal field.",
    source_id: "scorecard",
    publisher: "U.S. Department of Education",
    source_name: "College Scorecard",
    source_url: "https://collegescorecard.ed.gov/",
    source_field: "CIP11ASSOC",
    field_locator: "CIP11ASSOC",
    reporting_year: 2024,
    period_label: "2024 reporting year",
    cohort: "Undergraduate degree availability",
    definition: "A broad program availability indicator.",
    content_sha256: "b".repeat(64),
    embedding_model: model,
    embedding_version: modelVersion,
    lexical_rank: 1,
    semantic_rank: null,
    rrf_score: 0.016,
  };
}

test("retrieval fixture requires the frozen release and bounded case contract", () => {
  const supported = makeCase("valid", { type: "supported", states: ["CA"], cipCode: "11", degreeLevel: "associate" });
  assert.deepEqual(validateRetrievalFixture(makeFixture([supported]), releaseId), [supported]);
  assert.throws(() => validateRetrievalFixture(makeFixture([supported]), `sha256:${"c".repeat(64)}`), /does not match/);
  assert.throws(() => validateRetrievalFixture(makeFixture([
    makeCase("bad", { type: "supported", states: ["CA"], cipCode: "1", degreeLevel: "associate" }),
  ]), releaseId), /invalid positive judgment/);
});

test("CIP selectors match exact comma-delimited degree locators, never substrings", () => {
  assert.deepEqual(exactCipAvailabilityTokens("CIP11ASSOC, CIP14BACHL, PCIP11"), [
    { cipCode: "11", degreeLevel: "associate", token: "CIP11ASSOC" },
    { cipCode: "14", degreeLevel: "bachelors", token: "CIP14BACHL" },
  ]);
  assert.deepEqual(exactCipAvailabilityTokens("CIP114ASSOC"), []);
  assert.deepEqual(exactCipAvailabilityTokens("X-CIP11ASSOC"), []);
});

test("predeclared judgments select exact institution, state, ownership, CIP, and level evidence", () => {
  const cases = [
    makeCase("ca-associate", { type: "supported", states: ["CA"], cipCode: "11", degreeLevel: "associate" }),
    makeCase("texas-private-bachelor", { type: "supported", states: ["TX"], ownership: "Private nonprofit", cipCode: "14", degreeLevel: "bachelors" }),
    makeCase("named-campuses", { type: "supported", unitIds: [1001], cipCode: "14", degreeLevel: "bachelors" }),
    makeCase("unsupported", { type: "unsupported", reason: "not in source corpus" }),
  ];
  const judged = buildJudgedCases(cases, makeCanonical());
  assert.deepEqual([...judged[0].goldPassageIds], ["p-ca-assoc"]);
  assert.deepEqual([...judged[1].goldPassageIds], ["p-tx-bach"]);
  assert.deepEqual([...judged[2].goldPassageIds], ["p-ca-assoc"]);
  assert.equal(judged[3].goldPassageCount, 0);
});

test("ranking metrics use the fixed top five and keep unsupported neighbors unjudged", () => {
  const judged = buildJudgedCases([
    makeCase("supported", { type: "supported", states: ["CA"], cipCode: "11" }),
    makeCase("unsupported", { type: "unsupported", reason: "no such evidence" }),
  ], makeCanonical());
  const ranked = [
    { passage_id: "unrelated-1" },
    { passage_id: "p-ca-assoc" },
    { passage_id: "unrelated-2" },
    { passage_id: "p-ca-bach" },
    { passage_id: "unrelated-3" },
    { passage_id: "outside-cutoff" },
  ].map((row) => ({ ...sampleRow(row.passage_id), ...row }));
  const supported = scoreJudgedCase(judged[0], ranked);
  assert.deepEqual(supported.metrics, {
    pAt5: 0.4,
    rAt5: 1,
    reciprocalRank: 0.5,
    hitAt5: true,
    relevantAt5: 2,
    goldPassageCount: 2,
    goldCollegeCount: 2,
  });
  const unsupported = scoreJudgedCase(judged[1], ranked);
  assert.equal(unsupported.metrics, null);
  assert.equal(unsupported.returnedRowCount, 6);
  assert.equal(unsupported.unjudgedNearestNeighbors.length, 5);
});

test("query embedding cache binds fixture, release, model, version, query order, usage, and vectors", () => {
  const cases = [{ id: "one", query: "first query" }, { id: "two", query: "second query" }];
  const vector = [1, ...Array(2047).fill(0)];
  const usage = { promptTokens: 17, completionTokens: null, totalTokens: 17 };
  const cache = createQueryEmbeddingCache({
    fixtureSha256: "c".repeat(64), releaseId, model, modelVersion, cases,
    embeddings: [vector, vector], usage, latencyMs: 321,
  });
  const expected = { fixtureSha256: "c".repeat(64), releaseId, model, modelVersion, cases };
  assert.deepEqual(validateQueryEmbeddingCache(cache, expected), [vector, vector]);
  assert.equal(cache.usage.promptTokens, 17);
  assert.equal(cache.latencyMs, 321);
  assert.throws(() => validateQueryEmbeddingCache(cache, { ...expected, modelVersion: "wrong-version" }), /do not match/);
  assert.throws(() => validateQueryEmbeddingCache({ ...cache, embeddings: [vector, [0, ...Array(2047).fill(0)]] }, expected), /nonzero/);
  assert.throws(() => validateQueryEmbeddingCache({ ...cache, usage: { promptTokens: -1, completionTokens: null, totalTokens: null } }, expected), /do not match/);
});

test("CLI evaluation is explicitly pinned to the disposable local clone", () => {
  assert.equal(parseArgs([]).evaluate, false);
  assert.throws(() => parseArgs(["--evaluate"]), /requires --docker-container/);
  assert.deepEqual(parseArgs(["--evaluate", "--docker-container", "collegesearch-goal-db-20261004", "--database", "collegesearch_m8_retrieval_verify"]), {
    evaluate: true,
    help: false,
    container: "collegesearch-goal-db-20261004",
    database: "collegesearch_m8_retrieval_verify",
    refreshQueryEmbeddings: false,
  });
  assert.throws(() => parseArgs(["--evaluate", "--docker-container", "other", "--database", "collegesearch_m8_retrieval_verify"]), /pinned/);
  assert.throws(() => parseArgs(["--url", "https://example.invalid"]), /Unknown option/);
  assert.throws(() => parseArgs(["--refresh-query-embeddings"]), /requires explicit/);
});

test("SQL builders run only bounded RPC reads under an anon read-only transaction", () => {
  const preflight = buildPreflightSql(releaseId, model, modelVersion);
  assert.match(preflight, /^BEGIN READ ONLY;\nSET LOCAL ROLE anon;/);
  assert.match(preflight, /current_college_knowledge_release/);
  assert.match(preflight, /invalidEmbeddingCount/);
  assert.match(preflight, /ROLLBACK;\n$/);
  const sql = buildSearchSql([
    { id: "quoted-case", query: "Where's the field?" },
  ], [[1, ...Array(2047).fill(0)]], model, modelVersion, releaseId);
  assert.match(sql, /^BEGIN READ ONLY;\nSET LOCAL ROLE anon;/);
  assert.equal((sql.match(/public\.hybrid_search_college_passages\(/g) ?? []).length, 3);
  assert.equal((sql.match(/p_match_count => 20::integer/g) ?? []).length, 3);
  assert.match(sql, /Where''s the field\?/);
  assert.match(sql, /p_query_text => ''::text/);
  assert.match(sql, /ROLLBACK;\n$/);
});

test("public preflight rejects incomplete vectors or a mismatched release", () => {
  const canonical = { catalog: [{ unit_id: 1001 }], passages: [{ passage_id: "p1" }] };
  const valid = {
    release: { release_id: releaseId, dataset_sha256: "a".repeat(64), institution_count: 1, embedding_model: model, embedding_version: modelVersion },
    passageCount: 1,
    embeddedPassageCount: 1,
    invalidEmbeddingCount: 0,
  };
  assert.equal(validatePublicRelease(valid, canonical, releaseId, model, modelVersion).passageCount, 1);
  assert.throws(() => validatePublicRelease({ ...valid, embeddedPassageCount: 0 }, canonical, releaseId, model, modelVersion), /does not match/);
});

test("retrieved rows must match canonical passage, institution, source, hash, and model metadata", () => {
  const row = sampleRow("p1");
  row.content_sha256 = createHash("sha256").update(row.content).digest("hex");
  const passage = {
    passage_id: row.passage_id, unit_id: row.unit_id, college_slug: row.college_slug, source_id: row.source_id,
    source_url: row.source_url, source_field: row.source_field, field_locator: row.field_locator,
    reporting_year: row.reporting_year, period_label: row.period_label, cohort: row.cohort,
    definition: row.definition, title: row.title, content: row.content, content_sha256: row.content_sha256,
  };
  const college = { unit_id: 1001, name: row.college_name, state: row.state, census_region: row.census_region, ownership_code: 1 };
  const source = { source_id: "scorecard", publisher: row.publisher, source_name: row.source_name, source_url: row.source_url, source_page: null, artifact_url: null, source_urls: [] };
  const maps = {
    passages: new Map([["p1", passage]]),
    colleges: new Map([[1001, college]]),
    sources: new Map([["scorecard", source]]),
    bindings: new Set(["1001:scorecard"]),
  };
  assert.doesNotThrow(() => validateSearchRow(row, maps, releaseId, model, modelVersion));
  assert.throws(() => validateSearchRow({ ...row, source_url: "https://unregistered.invalid/" }, maps, releaseId, model, modelVersion), /invalid release, college, source/);
  assert.throws(() => validateSearchRow({ ...row, embedding_version: "stale" }, maps, releaseId, model, modelVersion), /invalid release, college, source/);
});
