#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, mkdir, rename, stat, writeFile, chmod } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildCollegeKnowledge } from "./lib/college-knowledge.mjs";
import {
  createNvidiaProvider,
  nvidiaConfigFromEnv,
  nvidiaEmbeddingDimensions,
  NvidiaProviderError,
} from "../app/lib/adviser/nvidia.ts";

const seedPath = resolve("work/college-knowledge-seed.json");
const datasetPath = resolve("data/colleges.json");
const maxEvaluationPassages = 24;
const maxTextChars = 2_000;

function fail(message) {
  throw new Error(message);
}

function parseArgs(args) {
  const result = { evaluate: false, help: false, limit: maxEvaluationPassages };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--evaluate") result.evaluate = true;
    else if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--limit") {
      const value = args[index + 1];
      if (!value) fail("--limit requires an integer from 1 through 24.");
      result.limit = Number(value);
      index += 1;
    } else if (arg.startsWith("--limit=")) result.limit = Number(arg.slice("--limit=".length));
    else fail(`Unknown option: ${arg}`);
  }
  if (!Number.isSafeInteger(result.limit) || result.limit < 1 || result.limit > maxEvaluationPassages) {
    fail("--limit must be an integer from 1 through 24; full-corpus embedding is not enabled by this script.");
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function selectDiverse(rows, limit) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.source_field) ?? [];
    group.push(row);
    groups.set(row.source_field, group);
  }
  for (const group of groups.values()) group.sort((a, b) => a.unit_id - b.unit_id || a.passage_id.localeCompare(b.passage_id));
  const fields = [...groups.keys()].sort();
  const result = [];
  for (let round = 0; result.length < limit; round += 1) {
    let added = false;
    for (const field of fields) {
      const row = groups.get(field)[round];
      if (row) {
        result.push(row);
        added = true;
        if (result.length === limit) break;
      }
    }
    if (!added) break;
  }
  return result;
}

function validateCanonicalSeed(seed, dataset) {
  if (!seed?.release?.release_id || !Array.isArray(seed.passages) || seed.release.embedding_dimensions !== nvidiaEmbeddingDimensions) {
    fail("The local college knowledge seed is missing its release or expected 2048-dimensional embedding metadata.");
  }
  const canonical = buildCollegeKnowledge(dataset, seed.release.release_id);
  if (canonical.passages.length !== seed.passages.length) fail("The local passage seed does not match the current canonical source release.");
  const canonicalById = new Map(canonical.passages.map((row) => [row.passage_id, row]));
  const seedIds = new Set(seed.passages.map((row) => row.passage_id));
  if (seedIds.size !== seed.passages.length || seedIds.size !== canonicalById.size) {
    fail("The local passage seed has missing or duplicate canonical passage IDs.");
  }
  for (const row of seed.passages) {
    const expected = canonicalById.get(row.passage_id);
    if (!expected || row.release_id !== seed.release.release_id || row.content !== expected.content ||
        row.content_sha256 !== expected.content_sha256 || row.unit_id !== expected.unit_id ||
        row.source_id !== expected.source_id || row.source_url !== expected.source_url ||
        row.source_field !== expected.source_field || !row.source_url.startsWith("https://") ||
        typeof row.content !== "string" || row.content.length === 0 || row.content.length > maxTextChars) {
      fail("A passage failed the canonical public-source check; no embedding requests were sent.");
    }
  }
  return canonical;
}

function artifactPathFor(releaseId, model, version) {
  const key = sha256(`${model}\n${version}`).slice(0, 12);
  const release = releaseId.slice("sha256:".length, "sha256:".length + 12);
  return resolve(`work/nvidia-embedding-evaluation-${release}-${key}.json`);
}

async function readArtifact(path, releaseId, model, version) {
  let artifact;
  try {
    const fileInfo = await stat(path);
    if (fileInfo.size > 4 * 1024 * 1024) fail("The saved embedding evaluation file exceeds its size limit; no requests were sent.");
    artifact = JSON.parse(await readFile(path, "utf8"));
  } catch (cause) {
    if (cause && typeof cause === "object" && cause.code === "ENOENT") return null;
    if (cause instanceof Error && cause.message.includes("size limit")) throw cause;
    fail("The saved embedding evaluation file is unreadable; no requests were sent.");
  }
  if (artifact.schemaVersion !== 1 || artifact.releaseId !== releaseId || artifact.model !== model ||
      artifact.modelVersion !== version || artifact.dimensions !== nvidiaEmbeddingDimensions || !Array.isArray(artifact.passages)) {
    fail("The saved embedding file does not match this release, model, version, or vector dimension; no requests were sent.");
  }
  return artifact;
}

