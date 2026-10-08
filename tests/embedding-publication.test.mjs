import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildCollegeKnowledge } from "../scripts/lib/college-knowledge.mjs";
import { createEmbeddingArtifactMetadata, sealEmbeddingArtifact } from "../scripts/lib/college-embeddings.mjs";
import { embeddingPublicationSql } from "../scripts/publish-college-embeddings.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataset = JSON.parse(await readFile(join(root, "data/colleges.json"), "utf8"));
const marker = JSON.parse(await readFile(join(root, "data/college-knowledge-release.json"), "utf8"));
const seed = buildCollegeKnowledge(dataset, marker.releaseId);
const model = "synthetic-publication-fixture";
const version = "fixture-v1";
const artifact = sealEmbeddingArtifact({ ...createEmbeddingArtifactMetadata(seed, model, version), status: "complete",
  generatedAt: "2026-10-04T00:00:00.000Z", entries: seed.passages.map((row) => ({
    passageId: row.passage_id, unitId: row.unit_id, sourceId: row.source_id, contentSha256: row.content_sha256,
    model, modelVersion: version, dimensions: 2048, embedding: [1, ...Array(2047).fill(0)],
  })) });

test("publication refuses partial artifacts and ambiguous target/replacement options", () => {
  const partial = sealEmbeddingArtifact({...artifact, entries: artifact.entries.slice(0, 24)});
  assert.throws(() => embeddingPublicationSql(partial, seed, {database: "postgres"}), /full canonical/);
  assert.throws(() => embeddingPublicationSql(artifact, seed, {database: "postgres; drop table college_passages"}), /database name/);
  assert.throws(() => embeddingPublicationSql(artifact, seed, {database: "postgres", expectedModel: "old"}), /both expected model and version/);
});

test("publication CLI validates offline, refuses overwrite, and detects an edited SQL export", async () => {
  const directory = await mkdtemp(join(tmpdir(), "college-embedding-publication-"));
  try {
    const artifactPath = join(directory, "fixture.json");
    const sqlPath = join(directory, "fixture.sql");
    await writeFile(artifactPath, JSON.stringify(artifact));
    const command = (extra = []) => spawnSync(process.execPath, ["scripts/publish-college-embeddings.mjs",
      "--artifact", artifactPath, "--database", "postgres", ...extra], {cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024});
    const dry = command();
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout).databaseWrites, 0);
    assert.deepEqual(await readdir(directory), ["fixture.json"]);
    const exported = command(["--write-sql", sqlPath]);
    assert.equal(exported.status, 0, exported.stderr);
    assert.equal(JSON.parse(exported.stdout).artifactSha256, artifact.artifactSha256);
    assert.notEqual(command(["--write-sql", sqlPath]).status, 0);
    const verified = command(["--verify-sql", sqlPath]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).status, "verified");
    await writeFile(sqlPath, (await readFile(sqlPath, "utf8")).replace("'120s'", "'121s'"));
    const changed = command(["--verify-sql", sqlPath]);
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /does not match/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
