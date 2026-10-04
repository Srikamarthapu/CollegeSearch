#!/usr/bin/env node
import { randomBytes, createHash } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  aggregatePositiveMetrics,
  buildJudgedCases,
  createQueryEmbeddingCache,
  retrievalEvaluationLimit,
  retrievalEvaluationModes,
  scoreJudgedCase,
  sha256Hex,
  summarizeJudgments,
  validateQueryEmbeddingCache,
  validateRetrievalFixture,
} from "./lib/college-retrieval-evaluation.mjs";
import { buildCollegeKnowledge } from "./lib/college-knowledge.mjs";
import {
  createNvidiaProvider,
  createNvidiaRequestBudget,
  nvidiaConfigFromEnv,
} from "../app/lib/adviser/nvidia.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = resolve(root, "data/colleges.json");
const releaseMarkerPath = resolve(root, "data/college-knowledge-release.json");
const fixturePath = resolve(root, "tests/fixtures/retrieval-evaluation-cases.json");
const envPath = resolve(root, ".env.local");
const cachePath = resolve(root, "work/retrieval-evaluation-query-embeddings.json");
const localContainer = "collegesearch-goal-db-20261004";
const localDatabase = "collegesearch_m8_retrieval_verify";
const maxInputBytes = 12 * 1024 * 1024;
const maxOutputBytes = 24 * 1024 * 1024;
const localCommandTimeoutMs = 180_000;

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArgs(args) {
  const options = { evaluate: false, help: false, container: null, database: null, refreshQueryEmbeddings: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--evaluate") {
      if (seen.has(arg)) fail("--evaluate may be specified only once.");
      seen.add(arg);
      options.evaluate = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--refresh-query-embeddings") {
      if (seen.has(arg)) fail("--refresh-query-embeddings may be specified only once.");
      seen.add(arg);
      options.refreshQueryEmbeddings = true;
    } else if (arg === "--docker-container" || arg === "--database") {
      if (seen.has(arg)) fail(`${arg} may be specified only once.`);
      seen.add(arg);
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail(`${arg} requires a value.`);
      index += 1;
      if (arg === "--docker-container") options.container = value;
      else options.database = value;
    } else {
      fail(`Unknown option: ${arg}`);
    }
  }
  if ((options.container !== null || options.database !== null) &&
      (options.container !== localContainer || options.database !== localDatabase)) {
    fail("Database evaluation is pinned to the designated disposable M8 clone.");
  }
  if (options.evaluate && (options.container !== localContainer || options.database !== localDatabase)) {
    fail("Evaluation requires --docker-container collegesearch-goal-db-20261004 --database collegesearch_m8_retrieval_verify.");
  }
  if (options.refreshQueryEmbeddings && !options.evaluate) {
    fail("--refresh-query-embeddings requires explicit --evaluate.");
  }
  return options;
}

function sqlText(value) {
  if (value === null) return "NULL::text";
  if (typeof value !== "string" || value.includes("\u0000")) fail("Local SQL received invalid text.");
  return `'${value.replaceAll("'", "''")}'::text`;
}

function sqlVector(value) {
  if (value === null) return "NULL::extensions.vector";
  if (!Array.isArray(value) || value.length !== 2048 ||
      value.some((item) => typeof item !== "number" || !Number.isFinite(Math.fround(item))) ||
      !value.some((item) => Math.fround(item) !== 0)) {
    fail("Local SQL received an invalid 2048-dimension query vector.");
  }
  const literal = value.map((item) => String(Math.fround(item))).join(",");
  return `'[${literal}]'::extensions.vector`;
}

function buildReadOnlyHeader() {
  return "BEGIN READ ONLY;\nSET LOCAL ROLE anon;\nSET LOCAL statement_timeout = '30000ms';\n";
}

