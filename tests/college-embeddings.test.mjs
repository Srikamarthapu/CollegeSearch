import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  collegeEmbeddingDimensions,
  createCompletedEmbeddingArtifact,
  createEmbeddingCheckpoint,
  runEmbeddingIndex,
  sealEmbeddingArtifact,
  validateEmbeddingArtifact,
  validateEmbeddingCheckpoint,
} from "../scripts/lib/college-embeddings.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function seedWithPassages(count = 5) {
  const datasetSha256 = "a".repeat(64);
  const releaseId = `sha256:${datasetSha256}`;
  return {
    release: { release_id: releaseId, dataset_sha256: datasetSha256, embedding_dimensions: collegeEmbeddingDimensions },
    passages: Array.from({ length: count }, (_, index) => {
      const content = `Public evidence passage ${index + 1}.`;
      return {
        passage_id: sha256(`passage-${index}`),
        release_id: releaseId,
        unit_id: 100_000 + index,
        source_id: "official-source",
        source_url: "https://example.edu/official",
        content,
        content_sha256: sha256(content),
      };
    }),
  };
}

function vector(value = 0.125) {
  return Array(collegeEmbeddingDimensions).fill(Math.fround(value));
}

function providerFor(model, modelVersion, calls = []) {
  return {
    async embed(text, inputType) {
      calls.push({ text, inputType });
      return { model, modelVersion, embedding: vector(0.125 + calls.length / 1000) };
    },
  };
}

function fixedTime() {
  let counter = 0;
  return () => `2026-10-04T00:00:${String(counter++).padStart(2, "0")}.000Z`;
}

test("full artifact validates against every canonical passage and stores float32 vectors", async () => {
  const seed = seedWithPassages(3);
  const calls = [];
  const outcome = await runEmbeddingIndex({
    canonicalSeed: seed,
    model: "nvidia/nemotron-3-embed-1b",
    modelVersion: "evaluation-alias-v1",
    provider: providerFor("nvidia/nemotron-3-embed-1b", "evaluation-alias-v1", calls),
    maxCalls: 3,
    checkpointEvery: 2,
    now: fixedTime(),
  });

  assert.equal(outcome.status, "complete");
  assert.equal(outcome.providerCalls, 3);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.inputType === "passage"));
  const artifact = createCompletedEmbeddingArtifact(outcome.checkpoint, seed, "2026-10-04T00:01:00.000Z");
  const validated = validateEmbeddingArtifact(artifact, seed);
  assert.equal(validated.status, "complete");
  assert.equal(validated.expectedPassageCount, 3);
  assert.equal(validated.completedPassageCount, 3);
  assert.equal(validated.entries.length, 3);
  assert.equal(validated.entries[0].embedding.length, collegeEmbeddingDimensions);
  assert.ok(validated.entries[0].embedding.every((value) => value === Math.fround(value)));
  assert.match(validated.artifactSha256, /^[a-f0-9]{64}$/);
});

test("per-run call budget is exact and restart resumes without re-embedding completed passages", async () => {
  const seed = seedWithPassages(5);
  const model = "nvidia/nemotron-3-embed-1b";
  const version = "evaluation-alias-v1";
  const calls = [];
  let checkpoint = null;
  const perRunCalls = [];

  for (const budget of [2, 2, 2]) {
    const before = calls.length;
    const outcome = await runEmbeddingIndex({
      canonicalSeed: seed,
      model,
      modelVersion: version,
      provider: providerFor(model, version, calls),
      maxCalls: budget,
      checkpoint,
      checkpointEvery: 2,
      onCheckpoint: async (value) => { checkpoint = value; },
      now: fixedTime(),
    });
    const actualThisRun = calls.length - before;
    assert.equal(outcome.providerCalls, actualThisRun);
    assert.ok(actualThisRun <= budget);
    perRunCalls.push(actualThisRun);
    checkpoint = validateEmbeddingCheckpoint(outcome.checkpoint, seed, model, version);
  }

  assert.deepEqual(perRunCalls, [2, 2, 1]);
  assert.equal(calls.length, 5);
  assert.equal(new Set(calls.map(({ text }) => text)).size, 5);
  assert.equal(checkpoint.completedPassageCount, 5);
  assert.equal(createCompletedEmbeddingArtifact(checkpoint, seed).status, "complete");
});

test("placeholder model version is rejected before the injected provider can be called", async () => {
  const seed = seedWithPassages(1);
  let calls = 0;
  await assert.rejects(runEmbeddingIndex({
    canonicalSeed: seed,
    model: "nvidia/nemotron-3-embed-1b",
    modelVersion: "unversioned-provider-alias",
    provider: { async embed() { calls += 1; return { model: "nvidia/nemotron-3-embed-1b", modelVersion: "unversioned-provider-alias", embedding: vector() }; } },
    maxCalls: 1,
  }), /explicit operator-reviewed snapshot label/);
  assert.equal(calls, 0);
});

