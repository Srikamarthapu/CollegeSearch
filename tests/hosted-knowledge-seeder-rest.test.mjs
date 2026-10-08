import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRef = "abcdefghijabcdefghij";
const seederPath = path.join(root, "scripts/seed-college-knowledge.mjs");
const preloadPath = path.join(root, "tests/fixtures/mock-hosted-knowledge-rest.mjs");
const verificationTables = [
  "college_catalog_release_records",
  "college_sources",
  "college_source_bindings",
  "college_facts",
  "college_passages",
];

test("hosted REST seeding verifies the full catalog before publish and rejects mock conflicts", { timeout: 120_000 }, async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "college-knowledge-rest-test-"));
  try {
    async function run(scenario) {
      const reportPath = path.join(tempDirectory, `${scenario}.json`);
      const child = spawnSync(process.execPath, [
        "--import", preloadPath,
        seederPath,
        "--hosted-project", projectRef,
      ], {
        cwd: root,
        encoding: "utf8",
        timeout: 90_000,
        maxBuffer: 2_000_000,
        env: {
          PATH: process.env.PATH ?? "",
          SUPABASE_URL: `https://${projectRef}.supabase.co`,
          SUPABASE_SECRET_KEY: "sb_secret_hosted_seed_test_only",
          SEED_MOCK_SCENARIO: scenario,
          SEED_MOCK_REPORT_PATH: reportPath,
        },
      });
      assert.ifError(child.error);
      return {
        status: child.status,
        stdout: child.stdout,
        stderr: child.stderr,
        report: JSON.parse(await readFile(reportPath, "utf8")),
      };
    }

    const success = await run("success");
    assert.equal(success.status, 0, success.stderr);
    const seeded = JSON.parse(success.stdout.trim().split("\n").at(-1));
    const report = success.report;
    assert.equal(seeded.institutions, 3912);
    assert.equal(report.tableCounts.college_catalog, seeded.institutions);
    assert.equal(report.tableCounts.college_catalog_release_records, seeded.institutions);
    assert.equal(report.tableCounts.college_sources, seeded.sources);
    assert.equal(report.tableCounts.college_source_bindings, seeded.bindings);
    assert.equal(report.tableCounts.college_facts, seeded.facts);
    assert.equal(report.tableCounts.college_passages, seeded.passages);
    assert.equal(report.postRows.college_catalog, 3812, "only identities absent from the stable 100-row baseline should be inserted");
    assert.equal(report.baseline100Preserved, true);
    assert.equal(report.projectionValid, true);
    assert.equal(report.paginationValid, true);
    assert.equal(report.blockedFetchCalls, 0, "the preload must block any non-synthetic origin");
    assert.equal(report.releaseMetadataReadback, true);
    assert.equal(report.publishCalls, 1);
    assert.equal(report.publishAccepted, true);
    assert.deepEqual(
      Object.keys(report.publishGateChecks.verified).sort(),
      [...verificationTables].sort(),
    );
    assert.ok(Object.values(report.publishGateChecks.verified).every(Boolean));
    assert.equal(report.distinctBindingKeys, seeded.bindings);
    assert.ok(report.maximumBindingsPerSource > 1, "the same source must bind to multiple institution IDs");
    assert.ok(report.sourcesBoundToMultipleInstitutions > 0);
    for (const table of verificationTables) {
      const stream = report.readStreams[`${table}\u0000eq.${seeded.releaseId}`];
      assert.ok(stream?.complete, `${table} must be paged through its terminal short/empty page`);
      assert.equal(stream.total, report.tableCounts[table]);
      assert.equal(stream.order, verificationOrder(table));
      assert.equal(stream.offsets[0], 0);
      assert.ok(stream.offsets.every((offset, index, offsets) => index === 0 || offset > offsets[index - 1]));
    }

    const metadataConflict = await run("release-metadata-conflict");
    assert.notEqual(metadataConflict.status, 0);
    assert.match(metadataConflict.stderr, /release metadata is not an immutable match/i);
    assert.equal(metadataConflict.report.injectedMetadataConflict, true);
    assert.equal(metadataConflict.report.releaseMetadataReadback, true);
    assert.equal(metadataConflict.report.publishCalls, 0);
    assert.equal(metadataConflict.report.postRows.college_sources ?? 0, 0);

    const missingBinding = await run("missing-binding");
    assert.notEqual(missingBinding.status, 0);
    assert.match(missingBinding.stderr, /college_source_bindings staged row count or key set does not match/i);
    assert.equal(missingBinding.report.injectedBindingOmission, true);
    assert.equal(missingBinding.report.publishCalls, 0);
    assert.equal(missingBinding.report.publishAccepted, false);
    assert.equal(
      missingBinding.report.tableCounts.college_source_bindings,
      missingBinding.report.publishPayload?.p_expected_binding_count ?? seeded.bindings - 1,
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

function verificationOrder(table) {
  return {
    college_catalog_release_records: "release_id.asc,unit_id.asc",
    college_sources: "release_id.asc,source_id.asc",
    college_source_bindings: "release_id.asc,unit_id.asc,source_id.asc",
    college_facts: "fact_id.asc",
    college_passages: "passage_id.asc",
  }[table];
}
