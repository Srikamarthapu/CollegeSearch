#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { buildCollegeKnowledge } from "./lib/college-knowledge.mjs";
import {
  createCompletedEmbeddingArtifact,
  assertExplicitEmbeddingModelVersion,
  runEmbeddingIndex,
  stableJson,
  validateEmbeddingArtifact,
  validateEmbeddingCheckpoint,
} from "./lib/college-embeddings.mjs";
import {
  createNvidiaProvider,
  nvidiaConfigFromEnv,
  nvidiaEmbeddingDimensions,
  NvidiaProviderError,
} from "../app/lib/adviser/nvidia.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = resolve(root, "data/colleges.json");
const markerPath = resolve(root, "data/college-knowledge-release.json");
const seedPath = resolve(root, "work/college-knowledge-seed.json");
const defaultMaxCalls = 32;
const maxCallsPerRun = 64;
const maxArtifactBytes = 128 * 1024 * 1024;
const maxPassageChars = 2_000;

function fail(message) {
  throw new Error(message);
}

function parseArgs(args) {
  const options = { evaluate: false, help: false, maxCalls: defaultMaxCalls };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--evaluate") options.evaluate = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--max-calls") {
      const raw = args[index + 1];
      if (!raw) fail("--max-calls requires an integer from 1 through 64.");
      options.maxCalls = Number(raw);
      index += 1;
    } else if (arg.startsWith("--max-calls=")) options.maxCalls = Number(arg.slice("--max-calls=".length));
    else fail(`Unknown option: ${arg}`);
  }
  if (!Number.isSafeInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > maxCallsPerRun) {
    fail("--max-calls must be an integer from 1 through 64.");
  }
  return options;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readBoundedJson(path, label) {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    fail(`${label} file could not be inspected.`);
  }
  if (info.size > maxArtifactBytes) fail(`${label} exceeds the 128 MiB safety limit.`);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail(`${label} is unreadable or contains invalid JSON.`);
  }
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const bytes = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(bytes) > maxArtifactBytes) fail("Embedding artifact exceeds the 128 MiB safety limit.");
  try {
    await writeFile(tempPath, bytes, { flag: "wx", mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function loadCanonicalSeed() {
  const datasetBytes = await readFile(datasetPath);
  const datasetSha256 = sha256(datasetBytes);
  const releaseId = `sha256:${datasetSha256}`;
  const marker = JSON.parse(await readFile(markerPath, "utf8"));
  if (marker.releaseId !== releaseId) fail("The reviewed college knowledge release marker does not match the current source bytes.");
  const dataset = JSON.parse(datasetBytes.toString("utf8"));
  const canonical = buildCollegeKnowledge(dataset, releaseId);
  const seed = await readBoundedJson(seedPath, "Canonical knowledge seed");
  if (!seed || seed.release?.release_id !== releaseId || seed.release?.dataset_sha256 !== datasetSha256 ||
      seed.release?.embedding_dimensions !== nvidiaEmbeddingDimensions ||
      canonical.passages.length === 0 || seed.passages?.length !== canonical.passages.length ||
      stableJson(seed.passages) !== stableJson(canonical.passages)) {
    fail("The seed does not exactly match the current canonical college-knowledge release; rebuild it before indexing.");
  }
  if (canonical.passages.some((passage) => passage.content.length > maxPassageChars ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(passage.content) ||
      !passage.source_url.startsWith("https://"))) {
    fail("A canonical passage exceeds the provider input limit or lacks an HTTPS source; no calls were made.");
  }
  return canonical;
}

function indexPaths(seed, model, version) {
  const release = seed.release.release_id.slice("sha256:".length);
  const modelVersionDigest = sha256(`${model}\n${version}`);
  const stem = `nvidia-embedding-index-${release}-${modelVersionDigest}`;
  return {
    checkpointPath: resolve(root, "work", `${stem}.checkpoint.json`),
    artifactPath: resolve(root, "work", `${stem}.json`),
    lockPath: resolve(root, "work", `${stem}.lock`),
  };
}

async function acquireLock(lockPath) {
  await mkdir(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
      await handle.close();
      return async () => unlink(lockPath).catch(() => undefined);
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
      let owner;
      try {
        owner = JSON.parse(await readFile(lockPath, "utf8"));
      } catch {
        fail("An embedding-index lock exists but is unreadable; inspect it before removing it.");
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) fail("An embedding-index lock has invalid ownership; inspect it before removing it.");
      try {
        process.kill(owner.pid, 0);
        fail("Another process is indexing this model and release. Wait for it to finish.");
      } catch (probeError) {
        if (probeError instanceof Error && probeError.message.startsWith("Another process")) throw probeError;
        if (!probeError || typeof probeError !== "object" || probeError.code !== "ESRCH") {
          fail("The embedding-index lock owner could not be checked; inspect it before continuing.");
        }
      }
      await unlink(lockPath).catch((unlinkError) => {
        if (!unlinkError || typeof unlinkError !== "object" || unlinkError.code !== "ENOENT") throw unlinkError;
      });
    }
  }
  fail("Could not acquire the embedding-index lock.");
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node scripts/index-college-knowledge.mjs [--max-calls 1..64] [--evaluate]\n\nDry-run is the default and sends no requests. Full indexing requires --evaluate, NVIDIA_MODE=evaluation, and a configured server key. Each run makes at most 64 sequential embedding requests (32 by default); the checksummed checkpoint resumes across runs. A complete canonical-corpus artifact is written locally for separate SQL export. This script does not call Supabase or publish a release.\n");
    return;
  }

  const canonical = await loadCanonicalSeed();
  if (options.evaluate) {
    try { process.loadEnvFile(resolve(root, ".env.local")); } catch { /* Missing local env leaves configuration absent. */ }
  }
  const config = nvidiaConfigFromEnv();
  const paths = indexPaths(canonical, config.embeddingModel, config.embeddingModelVersion);
  const completedFile = await readBoundedJson(paths.artifactPath, "Completed embedding artifact");
  if (completedFile) {
    const artifact = validateEmbeddingArtifact(completedFile, canonical);
    print({ status: "already-complete", releaseId: artifact.releaseId, model: artifact.model,
      modelVersion: artifact.modelVersion, passages: artifact.completedPassageCount,
      providerCalls: 0, databaseWrites: 0, artifactPath: paths.artifactPath });
    return;
  }

  const savedCheckpointFile = await readBoundedJson(paths.checkpointPath, "Embedding checkpoint");
  const checkpoint = savedCheckpointFile
    ? validateEmbeddingCheckpoint(savedCheckpointFile, canonical, config.embeddingModel, config.embeddingModelVersion)
    : null;
  const completed = checkpoint?.completedPassageCount ?? 0;
  const remaining = canonical.passages.length - completed;
  const plannedCalls = Math.min(options.maxCalls, remaining);

  if (!options.evaluate) {
    print({ status: "dry-run", releaseId: canonical.release.release_id, model: config.embeddingModel,
      modelVersion: config.embeddingModelVersion, expectedPassages: canonical.passages.length,
      checkpointPassages: completed, remainingPassages: remaining, plannedProviderCalls: plannedCalls,
      providerCalls: 0, databaseWrites: 0, checkpointPath: paths.checkpointPath,
      artifactPath: paths.artifactPath, note: "No provider calls or database writes were made." });
    return;
  }
  if (config.mode !== "evaluation") fail("Set NVIDIA_MODE=evaluation explicitly; the indexer never runs in public production mode.");
  if (remaining > 0) assertExplicitEmbeddingModelVersion(process.env.NVIDIA_EMBEDDING_MODEL_VERSION);
  if (remaining > 0 && !config.apiKey?.trim()) {
    print({ status: "pending-key", releaseId: canonical.release.release_id, model: config.embeddingModel,
      modelVersion: config.embeddingModelVersion, expectedPassages: canonical.passages.length,
      checkpointPassages: completed, remainingPassages: remaining, plannedProviderCalls: plannedCalls,
      providerCalls: 0, databaseWrites: 0, checkpointPath: paths.checkpointPath });
    return;
  }

  const releaseLock = await acquireLock(paths.lockPath);
  try {
    const latestArtifactFile = await readBoundedJson(paths.artifactPath, "Completed embedding artifact");
    if (latestArtifactFile) {
      const artifact = validateEmbeddingArtifact(latestArtifactFile, canonical);
      print({ status: "already-complete", releaseId: artifact.releaseId, model: artifact.model,
        modelVersion: artifact.modelVersion, passages: artifact.completedPassageCount,
        providerCalls: 0, databaseWrites: 0, artifactPath: paths.artifactPath });
      return;
    }
    const latestCheckpointFile = await readBoundedJson(paths.checkpointPath, "Embedding checkpoint");
    const latestCheckpoint = latestCheckpointFile
      ? validateEmbeddingCheckpoint(latestCheckpointFile, canonical, config.embeddingModel, config.embeddingModelVersion)
      : null;
    const provider = createNvidiaProvider(config);
    const outcome = await runEmbeddingIndex({
      canonicalSeed: canonical,
      model: config.embeddingModel,
      modelVersion: config.embeddingModelVersion,
      provider,
      maxCalls: options.maxCalls,
      checkpoint: latestCheckpoint,
      checkpointEvery: 32,
      onCheckpoint: (value) => writeAtomic(paths.checkpointPath, value),
    });
    if (outcome.status === "complete") {
      const artifact = createCompletedEmbeddingArtifact(outcome.checkpoint, canonical);
      const validation = validateEmbeddingArtifact(artifact, canonical);
      await writeAtomic(paths.artifactPath, validation);
      print({ status: "completed", releaseId: validation.releaseId, model: validation.model,
        modelVersion: validation.modelVersion, passages: validation.completedPassageCount,
        providerCalls: outcome.providerCalls, embeddedThisRun: outcome.embeddedThisRun,
        artifactSha256: validation.artifactSha256, provider: "NVIDIA hosted", databaseWrites: 0,
        checkpointPath: paths.checkpointPath, artifactPath: paths.artifactPath });
      return;
    }
    print({ status: "partial", releaseId: canonical.release.release_id, model: config.embeddingModel,
      modelVersion: config.embeddingModelVersion, checkpointPassages: outcome.checkpoint.completedPassageCount,
      remainingPassages: outcome.remainingPassages, providerCalls: outcome.providerCalls,
      embeddedThisRun: outcome.embeddedThisRun, errorCode: outcome.errorCode ?? null,
      databaseWrites: 0, checkpointPath: paths.checkpointPath,
      note: "Resume with the same source release, model, and version; the per-run request limit still applies." });
    if (outcome.errorCode) process.exitCode = 1;
  } finally {
    await releaseLock();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((cause) => {
    process.stderr.write(`${cause instanceof NvidiaProviderError ? cause.message : cause instanceof Error ? cause.message : "College passage indexing failed."}\n`);
    process.exitCode = 1;
  });
}
