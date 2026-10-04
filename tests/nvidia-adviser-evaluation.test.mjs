import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import test from "node:test";
import { PassThrough } from "node:stream";
import {
  buildLocalRpcSql,
  caseCount,
  caseSpecs,
  createLocalPsqlRpc,
  emptyHttpCounters,
  estimateRuntimeHttpCalls,
  explicitIdScopeAudit,
  expectedRetrieval,
  parseArgs,
  prepareCases,
  retrievedEvidenceSummary,
  sanitizedFailureDiagnostics,
  verifyRuntimeRelease,
} from "../scripts/evaluate-nvidia-adviser.mjs";

const dataset = JSON.parse(readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8"));

function rpcParameters(overrides = {}) {
  return {
    p_query_text: "engineering in California",
    p_query_embedding: null,
    p_embedding_model: null,
    p_embedding_version: null,
    p_match_count: 20,
    p_unit_ids: [110635, 110644],
    p_expected_release_id: "sha256:" + "a".repeat(64),
    ...overrides,
  };
}

function fakeSpawn(output, status = 0) {
  const invocations = [];
  const spawnProcess = (command, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    let sql = "";
    child.stdin.on("data", (chunk) => { sql += chunk.toString("utf8"); });
    child.stdin.resume();
    invocations.push({ command, args, get sql() { return sql; } });
    child.stdin.once("finish", () => {
      child.stdout.end(output, () => child.emit("close", status, null));
    });
    return child;
  };
  return { invocations, spawnProcess };
}

test("32-case matrix includes actual named-college, ordinal follow-up, unsupported-topic and unknown-institution cases", () => {
  assert.equal(caseSpecs.length, caseCount);
  const ids = new Set(caseSpecs.map((item) => item.id));
  assert.equal(ids.size, caseCount);
  const aliasCase = caseSpecs.find((item) => item.id === "known-single-word-aliases");
  assert.deepEqual(aliasCase.expectedMentionedUnitIds, [243744, 166027]);
  assert.equal(expectedRetrieval(aliasCase), true);
  const cedarUnknown = caseSpecs.find((item) => item.id === "unknown-cedar-lantern");
  const cedarMixed = caseSpecs.find((item) => item.id === "mixed-stanford-cedar-lantern");
  assert.equal(cedarUnknown.expectedIntent, "other");
  assert.deepEqual(cedarUnknown.expectedFields, ["Biological & Biomedical Sciences"]);
  assert.deepEqual(cedarUnknown.expectedMentionedUnitIds, []);
  assert.equal(cedarMixed.expectedIntent, "other");
  assert.deepEqual(cedarMixed.expectedMentionedUnitIds, [243744]);
  assert.equal(dataset.colleges.some((college) => [college.name, ...college.aliases].some((name) => /cedar lantern/i.test(name))), false);
  const ordinal = caseSpecs.find((item) => item.id === "previous-second-college");
  assert.deepEqual(ordinal.previousRecommendationIds, [110635, 110644]);
  assert.deepEqual(ordinal.expectedMentionedUnitIds, [110644]);
  assert.equal(expectedRetrieval(caseSpecs.find((item) => item.id === "ordinal-unsupported-campus-guarantee")), false);
  assert.equal(expectedRetrieval(caseSpecs.find((item) => item.id === "unknown-college")), false);
  const planned = estimateRuntimeHttpCalls(caseSpecs);
  assert.equal(planned.cases, caseCount);
  assert.ok(planned.expectedBaseHttpCalls <= 96);
  assert.equal(planned.queryEmbeddings, planned.chatOperations - caseSpecs.length);
});

test("fixed preparation retains explicit IDs and ordinal case context without claiming runtime retrieval", () => {
  const prepared = prepareCases(dataset);
  assert.equal(prepared.length, caseCount);
  const alias = prepared.find((item) => item.id === "known-single-word-aliases");
  assert.deepEqual(alias.retrievalIds.slice(0, 2), [243744, 166027]);
  const ordinal = prepared.find((item) => item.id === "previous-first-and-third");
  assert.deepEqual(ordinal.retrievalIds.slice(0, 2), [110635, 110583]);
  assert.equal(ordinal.previousRecommendationIds.length, 3);
});

test("read-only SQL is generated only for the three fixed adviser RPCs with typed parameters", () => {
  assert.match(buildLocalRpcSql("current_college_knowledge_release", {}), /^SELECT COALESCE\(json_agg/);
  const sql = buildLocalRpcSql("filter_college_facts", {
    p_filters: { undergraduateEnrollment: { min: 5000, max: 15000 } },
    p_residency_state: "CA",
    p_limit: 20,
    p_offset: 0,
    p_unit_ids: [110635],
    p_expected_release_id: "sha256:" + "b".repeat(64),
  });
  assert.match(sql, /p_filters => '[^']*'::jsonb/);
  assert.match(sql, /p_unit_ids => ARRAY\[110635\]::bigint\[\]/);
  assert.match(sql, /p_ownerships => NULL::smallint\[\]/);
  assert.match(sql, /^SELECT COALESCE\(json_agg\(to_jsonb\(r\)\), '\[\]'::json\)::text FROM public\.filter_college_facts\(/);
  assert.throws(() => buildLocalRpcSql("delete_college_facts", {}), /not allowlisted/);
  assert.throws(() => buildLocalRpcSql("current_college_knowledge_release", { sql: "drop" }), /unexpected argument shape/);
  assert.throws(() => buildLocalRpcSql("filter_college_facts", {
    p_filters: [], p_residency_state: null, p_limit: 20, p_offset: 0, p_unit_ids: [], p_expected_release_id: "x",
  }), /invalid JSON filters/);
});

test("SQL text and vector arguments are escaped, finite, nonzero, and dimension-bound", () => {
  const query = "Engineering'; COMMIT; DROP TABLE public.college_catalog; --";
  const sql = buildLocalRpcSql("hybrid_search_college_passages", rpcParameters({ p_query_text: query }));
  assert.ok(sql.includes("p_query_text => 'Engineering''; COMMIT; DROP TABLE public.college_catalog; --'::text"));
  const vectorSql = buildLocalRpcSql("hybrid_search_college_passages", rpcParameters({
    p_query_embedding: Array(2048).fill(0.125), p_embedding_model: "nvidia/nemotron-3-embed-1b", p_embedding_version: "reviewed-test",
  }));
  assert.ok(vectorSql.includes("p_query_embedding => '[0.125,"));
  assert.ok(vectorSql.includes("]'::extensions.vector"));
  assert.throws(() => buildLocalRpcSql("hybrid_search_college_passages", rpcParameters({ p_query_embedding: [0.1] })), /invalid query vector/);
  assert.throws(() => buildLocalRpcSql("hybrid_search_college_passages", rpcParameters({ p_query_embedding: Array(2048).fill(0) })), /empty query vector/);
  assert.throws(() => buildLocalRpcSql("hybrid_search_college_passages", rpcParameters({ p_query_embedding: Array(2048).fill(Number.MAX_VALUE) })), /invalid query vector/);
});

test("local RPC is pinned to the disposable DB, anon role, read-only transaction, and bounded output", async () => {
  const fake = fakeSpawn('[{"release_id":"sha256:test"}]');
  const rpc = createLocalPsqlRpc({ spawnProcess: fake.spawnProcess });
  const result = await rpc("current_college_knowledge_release", {});
  assert.deepEqual(result, [{ release_id: "sha256:test" }]);
  assert.deepEqual(fake.invocations[0].args.slice(0, 4), ["exec", "-i", "collegesearch-goal-db-20261004", "psql"]);
  assert.ok(fake.invocations[0].args.includes("collegesearch_m8_retrieval_verify"));
  assert.match(fake.invocations[0].sql, /^BEGIN TRANSACTION READ ONLY;/);
  assert.match(fake.invocations[0].sql, /SET LOCAL ROLE anon;/);
  assert.match(fake.invocations[0].sql, /SET LOCAL statement_timeout = '8s';/);
  assert.match(fake.invocations[0].sql, /SET LOCAL idle_in_transaction_session_timeout = '10s';/);
  assert.match(fake.invocations[0].sql, /COMMIT;\s*$/);

  let spawns = 0;
  assert.throws(() => createLocalPsqlRpc({ database: "postgres", spawnProcess: () => { spawns += 1; } }), /fixed disposable database allowlist/);
  assert.throws(() => createLocalPsqlRpc({ container: "other-container", spawnProcess: () => { spawns += 1; } }), /fixed disposable database allowlist/);
  assert.equal(spawns, 0);
});

test("local RPC rejects nonzero psql status and oversized output without exposing stderr", async () => {
  const failed = createLocalPsqlRpc({ spawnProcess: fakeSpawn("private database error details", 1).spawnProcess });
  await assert.rejects(failed("current_college_knowledge_release", {}), (error) => {
    assert.equal(error.message, "Local database RPC failed.");
    assert.equal(error.message.includes("private"), false);
    return true;
  });
  const oversized = createLocalPsqlRpc({ outputLimit: 1024, spawnProcess: fakeSpawn("x".repeat(2048)).spawnProcess });
  await assert.rejects(oversized("current_college_knowledge_release", {}), /response exceeded its size limit/);
});

test("runtime CLI requires evaluation tag, exact local DB and a bounded API ceiling", () => {
  assert.throws(() => parseArgs(["--retrieval-mode", "runtime", "--local-database", "collegesearch_m8_retrieval_verify"]), /unique --tag/);
  assert.throws(() => parseArgs(["--retrieval-mode", "runtime", "--local-database", "postgres", "--tag", "m8"]), /designated disposable/);
  assert.throws(() => parseArgs(["--retrieval-mode", "runtime", "--local-database", "collegesearch_m8_retrieval_verify", "--tag", "m8", "--models", "nvidia/nemotron-3-super-120b-a12b", "--evaluate", "--max-calls", "97"]), /caps --max-api-calls at 96/);
  const options = parseArgs(["--retrieval-mode", "runtime", "--local-database", "collegesearch_m8_retrieval_verify", "--tag", "m8", "--models", "nvidia/nemotron-3-super-120b-a12b", "--evaluate", "--max-calls", "96", "--turn-timeout-ms", "120000"]);
  assert.equal(options.maxApiCalls, 96);
  assert.equal(options.turnTimeoutMs, 120_000);
  assert.equal(options.evaluate, true);
});

test("runtime release preflight binds dataset and embedding version before provider use", async () => {
  const releaseId = "sha256:" + "a".repeat(64);
  const config = { embeddingModel: "nvidia/nemotron-3-embed-1b", embeddingModelVersion: "reviewed-local" };
  const datasetFixture = { colleges: [{ unitId: 1 }, { unitId: 2 }] };
  const releaseRow = { release_id: releaseId, dataset_sha256: releaseId.slice(7), institution_count: 2,
    embedding_model: config.embeddingModel, embedding_version: config.embeddingModelVersion };
  assert.deepEqual(await verifyRuntimeRelease(async () => [releaseRow], datasetFixture, releaseId, config), {
    releaseId, institutionCount: 2, datasetSha256: releaseId.slice(7), embeddingModel: config.embeddingModel,
    embeddingVersion: config.embeddingModelVersion,
  });
  await assert.rejects(verifyRuntimeRelease(async () => [{ ...releaseRow, embedding_version: "other" }], datasetFixture, releaseId, config), /model\/version/);
  await assert.rejects(verifyRuntimeRelease(async () => [{ ...releaseRow, dataset_sha256: "wrong" }], datasetFixture, releaseId, config), /catalog release/);
});

test("named-college scope and complete comparison coverage are reported separately", () => {
  const partial = explicitIdScopeAudit([1, 2], [1, 2], [1]);
  assert.equal(partial.scopePassed, true);
  assert.equal(partial.coveragePassed, false);
  assert.deepEqual(partial.missingExpectedSelectedIds, [2]);
  const outsideScope = explicitIdScopeAudit([1, 2], [1, 3], [1, 3]);
  assert.equal(outsideScope.scopePassed, false);
  assert.deepEqual(outsideScope.missingExpectedRetrievedIds, [2]);
  const full = explicitIdScopeAudit([1, 2], [1, 2], [1, 2]);
  assert.equal(full.passed, true);
  assert.equal(full.fullNamedCoverage, true);
});

test("runtime evidence report keeps real source bindings but omits passage text", () => {
  const summary = retrievedEvidenceSummary({
    mode: "hybrid",
    colleges: [{ unitId: 110635 }],
    passages: [{ passageId: "p1", unitId: 110635, sourceId: "src", sourceField: "CIPCODE", fieldLocator: "reported_programs.CIPCODE", reportingYear: 2025, content: "public but not copied" }],
    notices: [],
  });
  assert.deepEqual(summary.collegeIds, [110635]);
  assert.deepEqual(summary.passages[0], { passageId: "p1", unitId: 110635, sourceId: "src", sourceField: "CIPCODE", fieldLocator: "reported_programs.CIPCODE", reportingYear: 2025 });
  assert.equal(JSON.stringify(summary).includes("public but not copied"), false);
});

test("failure diagnostics retain only validated, sanitized context and fallback counters start at zero", () => {
  const counters = emptyHttpCounters();
  assert.deepEqual(counters, { chat: 0, queryEmbedding: 0, chatFallbackHttpCalls: 0 });
  const diagnostics = sanitizedFailureDiagnostics({
    validatedInterpretation: { intent: "compare", mentionedUnitIds: [243744], preferences: { fields: ["Engineering"] } },
    effectiveRetrievalInterpretation: { intent: "other", mentionedUnitIds: [243744], preferences: { fields: ["Engineering"] } },
    retrievedEvidence: { mode: "hybrid", collegeIds: [243744], passages: [{ passageId: "p1", sourceId: "s1" }] },
    responseShape: { topLevelKeys: ["intent", "preferences"] },
  });
  assert.deepEqual(diagnostics.validatedInterpretation.mentionedUnitIds, [243744]);
  assert.deepEqual(diagnostics.effectiveRetrievalInterpretation.mentionedUnitIds, [243744]);
  assert.deepEqual(diagnostics.retrievedEvidence.collegeIds, [243744]);
  assert.equal(JSON.stringify(diagnostics).includes("raw generated text"), false);
  assert.deepEqual(sanitizedFailureDiagnostics({}), {
    validatedInterpretation: null, effectiveRetrievalInterpretation: null, retrievedEvidence: null, responseShape: null,
  });
});