function buildPreflightSql(releaseId, model, modelVersion) {
  const release = sqlText(releaseId);
  const modelSql = sqlText(model);
  const versionSql = sqlText(modelVersion);
  return `${buildReadOnlyHeader()}
SELECT pg_catalog.json_build_object(
  'release', (SELECT pg_catalog.to_jsonb(active) FROM public.current_college_knowledge_release() AS active),
  'passageCount', (SELECT pg_catalog.count(*) FROM public.college_passages WHERE release_id = ${release}),
  'embeddedPassageCount', (SELECT pg_catalog.count(*) FROM public.college_passages WHERE release_id = ${release} AND embedding IS NOT NULL),
  'invalidEmbeddingCount', (SELECT pg_catalog.count(*) FROM public.college_passages
    WHERE release_id = ${release} AND (embedding IS NULL OR embedding_model IS DISTINCT FROM ${modelSql}
      OR embedding_version IS DISTINCT FROM ${versionSql}
      OR embedding_content_sha256 IS DISTINCT FROM content_sha256))
)::text;
ROLLBACK;\n`;
}

function buildSearchSql(cases, embeddings, model, modelVersion, releaseId) {
  if (cases.length !== embeddings.length || cases.length > 32) fail("Search query and embedding counts do not align.");
  const statements = [];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    const vector = embeddings[index];
    const modes = [
      { name: "keyword", queryText: item.query, queryVector: null, modelValue: null, versionValue: null },
      { name: "vector", queryText: "", queryVector: vector, modelValue: model, versionValue: modelVersion },
      { name: "hybrid", queryText: item.query, queryVector: vector, modelValue: model, versionValue: modelVersion },
    ];
    for (const mode of modes) {
      const call = `public.hybrid_search_college_passages(
  p_query_text => ${sqlText(mode.queryText)},
  p_query_embedding => ${sqlVector(mode.queryVector)},
  p_embedding_model => ${sqlText(mode.modelValue)},
  p_embedding_version => ${sqlText(mode.versionValue)},
  p_match_count => ${retrievalEvaluationLimit}::integer,
  p_unit_ids => NULL::bigint[],
  p_expected_release_id => ${sqlText(releaseId)}
)`;
      statements.push(`SELECT pg_catalog.json_build_object(
  'caseId', ${sqlText(item.id)},
  'mode', ${sqlText(mode.name)},
  'rows', COALESCE((SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(result)
    ORDER BY result.rrf_score DESC, result.passage_id) FROM ${call} AS result), '[]'::json)
)::text;`);
    }
  }
  return `${buildReadOnlyHeader()}${statements.join("\n")}\nROLLBACK;\n`;
}

async function runLocalPsql(sql) {
  if (typeof sql !== "string" || Buffer.byteLength(sql, "utf8") > maxInputBytes) fail("Local read-only SQL request exceeded its size limit.");
  const args = ["exec", "-i", localContainer, "psql", "-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", localDatabase];
  return new Promise((resolveOutput, rejectOutput) => {
    let settled = false;
    let bytes = 0;
    let timedOut = false;
    const chunks = [];
    let child;
    const timer = setTimeout(() => {
      timedOut = true;
      child?.kill("SIGTERM");
    }, localCommandTimeoutMs);
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectOutput(error);
      else resolveOutput(value);
    };
    try {
      child = spawn("docker", args, { stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      settle(new Error("Could not start the fixed local read-only database command."));
      return;
    }
    child.on("error", () => settle(new Error("Could not start the fixed local read-only database command.")));
    child.stdout.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > maxOutputBytes) {
        child.kill("SIGTERM");
        settle(new Error("Local read-only database output exceeded its size limit."));
      } else chunks.push(chunk);
    });
    child.stdin.on("error", () => undefined);
    child.on("close", (code) => {
      if (timedOut) settle(new Error("Local read-only database evaluation exceeded its time limit."));
      else if (code !== 0) settle(new Error("Local read-only database evaluation failed."));
      else settle(null, Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.end(`${sql}\n`);
  });
}

function parseSingleJsonLine(raw, label) {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) fail(`${label} returned an unexpected row count.`);
  try {
    return JSON.parse(lines[0]);
  } catch {
    fail(`${label} returned invalid JSON.`);
  }
}

