#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCollegeKnowledge } from "./lib/college-knowledge.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.join(root, "data", "colleges.json");
const markerPath = path.join(root, "data", "college-knowledge-release.json");
const seedPath = path.join(root, "work", "college-knowledge-seed.json");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const rawDataset = await readFile(datasetPath);
const datasetSha256 = createHash("sha256").update(rawDataset).digest("hex");
const releaseId = `sha256:${datasetSha256}`;
const dataset = JSON.parse(rawDataset.toString("utf8"));
const seed = buildCollegeKnowledge(dataset, releaseId);

if (checkOnly) {
  let marker;
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8"));
  } catch {
    throw new Error("Knowledge release marker is missing; run scripts/build-college-knowledge.mjs.");
  }
  if (marker.releaseId !== releaseId) {
    throw new Error(`Knowledge release marker mismatch: expected ${releaseId}, found ${marker.releaseId ?? "missing"}.`);
  }
} else {
  await mkdir(path.dirname(seedPath), { recursive: true });
  await writeFile(seedPath, `${JSON.stringify(seed, null, 2)}\n`);
  await writeFile(markerPath, `${JSON.stringify({ releaseId }, null, 2)}\n`);
}

console.log(JSON.stringify({
  releaseId,
  institutions: seed.catalog.length,
  sources: seed.sources.length,
  bindings: seed.bindings.length,
  facts: seed.facts.length,
  passages: seed.passages.length,
  embeddedPassages: seed.passages.filter((passage) => passage.embedding !== null).length,
  seedFile: checkOnly ? undefined : path.relative(root, seedPath),
  checked: checkOnly,
}));
