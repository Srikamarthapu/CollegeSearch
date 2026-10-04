import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const root = process.cwd();
const projectRef = "abcdefghijabcdefghij";
let outputDirectory;

test("hosted SQL export is ordered, credential-free, hash-addressed, and bounded", async () => {
  outputDirectory = await mkdtemp(path.join(os.tmpdir(), "college-knowledge-sql-"));
  const output = execFileSync(process.execPath, [
    path.join(root, "scripts", "seed-college-knowledge.mjs"),
    "--hosted-project", projectRef,
    "--write-hosted-sql-dir", outputDirectory,
  ], { cwd: root, encoding: "utf8" });
  const result = JSON.parse(output);
  const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
  const sqlNames = (await readdir(outputDirectory)).filter((name) => name.endsWith(".sql")).sort();

  assert.equal(result.targetProject, projectRef);
  assert.equal(manifest.targetProject, projectRef);
  assert.equal(manifest.releaseId, result.releaseId);
  assert.deepEqual(manifest.files.map((file) => file.name), sqlNames);
  assert.ok(sqlNames[0].startsWith("000-release-metadata"));
  assert.ok(sqlNames.some((name) => name.startsWith("001-stable-identities")));
  assert.ok(sqlNames.some((name) => name.startsWith("010-catalog-snapshot")));
  assert.ok(sqlNames.some((name) => name.startsWith("020-sources")));
  assert.ok(sqlNames.some((name) => name.startsWith("030-bindings")));
  assert.ok(sqlNames.some((name) => name.startsWith("040-facts")));
  assert.ok(sqlNames.some((name) => name.startsWith("050-passages")));
  assert.ok(sqlNames.at(-1).startsWith("060-verify-and-publish"));
  assert.equal(manifest.institutions, 100);
  assert.equal(manifest.embeddedPassages, 0);

  for (const file of manifest.files) {
    const contents = await readFile(path.join(outputDirectory, file.name), "utf8");
    const sizeBytes = (await stat(path.join(outputDirectory, file.name))).size;
    assert.equal(sizeBytes, file.sizeBytes);
    assert.ok(sizeBytes <= 100_000, `${file.name} must remain below 100 KB`);
    assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256);
    assert.ok(contents.includes(`Target Supabase project ref: ${projectRef}`));
    assert.ok(contents.includes(`Release: ${manifest.releaseId}`));
    assert.doesNotMatch(contents, /^\s*(?:create|alter|drop|grant|revoke|truncate|delete)\s/mi);
    assert.doesNotMatch(contents, /sb_secret_|service_role_key/i);
  }
  const publish = await readFile(path.join(outputDirectory, sqlNames.at(-1)), "utf8");
  assert.match(publish, /publish_college_knowledge_release/);
});

after(async () => {
  if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
});