function validatePublicRelease(preflight, canonical, releaseId, model, modelVersion) {
  const release = preflight?.release;
  if (!release || release.release_id !== releaseId || release.dataset_sha256 !== releaseId.slice("sha256:".length) ||
      release.institution_count !== canonical.catalog.length || release.embedding_model !== model ||
      release.embedding_version !== modelVersion || preflight.passageCount !== canonical.passages.length ||
      preflight.embeddedPassageCount !== canonical.passages.length || preflight.invalidEmbeddingCount !== 0) {
    fail("The local database release, corpus count, or complete embedding provenance does not match the canonical evaluation snapshot.");
  }
  return {
    releaseId: release.release_id,
    institutionCount: release.institution_count,
    passageCount: preflight.passageCount,
    embeddedPassageCount: preflight.embeddedPassageCount,
    embeddingModel: release.embedding_model,
    embeddingVersion: release.embedding_version,
  };
}

const rpcColumns = [
  "release_id", "unit_id", "college_slug", "college_name", "state", "census_region", "ownership_code",
  "passage_id", "title", "content", "source_id", "publisher", "source_name", "source_url", "source_field",
  "field_locator", "reporting_year", "period_label", "cohort", "definition", "content_sha256",
  "embedding_model", "embedding_version", "lexical_rank", "semantic_rank", "rrf_score",
];

function validateSearchRow(row, maps, releaseId, model, modelVersion) {
  if (!row || typeof row !== "object" || Array.isArray(row) ||
      Object.keys(row).length !== rpcColumns.length || rpcColumns.some((key) => !(key in row))) {
    fail("Retrieval returned an unexpected row contract.");
  }
  const passage = maps.passages.get(row.passage_id);
  const college = maps.colleges.get(row.unit_id);
  const source = maps.sources.get(row.source_id);
  if (!passage || !college || !source || !maps.bindings.has(`${row.unit_id}:${row.source_id}`) ||
      row.release_id !== releaseId || row.unit_id !== passage.unit_id || row.college_slug !== passage.college_slug ||
      row.college_name !== college.name || row.state !== college.state || row.census_region !== college.census_region ||
      row.ownership_code !== college.ownership_code || row.passage_id !== passage.passage_id ||
      row.title !== passage.title || row.content !== passage.content || row.source_id !== passage.source_id ||
      row.publisher !== source.publisher || row.source_name !== source.source_name || row.source_url !== passage.source_url ||
      row.source_field !== passage.source_field || row.field_locator !== passage.field_locator ||
      row.reporting_year !== passage.reporting_year || row.period_label !== passage.period_label ||
      row.cohort !== passage.cohort || row.definition !== passage.definition ||
      row.content_sha256 !== passage.content_sha256 || sha256Hex(row.content) !== row.content_sha256 ||
      row.embedding_model !== model || row.embedding_version !== modelVersion ||
      (row.lexical_rank !== null && (!Number.isSafeInteger(row.lexical_rank) || row.lexical_rank < 1)) ||
      (row.semantic_rank !== null && (!Number.isSafeInteger(row.semantic_rank) || row.semantic_rank < 1)) ||
      typeof row.rrf_score !== "number" || !Number.isFinite(row.rrf_score)) {
    fail("Retrieval returned a passage with an invalid release, college, source, content, or embedding binding.");
  }
  const allowedUrls = [source.source_url, source.source_page, source.artifact_url, ...(source.source_urls ?? [])].filter(Boolean);
  if (!allowedUrls.includes(row.source_url)) fail("Retrieved source URL is not registered for the institution's bound source.");
}