async function writeArtifact(path, artifact) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(artifact)}\n`, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, path);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/embed-college-knowledge.mjs [--limit 1..24] [--evaluate]\n\nDry-run is the default and sends no requests. Only --evaluate with NVIDIA_MODE=evaluation and a configured key embeds a diverse sample of public canonical passages. This script cannot embed the full 1,252-passage corpus or upload to Supabase.\n");
    return;
  }

  const seed = JSON.parse(await readFile(seedPath, "utf8"));
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  const canonical = validateCanonicalSeed(seed, dataset);
  const selected = selectDiverse(canonical.passages, options.limit);
  if (selected.length !== options.limit) fail("Not enough canonical passages were available for the bounded sample.");
  if (!options.evaluate) {
    process.stdout.write(`${JSON.stringify({
      status: "dry-run",
      releaseId: seed.release.release_id,
      totalCanonicalPassages: canonical.passages.length,
      plannedSample: selected.length,
      maxSample: maxEvaluationPassages,
      sourceFieldsRepresented: new Set(selected.map((row) => row.source_field)).size,
      providerCalls: 0,
      supabaseWrites: 0,
      note: "Pass --evaluate explicitly to embed this public sample; no full-index mode exists here.",
    }, null, 2)}\n`);
    return;
  }

  try { process.loadEnvFile(resolve(".env.local")); } catch { /* Missing local env file leaves the key absent. */ }
  const config = nvidiaConfigFromEnv();
  if (config.mode !== "evaluation") fail("Pass NVIDIA_MODE=evaluation explicitly; this script never runs in public production mode.");
  if (!config.apiKey?.trim()) {
    process.stdout.write(`${JSON.stringify({ status: "pending-key", providerCalls: 0, plannedSample: selected.length, supabaseWrites: 0 }, null, 2)}\n`);
    return;
  }

  const path = artifactPathFor(seed.release.release_id, config.embeddingModel, config.embeddingModelVersion);
  const previous = await readArtifact(path, seed.release.release_id, config.embeddingModel, config.embeddingModelVersion);
  const artifact = previous ?? {
    schemaVersion: 1,
    releaseId: seed.release.release_id,
    model: config.embeddingModel,
    modelVersion: config.embeddingModelVersion,
    dimensions: nvidiaEmbeddingDimensions,
    createdAt: new Date().toISOString(),
    passages: [],
  };
  const byId = new Map(artifact.passages.map((row) => [row.passageId, row]));
  let reused = 0;
  let embedded = 0;
  let attempted = 0;
  let tokenCount = 0;
  let tokenCountKnown = true;
  const provider = createNvidiaProvider(config);

  for (const passage of selected) {
    const prior = byId.get(passage.passage_id);
    if (prior && prior.contentSha256 === passage.content_sha256 && prior.model === config.embeddingModel &&
        prior.modelVersion === config.embeddingModelVersion && Array.isArray(prior.embedding) &&
        prior.embedding.length === nvidiaEmbeddingDimensions && prior.embedding.every(Number.isFinite)) {
      reused += 1;
      continue;
    }
    try {
      attempted += 1;
      const result = await provider.embed(passage.content, "passage");
      byId.set(passage.passage_id, {
        passageId: passage.passage_id,
        unitId: passage.unit_id,
        sourceId: passage.source_id,
        contentSha256: passage.content_sha256,
        model: result.model,
        modelVersion: result.modelVersion,
        dimensions: result.embedding.length,
        embedding: result.embedding,
      });
      embedded += 1;
      if (result.usage.promptTokens === null) tokenCountKnown = false;
      else tokenCount += result.usage.promptTokens;
      artifact.passages = [...byId.values()];
      artifact.updatedAt = new Date().toISOString();
      await writeArtifact(path, artifact);
    } catch (cause) {
      artifact.passages = [...byId.values()];
      artifact.updatedAt = new Date().toISOString();
      await writeArtifact(path, artifact);
      process.stderr.write(`${JSON.stringify({ status: "partial", providerCalls: attempted, embeddedThisRun: embedded, completed: embedded + reused, plannedSample: selected.length, errorCode: cause instanceof NvidiaProviderError ? cause.code : "embedding_failed", reportPath: path })}\n`);
      process.exitCode = 1;
      return;
    }
  }

  process.stdout.write(`${JSON.stringify({
    status: "completed",
    releaseId: seed.release.release_id,
    model: config.embeddingModel,
    modelVersion: config.embeddingModelVersion,
    dimensions: nvidiaEmbeddingDimensions,
    plannedSample: selected.length,
    embeddedThisRun: embedded,
    resumedWithoutRequest: reused,
    providerCalls: attempted,
    promptTokens: tokenCountKnown ? tokenCount : null,
    supabaseWrites: 0,
    reportPath: path,
  }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((cause) => {
    process.stderr.write(`${cause instanceof NvidiaProviderError ? cause.message : cause instanceof Error ? cause.message : "Embedding evaluation failed."}\n`);
    process.exitCode = 1;
  });
}
