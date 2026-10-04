import { createHash } from "node:crypto";

export const collegeEmbeddingArtifactType = "college-embedding-index";
export const collegeEmbeddingSchemaVersion = 1;
export const collegeEmbeddingDimensions = 2048;

const digestPattern = /^[a-f0-9]{64}$/;
const releasePattern = /^sha256:([a-f0-9]{64})$/;

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** JSON encoding with object keys sorted at every depth. */
export function stableJson(value) {
  const encode = (item) => {
    if (item === null || typeof item === "boolean" || typeof item === "string") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) fail("Canonical JSON cannot contain a non-finite number.");
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
    if (typeof item !== "object" || Object.getPrototypeOf(item) !== Object.prototype) {
      fail("Canonical JSON contains an unsupported value.");
    }
    const keys = Object.keys(item).sort();
    if (keys.some((key) => item[key] === undefined)) fail("Canonical JSON cannot contain undefined values.");
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(item[key])}`).join(",")}}`;
  };
  return encode(value);
}

function withoutDigest(record) {
  const body = { ...record };
  delete body.artifactSha256;
  return body;
}

export function computeArtifactSha256(record) {
  return sha256(stableJson(withoutDigest(record)));
}

function requireLabel(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${label} is invalid.`);
  }
  return value;
}

export function assertExplicitEmbeddingModelVersion(value) {
  requireLabel(value, "Embedding model version");
  const normalized = value.trim().toLowerCase();
  if (["unversioned-provider-alias", "unversioned", "unknown", "latest", "current"].includes(normalized)) {
    fail("Set NVIDIA_EMBEDDING_MODEL_VERSION to an explicit operator-reviewed snapshot label before indexing.");
  }
  return value.trim();
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateCanonicalSeed(canonicalSeed) {
  const releaseId = canonicalSeed?.release?.release_id;
  const match = typeof releaseId === "string" ? releasePattern.exec(releaseId) : null;
  if (!match || canonicalSeed.release.dataset_sha256 !== match[1]) {
    fail("Canonical seed release ID and dataset hash do not match.");
  }
  if (canonicalSeed.release.embedding_dimensions !== collegeEmbeddingDimensions || !Array.isArray(canonicalSeed.passages)) {
    fail("Canonical seed is missing passages or expected 2048-dimensional embedding metadata.");
  }

  const byId = new Map();
  for (const passage of canonicalSeed.passages) {
    if (!passage || typeof passage.passage_id !== "string" || !digestPattern.test(passage.passage_id) ||
        !Number.isSafeInteger(passage.unit_id) || passage.unit_id <= 0 ||
        typeof passage.source_id !== "string" || !passage.source_id.trim() ||
        typeof passage.content !== "string" || !passage.content.trim() ||
        typeof passage.content_sha256 !== "string" || !digestPattern.test(passage.content_sha256) ||
        sha256(passage.content) !== passage.content_sha256) {
      fail("Canonical seed contains a malformed passage or content hash.");
    }
    if (byId.has(passage.passage_id)) fail("Canonical seed contains duplicate passage IDs.");
    if (passage.release_id !== releaseId) fail("Canonical seed passage belongs to another release.");
    byId.set(passage.passage_id, passage);
  }
  if (!byId.size) fail("Canonical seed contains no passages.");
  return { releaseId, datasetSha256: match[1], passagesById: byId };
}

function sortedDescriptors(canonicalSeed) {
  const { passagesById } = validateCanonicalSeed(canonicalSeed);
  return [...passagesById.values()]
    .map((passage) => ({
      passageId: passage.passage_id,
      unitId: passage.unit_id,
      sourceId: passage.source_id,
      contentSha256: passage.content_sha256,
    }))
    .sort((left, right) => compareText(left.passageId, right.passageId));
}

export function computeContentManifestSha256(canonicalSeed) {
  return sha256(stableJson(sortedDescriptors(canonicalSeed)));
}

export function verifyContentManifest(record, canonicalSeed) {
  const { releaseId, datasetSha256 } = validateCanonicalSeed(canonicalSeed);
  const expectedCount = canonicalSeed.passages.length;
  if (record?.releaseId !== releaseId || record?.datasetSha256 !== datasetSha256 ||
      record?.contentManifestSha256 !== computeContentManifestSha256(canonicalSeed) ||
      record?.expectedPassageCount !== expectedCount) {
    fail("Embedding record is bound to a different release or canonical content manifest.");
  }
  return true;
}

export function createEmbeddingArtifactMetadata(canonicalSeed, model, modelVersion) {
  const { releaseId, datasetSha256 } = validateCanonicalSeed(canonicalSeed);
  requireLabel(model, "Embedding model");
  requireLabel(modelVersion, "Embedding model version");
  return {
    artifactType: collegeEmbeddingArtifactType,
    schemaVersion: collegeEmbeddingSchemaVersion,
    releaseId,
    datasetSha256,
    contentManifestSha256: computeContentManifestSha256(canonicalSeed),
    model,
    modelVersion,
    dimensions: collegeEmbeddingDimensions,
    expectedPassageCount: canonicalSeed.passages.length,
  };
}

function normalizeVector(vector, expectedDimensions = collegeEmbeddingDimensions) {
  if (!Array.isArray(vector) || vector.length !== expectedDimensions) {
    fail(`Embedding vectors must contain exactly ${expectedDimensions} dimensions.`);
  }
  const normalized = vector.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) fail("Embedding vectors must contain only finite numbers.");
    const float32 = Math.fround(value);
    if (!Number.isFinite(float32)) fail("Embedding vector value exceeds PostgreSQL float32 range.");
    return float32;
  });
  if (!normalized.some((value) => value !== 0)) fail("Embedding vectors must be nonzero after float32 conversion.");
  return normalized;
}

function normalizeEntry(entry, descriptor, model, modelVersion) {
  if (!entry || entry.passageId !== descriptor.passageId || entry.unitId !== descriptor.unitId ||
      entry.sourceId !== descriptor.sourceId || entry.contentSha256 !== descriptor.contentSha256 ||
      entry.model !== model || entry.modelVersion !== modelVersion ||
      entry.dimensions !== collegeEmbeddingDimensions) {
    fail("Embedding entry is not bound to the expected canonical passage, model, version, or dimensions.");
  }
  const embedding = normalizeVector(entry.embedding);
  if (entry.embedding.some((value, index) => value !== embedding[index])) {
    fail("Embedding entries must store canonical float32 vector values.");
  }
  return {
    passageId: descriptor.passageId,
    unitId: descriptor.unitId,
    sourceId: descriptor.sourceId,
    contentSha256: descriptor.contentSha256,
    model,
    modelVersion,
    dimensions: collegeEmbeddingDimensions,
    embedding,
  };
}

function normalizeEntries(entries, canonicalSeed, model, modelVersion) {
  if (!Array.isArray(entries)) fail("Embedding record entries must be an array.");
  const descriptors = new Map(sortedDescriptors(canonicalSeed).map((row) => [row.passageId, row]));
  const seen = new Set();
  const normalized = entries.map((entry) => {
    if (seen.has(entry?.passageId)) fail("Embedding record contains duplicate passage IDs.");
    seen.add(entry?.passageId);
    const descriptor = descriptors.get(entry?.passageId);
    if (!descriptor) fail("Embedding record contains an ID outside the canonical release.");
    return normalizeEntry(entry, descriptor, model, modelVersion);
  }).sort((left, right) => left.passageId.localeCompare(right.passageId));
  return normalized;
}

/** Seal a partial checkpoint or complete artifact after canonicalizing row order. */
export function sealEmbeddingArtifact(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("Embedding record must be an object.");
  const entries = Array.isArray(record.entries)
    ? record.entries.map((entry) => entry && Array.isArray(entry.embedding)
      ? { ...entry, embedding: normalizeVector(entry.embedding) }
      : entry).sort((left, right) => String(left?.passageId).localeCompare(String(right?.passageId)))
    : record.entries;
  const sealed = { ...record, entries, completedPassageCount: Array.isArray(entries) ? entries.length : record.completedPassageCount };
  delete sealed.artifactSha256;
  sealed.artifactSha256 = computeArtifactSha256(sealed);
  return sealed;
}

export function createEmbeddingCheckpoint(canonicalSeed, model, modelVersion, timestamp = new Date().toISOString()) {
  const metadata = createEmbeddingArtifactMetadata(canonicalSeed, model, modelVersion);
  return sealEmbeddingArtifact({
    ...metadata,
    status: "partial",
    createdAt: timestamp,
    updatedAt: timestamp,
    completedPassageCount: 0,
    entries: [],
  });
}

function validateRecordEnvelope(record, canonicalSeed, status) {
  if (!record || record.artifactType !== collegeEmbeddingArtifactType ||
      record.schemaVersion !== collegeEmbeddingSchemaVersion || record.status !== status ||
      record.dimensions !== collegeEmbeddingDimensions) {
    fail(`Embedding record must be a ${status} ${collegeEmbeddingArtifactType} artifact.`);
  }
  requireLabel(record.model, "Embedding model");
  assertExplicitEmbeddingModelVersion(record.modelVersion);
  verifyContentManifest(record, canonicalSeed);
  const expectedDigest = computeArtifactSha256(record);
  if (typeof record.artifactSha256 !== "string" || !digestPattern.test(record.artifactSha256) || record.artifactSha256 !== expectedDigest) {
    fail("Embedding record integrity hash does not match its contents.");
  }
  if (!Array.isArray(record.entries) || record.entries.some((entry, index) =>
    index > 0 && compareText(record.entries[index - 1]?.passageId ?? "", entry?.passageId ?? "") >= 0)) {
    fail("Embedding record entries must be uniquely sorted by passage ID.");
  }
  const normalized = normalizeEntries(record.entries, canonicalSeed, record.model, record.modelVersion);
  if (!Number.isSafeInteger(record.completedPassageCount) || record.completedPassageCount !== normalized.length) {
    fail("Embedding record completed count does not match its entries.");
  }
  return { ...record, entries: normalized };
}

export function validateEmbeddingCheckpoint(checkpoint, canonicalSeed, model, modelVersion) {
  const normalized = validateRecordEnvelope(checkpoint, canonicalSeed, "partial");
  if (normalized.model !== model || normalized.modelVersion !== modelVersion) {
    fail("Saved checkpoint model or version does not match the requested configuration.");
  }
  if (normalized.completedPassageCount > normalized.expectedPassageCount) {
    fail("Saved checkpoint has more entries than the canonical passage count.");
  }
  return normalized;
}

export function validateEmbeddingArtifact(artifact, canonicalSeed) {
  const normalized = validateRecordEnvelope(artifact, canonicalSeed, "complete");
  if (normalized.expectedPassageCount !== canonicalSeed.passages.length ||
      normalized.completedPassageCount !== canonicalSeed.passages.length ||
      normalized.entries.length !== canonicalSeed.passages.length) {
    fail("Completed embedding artifact does not cover the full canonical passage release.");
  }
  return normalized;
}

export function createCompletedEmbeddingArtifact(checkpoint, canonicalSeed, completedAt = new Date().toISOString()) {
  const validated = validateEmbeddingCheckpoint(checkpoint, canonicalSeed, checkpoint?.model, checkpoint?.modelVersion);
  if (validated.completedPassageCount !== validated.expectedPassageCount) {
    fail("Cannot create a completed artifact until every canonical passage is embedded.");
  }
  const artifact = sealEmbeddingArtifact({
    ...withoutDigest(validated),
    status: "complete",
    completedAt,
  });
  return validateEmbeddingArtifact(artifact, canonicalSeed);
}

function safeErrorCode(error) {
  const candidate = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  return /^[a-z0-9_]{1,48}$/.test(candidate) ? candidate : "embedding_failed";
}

/**
 * Embed at most maxCalls passages, sequentially. `onCheckpoint` receives an
 * immutable, sealed record before calls and after each checkpoint batch.
 */
export async function runEmbeddingIndex({
  canonicalSeed,
  model,
  modelVersion,
  provider,
  maxCalls,
  checkpoint: savedCheckpoint = null,
  checkpointEvery = 32,
  onCheckpoint = async () => {},
  now = () => new Date().toISOString(),
}) {
  if (!provider || typeof provider.embed !== "function") fail("An embedding provider is required.");
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 64) fail("maxCalls must be an integer from 1 through 64.");
  assertExplicitEmbeddingModelVersion(modelVersion);
  if (!Number.isSafeInteger(checkpointEvery) || checkpointEvery < 1 || checkpointEvery > 64) fail("checkpointEvery must be an integer from 1 through 64.");

  let checkpoint = savedCheckpoint
    ? validateEmbeddingCheckpoint(savedCheckpoint, canonicalSeed, model, modelVersion)
    : createEmbeddingCheckpoint(canonicalSeed, model, modelVersion, now());
  if (!savedCheckpoint) await onCheckpoint(checkpoint);

  const workingEntries = [...checkpoint.entries];
  const existing = new Set(workingEntries.map((entry) => entry.passageId));
  const passages = [...canonicalSeed.passages]
    .sort((left, right) => compareText(left.passage_id, right.passage_id))
    .filter((passage) => !existing.has(passage.passage_id));
  const allowance = Math.min(maxCalls, passages.length);
  let providerCalls = 0;
  let embeddedThisRun = 0;
  let unsaved = 0;

  for (const passage of passages.slice(0, allowance)) {
    providerCalls += 1;
    let entry;
    try {
      const result = await provider.embed(passage.content, "passage");
      if (result?.model !== model || result?.modelVersion !== modelVersion) {
        fail("Embedding provider returned a different model or version than configured.");
      }
      const descriptor = {
        passageId: passage.passage_id,
        unitId: passage.unit_id,
        sourceId: passage.source_id,
        contentSha256: passage.content_sha256,
      };
      entry = normalizeEntry({
        ...descriptor,
        model,
        modelVersion,
        dimensions: collegeEmbeddingDimensions,
        embedding: normalizeVector(result.embedding),
      }, descriptor, model, modelVersion);
      workingEntries.push(entry);
      embeddedThisRun += 1;
      unsaved += 1;
    } catch (error) {
      if (unsaved > 0) {
        checkpoint = sealEmbeddingArtifact({
          ...withoutDigest(checkpoint), entries: workingEntries, updatedAt: now(),
        });
        await onCheckpoint(checkpoint);
      }
      return {
        status: "partial",
        errorCode: safeErrorCode(error),
        checkpoint,
        providerCalls,
        embeddedThisRun,
        remainingPassages: canonicalSeed.passages.length - workingEntries.length,
      };
    }
    if (!entry) fail("Embedding provider returned no validated embedding entry.");
    if (unsaved >= checkpointEvery) {
      checkpoint = sealEmbeddingArtifact({
        ...withoutDigest(checkpoint), entries: workingEntries, updatedAt: now(),
      });
      await onCheckpoint(checkpoint);
      unsaved = 0;
    }
  }

  if (unsaved > 0) {
    checkpoint = sealEmbeddingArtifact({
      ...withoutDigest(checkpoint), entries: workingEntries, updatedAt: now(),
    });
    await onCheckpoint(checkpoint);
  }
  const remainingPassages = canonicalSeed.passages.length - workingEntries.length;
  return {
    status: remainingPassages === 0 ? "complete" : "partial",
    checkpoint,
    providerCalls,
    embeddedThisRun,
    remainingPassages,
  };
}