function parseSearchRows(raw, judgedCases, canonical, releaseId, model, modelVersion) {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  const expectedCount = judgedCases.length * retrievalEvaluationModes.length;
  if (lines.length !== expectedCount) fail("Local retrieval RPC returned an unexpected case/mode count.");
  const maps = {
    passages: new Map(canonical.passages.map((row) => [row.passage_id, row])),
    colleges: new Map(canonical.catalog.map((row) => [row.unit_id, row])),
    sources: new Map(canonical.sources.map((row) => [row.source_id, row])),
    bindings: new Set(canonical.bindings.map((row) => `${row.unit_id}:${row.source_id}`)),
  };
  const casesById = new Map(judgedCases.map((item) => [item.id, item]));
  const results = new Map();
  for (const line of lines) {
    let item;
    try { item = JSON.parse(line); } catch { fail("Local retrieval RPC returned invalid JSON."); }
    if (!item || !casesById.has(item.caseId) || !retrievalEvaluationModes.includes(item.mode) ||
        !Array.isArray(item.rows) || item.rows.length > retrievalEvaluationLimit) {
      fail("Local retrieval RPC returned an unknown case, mode, or row set.");
    }
    const key = `${item.caseId}:${item.mode}`;
    if (results.has(key)) fail("Local retrieval RPC duplicated a case/mode result.");
    const rowIds = new Set();
    for (const row of item.rows) {
      validateSearchRow(row, maps, releaseId, model, modelVersion);
      if (rowIds.has(row.passage_id)) fail("Local retrieval RPC returned a duplicate passage.");
      rowIds.add(row.passage_id);
    }
    results.set(key, item.rows);
  }
  return results;
}

async function readJson(path, maxBytes, label) {
  let bytes;
  try { bytes = await readFile(path); } catch (cause) {
    if (cause && typeof cause === "object" && cause.code === "ENOENT") return null;
    fail(`${label} could not be read.`);
  }
  if (bytes.byteLength > maxBytes) fail(`${label} exceeds its size limit.`);
  try { return JSON.parse(bytes.toString("utf8")); } catch { fail(`${label} is not valid JSON.`); }
}

async function writeAtomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

async function loadCanonical() {
  const [datasetBytes, marker, fixtureBytes] = await Promise.all([
    readFile(datasetPath), readJson(releaseMarkerPath, 8 * 1024, "Knowledge release marker"),
    readFile(fixturePath),
  ]);
  const releaseId = `sha256:${sha256(datasetBytes)}`;
  if (!marker || marker.releaseId !== releaseId) fail("Raw catalog bytes do not match the stored knowledge release marker.");
  let dataset;
  let fixture;
  try {
    dataset = JSON.parse(datasetBytes.toString("utf8"));
    fixture = JSON.parse(fixtureBytes.toString("utf8"));
  } catch {
    fail("Catalog or retrieval evaluation fixture contains invalid JSON.");
  }
  const cases = validateRetrievalFixture(fixture, releaseId);
  const canonical = buildCollegeKnowledge(dataset, releaseId);
  if (canonical.release.institution_count !== dataset.colleges.length || canonical.catalog.length !== dataset.colleges.length) {
    fail("Canonical knowledge compiler returned an inconsistent institution count.");
  }
  const judgedCases = buildJudgedCases(cases, canonical);
  return {
    releaseId,
    fixtureSha256: sha256(fixtureBytes),
    fixture,
    cases,
    judgedCases,
    canonical,
  };
}

async function loadNvidiaConfig() {
  try {
    await readFile(envPath, { flag: "r" });
    process.loadEnvFile(envPath);
  } catch (cause) {
    if (!(cause && typeof cause === "object" && cause.code === "ENOENT")) {
      fail("The local NVIDIA evaluation environment could not be loaded.");
    }
  }
  const config = nvidiaConfigFromEnv();
  if (config.mode !== "evaluation" || !config.apiKey?.trim()) {
    fail("Set NVIDIA_MODE=evaluation and a server-side NVIDIA_API_KEY in the local environment.");
  }
  if (config.embeddingModel !== "nvidia/nemotron-3-embed-1b" || config.embeddingModelVersion === "unversioned-provider-alias") {
    fail("The evaluation requires the pinned embedding model and an explicit model-version label.");
  }
  return { ...config, chatFallbackModels: [], maxProviderAttempts: 1, retryDelayMs: 0 };
}

