import { createHash } from "node:crypto";

export const retrievalEvaluationModes = ["keyword", "vector", "hybrid"];
export const retrievalEvaluationLimit = 20;
export const retrievalEvaluationCutoff = 5;
export const queryEmbeddingDimensions = 2048;
const validOwnership = new Set(["Public", "Private nonprofit", "Private for-profit"]);
const validDegreeLevels = new Set(["associate", "bachelors"]);

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !expected.includes(key)) ||
      expected.some((key) => !(key in value))) {
    fail(`${label} has an unexpected shape.`);
  }
}

function allowedKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key))) {
    fail(`${label} has an unexpected shape.`);
  }
}

export function validateRetrievalFixture(fixture, releaseId) {
  if (!fixture || fixture.schemaVersion !== 1 || fixture.releaseId !== releaseId ||
      fixture.candidateScope !== "global-current-release" || !Array.isArray(fixture.cases) ||
      fixture.cases.length < 1 || fixture.cases.length > 32) {
    fail("Retrieval evaluation fixture does not match the active source release or supported schema.");
  }
  const seenIds = new Set();
  for (const item of fixture.cases) {
    exactKeys(item, ["id", "query", "judgment", "rationale"], "Retrieval evaluation case");
    if (typeof item.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || seenIds.has(item.id) ||
        typeof item.query !== "string" || !item.query.trim() || item.query.length > 500 ||
        typeof item.rationale !== "string" || !item.rationale.trim()) {
      fail("Retrieval evaluation case has an invalid ID, query, or rationale.");
    }
    seenIds.add(item.id);
    const judgment = item.judgment;
    if (!judgment || typeof judgment !== "object" || Array.isArray(judgment)) {
      fail(`${item.id} has no judgment.`);
    }
    if (judgment.type === "unsupported") {
      exactKeys(judgment, ["type", "reason"], `${item.id} unsupported judgment`);
      if (typeof judgment.reason !== "string" || !judgment.reason.trim()) fail(`${item.id} needs an unsupported reason.`);
      continue;
    }
    allowedKeys(judgment, ["type", "unitIds", "states", "ownership", "cipCode", "degreeLevel"], `${item.id} supported judgment`);
    if (judgment.type !== "supported" ||
        (!Array.isArray(judgment.unitIds) && !Array.isArray(judgment.states)) ||
        (judgment.unitIds !== undefined && (!Array.isArray(judgment.unitIds) || judgment.unitIds.length < 1 ||
          judgment.unitIds.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(judgment.unitIds).size !== judgment.unitIds.length)) ||
        (judgment.states !== undefined && (!Array.isArray(judgment.states) || judgment.states.length < 1 ||
          judgment.states.some((state) => typeof state !== "string" || !/^[A-Z]{2}$/.test(state)) || new Set(judgment.states).size !== judgment.states.length)) ||
        (judgment.ownership !== undefined && !validOwnership.has(judgment.ownership)) ||
        typeof judgment.cipCode !== "string" || !/^\d{2}$/.test(judgment.cipCode) ||
        (judgment.degreeLevel !== undefined && !validDegreeLevels.has(judgment.degreeLevel))) {
      fail(`${item.id} has an invalid positive judgment selector.`);
    }
  }
  if (seenIds.size !== fixture.cases.length) fail("Retrieval evaluation case IDs are not unique.");
  return fixture.cases;
}

/** Parse only exact, comma-delimited CIP degree-availability locator tokens. */
export function exactCipAvailabilityTokens(sourceField) {
  if (typeof sourceField !== "string" || !sourceField.trim()) return [];
  const tokens = sourceField.split(",").map((value) => value.trim());
  return tokens.flatMap((token) => {
    const match = /^CIP(\d{2})(ASSOC|BACHL)$/.exec(token);
    return match ? [{ cipCode: match[1], degreeLevel: match[2] === "ASSOC" ? "associate" : "bachelors", token }] : [];
  });
}

function matchesJudgment(passage, college, judgment) {
  if (Array.isArray(judgment.unitIds) && !judgment.unitIds.includes(college.unit_id)) return false;
  if (Array.isArray(judgment.states) && !judgment.states.includes(college.state)) return false;
  if (judgment.ownership && judgment.ownership !== college.ownership_label) return false;
  return exactCipAvailabilityTokens(passage.source_field).some((token) =>
    token.cipCode === judgment.cipCode && (!judgment.degreeLevel || token.degreeLevel === judgment.degreeLevel));
}

