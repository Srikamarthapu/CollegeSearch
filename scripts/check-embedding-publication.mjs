#!/usr/bin/env node
// Opt-in SQL integration rehearsal. All mutations are in a new disposable local clone.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { buildCollegeKnowledge } from "./lib/college-knowledge.mjs";
import { createEmbeddingArtifactMetadata, sealEmbeddingArtifact } from "./lib/college-embeddings.mjs";
import { embeddingPublicationSql } from "./publish-college-embeddings.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--docker-container" || !/^collegesearch-[a-z0-9-]+$/.test(args[1])) {
  throw new Error("Usage: node scripts/check-embedding-publication.mjs --docker-container collegesearch-... (requires collegesearch_m2_verify baseline)");
}
const container = args[1];
const database = "collegesearch_embeddings_verify";
const marker = JSON.parse(await readFile(new URL("../data/college-knowledge-release.json", import.meta.url), "utf8"));
const dataset = JSON.parse(await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"));
const seed = buildCollegeKnowledge(dataset, marker.releaseId);
const model = "synthetic-publication-fixture";
function artifact(version, value = 1) {
  return sealEmbeddingArtifact({ ...createEmbeddingArtifactMetadata(seed, model, version), status: "complete",
    generatedAt: "2026-10-04T00:00:00.000Z", entries: seed.passages.map((row) => ({
      passageId: row.passage_id, unitId: row.unit_id, sourceId: row.source_id, contentSha256: row.content_sha256,
      model, modelVersion: version, dimensions: 2048, embedding: [value, ...Array(2047).fill(0)],
    })) });
}
function docker(command, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...command], {input, encoding: "utf8", maxBuffer: 2 * 1024 * 1024});
  // psql exits early on a deliberate rejection while Node may still be writing the large input.
  if (result.error && !(result.error.code === "EPIPE" && result.stderr.includes("ERROR:"))) throw result.error;
  return result;
}
function sql(text, succeeds = true, expectedError) {
  const result = docker(["psql", "-X", "-U", "supabase_admin", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], text);
  if (succeeds && result.status !== 0) throw new Error(result.stderr.slice(-6000));
  if (!succeeds) {
    assert.notEqual(result.status, 0, "Expected SQL rejection");
    if (expectedError) assert.match(result.stderr, expectedError);
  }
  return result.stdout.trim();
}
let created = false;
try {
  const create = docker(["createdb", "-U", "supabase_admin", "--template=collegesearch_m2_verify", database]);
  if (create.status !== 0) throw new Error(`Cannot create a new disposable verifier (existing databases are never replaced): ${create.stderr}`);
  created = true;
  const beforeSaves = sql("select count(*) from public.saved_colleges;");
  assert.equal(sql("select count(embedding) from public.college_passages;"), "0");
  const first = artifact("fixture-v1");
  const publication = embeddingPublicationSql(first, seed, {database});
  const second = artifact("fixture-v2", 0.5);

  sql("set role anon;\n" + publication, false, /permission denied/);
  sql(embeddingPublicationSql(first, seed, {database: "wrong_database"}), false, /target database mismatch/);
  sql("update public.college_knowledge_releases set is_current=false;");
  sql(publication, false, /exact current published data release/);
  sql("update public.college_knowledge_releases set is_current=true;");

  const id = seed.passages[0].passage_id;
  // Source corruption retains the old hash on purpose; publication must compare actual content too.
  sql(`update public.college_passages set content = content || ' stale' where passage_id='${id}';`);
  sql(publication, false, /content or provenance mismatch/);
  sql(`update public.college_passages set content=left(content, length(content)-6) where passage_id='${id}';`);
  assert.equal(sql("select count(embedding) from public.college_passages;"), "0");

  sql(publication);
  assert.equal(sql("select count(embedding) from public.college_passages;"), String(seed.passages.length));
  sql(publication); // Retrying the identical immutable artifact is harmless.
  sql(embeddingPublicationSql(artifact("fixture-v1", 0.5), seed, {database, expectedModel: model, expectedVersion: "fixture-v1"}), false, /require a new model\/version label/);
  sql(embeddingPublicationSql(second, seed, {database}), false, /replacement was not authorized/);
  assert.equal(sql("select embedding_version from public.college_knowledge_releases where is_current;"), "fixture-v1");

  const replacement = embeddingPublicationSql(second, seed, {database, expectedModel: model, expectedVersion: "fixture-v1"});
  // Failure after all row updates but before commit must restore both vectors and release metadata.
  sql(replacement.replace(/commit;\n$/, "select 1/0;\ncommit;\n"), false, /division by zero/);
  assert.equal(sql("select embedding_version from public.college_knowledge_releases where is_current;"), "fixture-v1");
  assert.equal(sql("select count(*) from public.college_passages where embedding_version='fixture-v1';"), String(seed.passages.length));
  sql(replacement);
  assert.equal(sql("select count(*) from public.college_passages where embedding_version='fixture-v2' and embedding_content_sha256=content_sha256;"), String(seed.passages.length));
  assert.equal(sql("select count(*) from public.saved_colleges;"), beforeSaves);
  const query = `'[1,${Array(2047).fill(0).join(",")}]'::extensions.vector`;
  assert.equal(sql(`set role anon; select count(*) > 0 from public.hybrid_search_college_passages('engineering', ${query}, '${model}', 'fixture-v2', 10, null, '${marker.releaseId}');`).split("\n").at(-1), "t");
  process.stdout.write(`${JSON.stringify({status: "passed", canonicalPassages: seed.passages.length,
    checks: ["anonymous write denied", "wrong target denied", "unpublished release denied", "changed content denied",
      "complete publish", "identical retry", "changed vectors cannot reuse a version", "unapproved replacement denied", "late failure rolls back",
      "explicit replacement", "saved rows preserved", "public hybrid RPC"],
    savedRowsPreserved: Number(beforeSaves), providerCalls: 0, hostedWrites: 0, semanticQuality: "not evaluated; synthetic vectors only"}, null, 2)}\n`);
} finally {
  if (created) {
    const cleanup = docker(["dropdb", "-U", "supabase_admin", database]);
    if (cleanup.status !== 0) throw new Error(`Disposable verifier cleanup failed: ${cleanup.stderr}`);
  }
}