async function loadOrCreateQueryEmbeddings(context, release, config, refresh) {
  const expected = {
    fixtureSha256: context.fixtureSha256,
    releaseId: context.releaseId,
    model: release.embeddingModel,
    modelVersion: release.embeddingVersion,
    cases: context.cases,
  };
  const saved = refresh ? null : await readJson(cachePath, 4 * 1024 * 1024, "Query embedding cache");
  if (saved && !refresh) {
    return {
      embeddings: validateQueryEmbeddingCache(saved, expected),
      source: "verified-cache",
      providerRequests: 0,
      cachedEmbeddingBatch: {
        providerRequests: saved.providerRequests,
        requestAttempts: saved.providerRequestAttempts,
        usage: saved.usage,
        latencyMs: saved.latencyMs,
        createdAt: saved.createdAt,
      },
    };
  }
  const budget = createNvidiaRequestBudget(1);
  const provider = createNvidiaProvider(config, fetch, { requestBudget: budget });
  const started = performance.now();
  const response = await provider.embedMany(context.cases.map((item) => item.query), "query");
  const latencyMs = Math.round(performance.now() - started);
  if (budget.usedRequests !== 1 || response.requestAttempts !== 1 || response.model !== release.embeddingModel ||
      response.modelVersion !== release.embeddingVersion || response.embeddings.length !== context.cases.length) {
    fail("NVIDIA query embeddings did not match the active release or single-request limit.");
  }
  const cache = createQueryEmbeddingCache({ ...expected, embeddings: response.embeddings, usage: response.usage, latencyMs });
  await writeAtomicJson(cachePath, cache);
  return {
    embeddings: cache.embeddings,
    source: "single-provider-batch",
    providerRequests: 1,
    cachedEmbeddingBatch: {
      providerRequests: cache.providerRequests,
      requestAttempts: cache.providerRequestAttempts,
      usage: cache.usage,
      latencyMs: cache.latencyMs,
      createdAt: cache.createdAt,
    },
  };
}