/** Resolve predeclared selectors to canonical passage IDs without consulting result ranks. */
export function buildJudgedCases(cases, canonicalSeed) {
  if (!Array.isArray(cases) || !canonicalSeed || !Array.isArray(canonicalSeed.catalog) || !Array.isArray(canonicalSeed.passages)) {
    fail("Canonical college passage records are required to build judgments.");
  }
  const collegesById = new Map(canonicalSeed.catalog.map((college) => [college.unit_id, college]));
  if (collegesById.size !== canonicalSeed.catalog.length) fail("Canonical college UNITIDs are not unique.");
  const seenPassages = new Set();
  for (const passage of canonicalSeed.passages) {
    if (seenPassages.has(passage.passage_id) || !collegesById.has(passage.unit_id)) {
      fail("Canonical passage IDs or institution bindings are invalid.");
    }
    seenPassages.add(passage.passage_id);
  }
  return cases.map((item) => {
    if (item.judgment.type === "unsupported") {
      return { ...item, goldPassageIds: new Set(), goldCollegeUnitIds: [], goldPassageCount: 0, goldCollegeCount: 0 };
    }
    const matching = canonicalSeed.passages.filter((passage) => {
      const college = collegesById.get(passage.unit_id);
      return matchesJudgment(passage, college, item.judgment);
    });
    const goldPassageIds = new Set(matching.map((passage) => passage.passage_id));
    const goldCollegeUnitIds = [...new Set(matching.map((passage) => passage.unit_id))].sort((a, b) => a - b);
    if (goldPassageIds.size === 0 || goldCollegeUnitIds.length === 0) {
      fail(`${item.id} has no canonical source-located passage matching its predeclared judgment.`);
    }
    return {
      ...item,
      goldPassageIds,
      goldCollegeUnitIds,
      goldPassageCount: goldPassageIds.size,
      goldCollegeCount: goldCollegeUnitIds.length,
    };
  });
}

export function summarizeJudgments(judgedCases) {
  return judgedCases.map((item) => ({
    id: item.id,
    type: item.judgment.type,
    candidateCollegeCount: item.goldCollegeCount,
    judgedPassageCount: item.goldPassageCount,
    selector: item.judgment.type === "supported"
      ? {
          unitIds: item.judgment.unitIds ?? null,
          states: item.judgment.states ?? null,
          ownership: item.judgment.ownership ?? null,
          cipCode: item.judgment.cipCode,
          degreeLevel: item.judgment.degreeLevel ?? null,
        }
      : { unsupportedReason: item.judgment.reason },
  }));
}

export function compactRetrievedPassage(row) {
  return {
    passageId: row.passage_id,
    unitId: Number(row.unit_id),
    collegeSlug: row.college_slug,
    fieldLocator: row.field_locator,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    reportingYear: row.reporting_year,
    cohort: row.cohort,
    lexicalRank: row.lexical_rank,
    semanticRank: row.semantic_rank,
    rrfScore: row.rrf_score,
  };
}

export function scoreJudgedCase(item, rows, cutoff = retrievalEvaluationCutoff) {
  if (!Number.isSafeInteger(cutoff) || cutoff < 1 || cutoff > 20 || !Array.isArray(rows)) {
    fail("Retrieval scoring received an invalid result cutoff or row set.");
  }
  if (item.judgment.type === "unsupported") {
    return {
      caseId: item.id,
      judgment: "unsupported",
      metrics: null,
      unjudgedNearestNeighbors: rows.slice(0, cutoff).map(compactRetrievedPassage),
      returnedRowCount: rows.length,
    };
  }
  const top = rows.slice(0, cutoff);
  const relevantRanks = [];
  for (let index = 0; index < top.length; index += 1) {
    if (item.goldPassageIds.has(top[index].passage_id)) relevantRanks.push(index + 1);
  }
  return {
    caseId: item.id,
    judgment: "supported",
    metrics: {
      pAt5: relevantRanks.length / cutoff,
      rAt5: relevantRanks.length / item.goldPassageCount,
      reciprocalRank: relevantRanks.length ? 1 / relevantRanks[0] : 0,
      hitAt5: relevantRanks.length > 0,
      relevantAt5: relevantRanks.length,
      goldPassageCount: item.goldPassageCount,
      goldCollegeCount: item.goldCollegeCount,
    },
    topPassages: top.map(compactRetrievedPassage),
  };
}