test("provider failure seals successful work and can resume without repeating it", async () => {
  const seed = seedWithPassages(4);
  const model = "nvidia/nemotron-3-embed-1b";
  const version = "evaluation-alias-v1";
  const firstRunInputs = [];
  let persisted = null;
  const failureProvider = {
    async embed(text, inputType) {
      firstRunInputs.push(text);
      assert.equal(inputType, "passage");
      if (firstRunInputs.length === 2) throw Object.assign(new Error("sensitive provider detail"), { code: "http_error" });
      return { model, modelVersion: version, embedding: vector() };
    },
  };
  const failed = await runEmbeddingIndex({
    canonicalSeed: seed, model, modelVersion: version, provider: failureProvider,
    maxCalls: 4, onCheckpoint: async (value) => { persisted = value; }, now: fixedTime(),
  });

  assert.equal(failed.status, "partial");
  assert.equal(failed.errorCode, "http_error");
  assert.equal(failed.providerCalls, 2);
  assert.equal(failed.embeddedThisRun, 1);
  assert.equal(persisted.completedPassageCount, 1);
  assert.equal(JSON.stringify(failed).includes("sensitive provider detail"), false);

  const resumeInputs = [];
  const resumed = await runEmbeddingIndex({
    canonicalSeed: seed, model, modelVersion: version,
    provider: providerFor(model, version, resumeInputs), maxCalls: 3,
    checkpoint: persisted, onCheckpoint: async (value) => { persisted = value; }, now: fixedTime(),
  });
  assert.equal(resumed.status, "complete");
  assert.equal(resumed.providerCalls, 3);
  assert.equal(resumeInputs.length, 3);
  assert.ok(resumeInputs.every(({ text }) => text !== firstRunInputs[0]));
});

test("checkpoint cannot resume across model, version, release, or content manifest changes", async () => {
  const seed = seedWithPassages(2);
  const model = "nvidia/nemotron-3-embed-1b";
  const version = "evaluation-alias-v1";
  const checkpoint = createEmbeddingCheckpoint(seed, model, version, "2026-10-04T00:00:00.000Z");

  assert.throws(() => validateEmbeddingCheckpoint(checkpoint, seed, model, "new-version"), /model or version/);
  const changedModelCheckpoint = sealEmbeddingArtifact({ ...checkpoint, model: "other/model" });
  assert.throws(() => validateEmbeddingCheckpoint(changedModelCheckpoint, seed, model, version), /model or version/);

  const changedContent = structuredClone(seed);
  changedContent.passages[0].content += " Updated.";
  changedContent.passages[0].content_sha256 = sha256(changedContent.passages[0].content);
  assert.throws(() => validateEmbeddingCheckpoint(checkpoint, changedContent, model, version), /release or canonical content manifest/);

  const tampered = { ...checkpoint, updatedAt: "2026-10-04T01:00:00.000Z" };
  assert.throws(() => validateEmbeddingCheckpoint(tampered, seed, model, version), /integrity hash/);
});

test("completed artifacts reject incomplete, duplicate, extra, or mismatched entries", async () => {
  const seed = seedWithPassages(3);
  const model = "nvidia/nemotron-3-embed-1b";
  const version = "evaluation-alias-v1";
  const run = await runEmbeddingIndex({
    canonicalSeed: seed, model, modelVersion: version,
    provider: providerFor(model, version), maxCalls: 3, now: fixedTime(),
  });
  const complete = createCompletedEmbeddingArtifact(run.checkpoint, seed);

  const incomplete = sealEmbeddingArtifact({ ...complete, entries: complete.entries.slice(0, -1) });
  assert.throws(() => validateEmbeddingArtifact(incomplete, seed), /full canonical passage release/);
  const duplicate = sealEmbeddingArtifact({ ...complete, entries: [...complete.entries, complete.entries[0]] });
  assert.throws(() => validateEmbeddingArtifact(duplicate, seed), /uniquely sorted|duplicate passage IDs/);
  const extra = sealEmbeddingArtifact({ ...complete, entries: complete.entries.map((entry, index) => index === 0
    ? { ...entry, passageId: "f".repeat(64) }
    : entry) });
  assert.throws(() => validateEmbeddingArtifact(extra, seed), /outside the canonical release/);

  const otherVersion = sealEmbeddingArtifact({ ...complete, modelVersion: "new-version" });
  assert.throws(() => validateEmbeddingArtifact(otherVersion, seed), /canonical passage, model, version/);
  const tampered = structuredClone(complete);
  tampered.entries[0].embedding[0] = Math.fround(0.875);
  assert.throws(() => validateEmbeddingArtifact(tampered, seed), /integrity hash/);
});

test("sealing and validation reject zero, non-finite, overflowed, underflowed, and wrong-size vectors", async () => {
  const seed = seedWithPassages(1);
  const model = "nvidia/nemotron-3-embed-1b";
  const version = "evaluation-alias-v1";
  const base = createEmbeddingCheckpoint(seed, model, version);
  const passage = seed.passages[0];
  const entry = (embedding) => ({
    passageId: passage.passage_id, unitId: passage.unit_id, sourceId: passage.source_id,
    contentSha256: passage.content_sha256, model, modelVersion: version,
    dimensions: collegeEmbeddingDimensions, embedding,
  });

  assert.throws(() => sealEmbeddingArtifact({ ...base, entries: [entry(Array(collegeEmbeddingDimensions).fill(0))] }), /nonzero/);
  assert.throws(() => sealEmbeddingArtifact({ ...base, entries: [entry([1, 2])] }), /exactly 2048/);
  const nonFinite = vector();
  nonFinite[4] = Number.POSITIVE_INFINITY;
  assert.throws(() => sealEmbeddingArtifact({ ...base, entries: [entry(nonFinite)] }), /finite/);
  const overflow = vector();
  overflow[4] = 1e100;
  assert.throws(() => sealEmbeddingArtifact({ ...base, entries: [entry(overflow)] }), /float32 range/);
  const underflow = Array(collegeEmbeddingDimensions).fill(1e-100);
  assert.throws(() => sealEmbeddingArtifact({ ...base, entries: [entry(underflow)] }), /nonzero/);
});