function buildReport(context, release, embeddingSource, results) {
  const reportCases = context.judgedCases.map((item) => {
    const modes = Object.fromEntries(retrievalEvaluationModes.map((mode) => {
      const rows = results.get(`${item.id}:${mode}`);
      if (!rows) fail(`Missing retrieval results for ${item.id}/${mode}.`);
      return [mode, scoreJudgedCase(item, rows)];
    }));
    return {
      id: item.id,
      query: item.query,
      judgment: item.judgment,
      candidateCollegeCount: item.goldCollegeCount,
      judgedPassageCount: item.goldPassageCount,
      modes,
    };
  });
  const byMode = Object.fromEntries(retrievalEvaluationModes.map((mode) => {
    const scores = reportCases.map((item) => item.modes[mode]);
    const unsupported = scores.filter((item) => item.judgment === "unsupported");
    return [mode, {
      supportedMetrics: aggregatePositiveMetrics(scores),
      unsupportedCases: unsupported.length,
      unsupportedReturnedRows: unsupported.reduce((total, item) => total + item.returnedRowCount, 0),
      unsupportedTop5Neighbors: unsupported.reduce((total, item) => total + item.unjudgedNearestNeighbors.length, 0),
    }];
  }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    release: {
      releaseId: context.releaseId,
      institutionCount: release.institutionCount,
      passageCount: release.passageCount,
      embeddingModel: release.embeddingModel,
      embeddingVersion: release.embeddingVersion,
    },
    fixture: {
      sha256: context.fixtureSha256,
      caseCount: context.cases.length,
      candidateScope: context.fixture.candidateScope,
      judgments: summarizeJudgments(context.judgedCases),
    },
    queryEmbeddings: {
      source: embeddingSource.source,
      providerRequestsThisRun: embeddingSource.providerRequests,
      cachedEmbeddingBatch: embeddingSource.cachedEmbeddingBatch,
      inputType: "query",
      dimensions: 2048,
      model: release.embeddingModel,
      modelVersion: release.embeddingVersion,
    },
    retrieval: { modes: retrievalEvaluationModes, resultLimit: retrievalEvaluationLimit, metricCutoff: 5 },
    metricsByMode: byMode,
    cases: reportCases,
    limitations: [
      "Positive relevance is judged against the predeclared institution, location, ownership, and exact CIP degree-availability locators.",
      "The catalog supports broad federal program-availability evidence; it does not contain campus-life, dorm-safety, personal-admission-odds, or program/job guarantees.",
      "Unsupported-query neighbors are reported as unjudged retrievals and do not count as successes or supported claims.",
      "This bounded synthetic benchmark does not establish broad production recommendation quality.",
    ],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/evaluate-college-retrieval.mjs [--evaluate --docker-container collegesearch-goal-db-20261004 --database collegesearch_m8_retrieval_verify] [--refresh-query-embeddings]\n\nDefault mode compiles canonical source records and reports fixed judgment coverage only. It reads no secrets and makes no provider or database calls. Evaluation is pinned to one disposable Docker database, uses one query-embedding batch of at most 32 fixture cases, and runs keyword/vector/hybrid SQL in a read-only anon transaction.\n");
    return;
  }
  const context = await loadCanonical();
  if (!options.evaluate) {
    process.stdout.write(`${JSON.stringify({
      status: "dry-run",
      releaseId: context.releaseId,
      institutionCount: context.canonical.catalog.length,
      passageCount: context.canonical.passages.length,
      caseCount: context.cases.length,
      judgments: summarizeJudgments(context.judgedCases),
      retrievalModes: retrievalEvaluationModes,
      resultLimit: retrievalEvaluationLimit,
      metricCutoff: 5,
      plannedQueryEmbeddingRequests: 1,
      providerRequests: 0,
      databaseQueries: 0,
      note: "No environment secrets, provider calls, Docker commands, or database queries were used.",
    })}\n`);
    return;
  }

  const config = await loadNvidiaConfig();
  const preflight = parseSingleJsonLine(
    await runLocalPsql(buildPreflightSql(context.releaseId, config.embeddingModel, config.embeddingModelVersion)),
    "Local release preflight",
  );
  const release = validatePublicRelease(preflight, context.canonical, context.releaseId,
    config.embeddingModel, config.embeddingModelVersion);
  const embeddingSource = await loadOrCreateQueryEmbeddings(context, release, config, options.refreshQueryEmbeddings);
  const rawResults = await runLocalPsql(buildSearchSql(context.cases, embeddingSource.embeddings,
    release.embeddingModel, release.embeddingVersion, context.releaseId));
  const results = parseSearchRows(rawResults, context.judgedCases, context.canonical,
    context.releaseId, release.embeddingModel, release.embeddingVersion);
  const report = buildReport(context, release, embeddingSource, results);
  const reportPath = resolve(root, `work/retrieval-evaluation-${context.releaseId.slice(7, 15)}-${Date.now()}.json`);
  await writeAtomicJson(reportPath, report);
  process.stdout.write(`${JSON.stringify({
    status: "complete",
    reportPath,
    release: report.release,
    cases: context.cases.length,
    positiveCases: report.fixture.judgments.filter((item) => item.type === "supported").length,
    unsupportedCases: report.fixture.judgments.filter((item) => item.type === "unsupported").length,
    metricsByMode: report.metricsByMode,
    providerRequests: embeddingSource.providerRequests,
    databaseTransactions: 2,
  })}\n`);
}

export { buildPreflightSql, buildSearchSql, parseArgs, validatePublicRelease, validateSearchRow };

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((cause) => {
    const message = cause instanceof Error ? cause.message : "unexpected failure";
    process.stderr.write(`College retrieval evaluation failed: ${message}\n`);
    process.exitCode = 1;
  });
}