export function aggregatePositiveMetrics(caseScores) {
  const positives = caseScores.filter((score) => score.judgment === "supported");
  if (positives.length === 0) return { positiveCases: 0, pAt5: null, rAt5: null, mrr: null, hitAt5: null };
  const average = (key) => positives.reduce((total, score) => total + score.metrics[key], 0) / positives.length;
  return {
    positiveCases: positives.length,
    pAt5: average("pAt5"),
    rAt5: average("rAt5"),
    mrr: average("reciprocalRank"),
    hitAt5: average("hitAt5"),
  };
}

function validateEmbeddingVector(vector, index) {
  if (!Array.isArray(vector) || vector.length !== queryEmbeddingDimensions ||
      vector.some((value) => typeof value !== "number" || !Number.isFinite(Math.fround(value))) ||
      !vector.some((value) => Math.fround(value) !== 0)) {
    fail(`Query embedding ${index} is not a nonzero ${queryEmbeddingDimensions}-dimension vector.`);
  }
}

function queryDescriptor(cases) {
  return cases.map(({ id, query }) => ({ id, querySha256: sha256(query) }));
}

export function createQueryEmbeddingCache({
  fixtureSha256, releaseId, model, modelVersion, cases, embeddings,
  usage, latencyMs, createdAt = new Date().toISOString(),
}) {
  if (!/^[a-f0-9]{64}$/.test(fixtureSha256) || !/^sha256:[a-f0-9]{64}$/.test(releaseId) ||
      typeof model !== "string" || !model.trim() || typeof modelVersion !== "string" || !modelVersion.trim() ||
      !Array.isArray(cases) || cases.length < 1 || cases.length > 32 || !Array.isArray(embeddings) || embeddings.length !== cases.length ||
      !validUsage(usage) || typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0 ||
      typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) {
    fail("Query embedding cache metadata is incomplete or oversized.");
  }
  embeddings.forEach(validateEmbeddingVector);
  const vectorSha256 = sha256(JSON.stringify(embeddings.map((vector) => vector.map(Math.fround))));
  return {
    schemaVersion: 1,
    fixtureSha256,
    releaseId,
    model,
    modelVersion,
    inputType: "query",
    dimensions: queryEmbeddingDimensions,
    createdAt,
    latencyMs,
    providerRequests: 1,
    providerRequestAttempts: 1,
    usage,
    queries: queryDescriptor(cases),
    vectorSha256,
    embeddings: embeddings.map((vector) => vector.map(Math.fround)),
  };
}

export function validateQueryEmbeddingCache(cache, expected) {
  exactKeys(cache, ["schemaVersion", "fixtureSha256", "releaseId", "model", "modelVersion", "inputType", "dimensions", "createdAt", "latencyMs", "providerRequests", "providerRequestAttempts", "usage", "queries", "vectorSha256", "embeddings"], "Query embedding cache");
  if (cache.schemaVersion !== 1 || cache.fixtureSha256 !== expected.fixtureSha256 ||
      cache.releaseId !== expected.releaseId || cache.model !== expected.model ||
      cache.modelVersion !== expected.modelVersion || cache.inputType !== "query" ||
      cache.dimensions !== queryEmbeddingDimensions ||
      typeof cache.createdAt !== "string" || !Number.isFinite(Date.parse(cache.createdAt)) ||
      typeof cache.latencyMs !== "number" || !Number.isFinite(cache.latencyMs) || cache.latencyMs < 0 ||
      cache.providerRequests !== 1 || cache.providerRequestAttempts !== 1 || !validUsage(cache.usage) ||
      JSON.stringify(cache.queries) !== JSON.stringify(queryDescriptor(expected.cases)) ||
      !Array.isArray(cache.embeddings) || cache.embeddings.length !== expected.cases.length ||
      !/^[a-f0-9]{64}$/.test(cache.vectorSha256 ?? "")) {
    fail("Cached query embeddings do not match the approved fixture, release, and model version.");
  }
  cache.embeddings.forEach(validateEmbeddingVector);
  const digest = sha256(JSON.stringify(cache.embeddings.map((vector) => vector.map(Math.fround))));
  if (digest !== cache.vectorSha256) fail("Cached query embedding checksum does not match its vectors.");
  return cache.embeddings;
}

function validUsage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["promptTokens", "completionTokens", "totalTokens"].includes(key)) ||
      ["promptTokens", "completionTokens", "totalTokens"].some((key) => !(key in value))) return false;
  return [value.promptTokens, value.completionTokens, value.totalTokens].every((item) =>
    item === null || (Number.isSafeInteger(item) && item >= 0 && item <= 2_000_000_000));
}

export function sha256Hex(value) {
  return sha256(value);
}
