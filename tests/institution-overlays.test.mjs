import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  artifactBytesForHash,
  sha256Hex,
  validateInstitutionOverlays,
} from "../scripts/lib/institution-overlays.mjs";

test("institution overlays satisfy lineage and arithmetic invariants", async () => {
  const dataset = JSON.parse(
    await readFile(new URL("../data/institution-overlays.json", import.meta.url), "utf8"),
  );
  const summary = validateInstitutionOverlays(dataset);

  assert.equal(summary.sourceCount, dataset.sources.length);
  assert.equal(summary.collegeCount, dataset.colleges.length);
  assert.ok(summary.observationCount >= dataset.colleges.length * 5);
  assert.equal(summary.artifactCount, dataset.sources.length);
  for (const source of dataset.sources) {
    assert.equal(source.review.status, "approved");
    assert.equal(source.review.approvedSha256, source.artifactSha256);
    assert.ok(source.allowedArtifactHosts.length > 0);
  }
});

test("the generated release exactly reflects every reviewed overlay", async () => {
  const [overlays, generated] = await Promise.all([
    readFile(new URL("../data/institution-overlays.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/colleges.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const generatedSources = new Map(
    generated.release.sources.map((source) => [source.id, source]),
  );
  const generatedColleges = new Map(
    generated.colleges.map((college) => [college.unitId, college]),
  );

  for (const source of overlays.sources) {
    assert.deepEqual(generatedSources.get(source.id), source);
  }
  for (const overlay of overlays.colleges) {
    const college = generatedColleges.get(overlay.unitId);
    assert.ok(college, `generated college ${overlay.unitId} exists`);
    for (const [metric, expected] of Object.entries(overlay.observations)) {
      const actual = college.observations[metric];
      for (const [field, value] of Object.entries(expected)) {
        assert.deepEqual(
          actual[field],
          value,
          `UNITID ${overlay.unitId} ${metric}.${field} matches the reviewed overlay`,
        );
      }
      assert.equal(actual.sourceId, overlay.sourceId);
    }
  }
});

test("HTML artifact hashing ignores volatile asset versions and edge challenges", () => {
  const first = new TextEncoder().encode(
    '<link href="app.css?ver=123"><main>stable evidence</main><script>(function(){function c(){var b=a.contentDocument;token="one"}</script></body>',
  );
  const second = new TextEncoder().encode(
    '<link href="app.css?ver=456.7"><main>stable evidence</main><script>(function(){function c(){var b=a.contentDocument;token="two"}</script></body>',
  );
  const changed = new TextEncoder().encode(
    '<link href="app.css?ver=456.7"><main>changed evidence</main><script>(function(){function c(){var b=a.contentDocument;token="two"}</script></body>',
  );
  const contentAfterChallenge = new TextEncoder().encode(
    '<link href="app.css?ver=456.7"><main>stable evidence</main><script>(function(){function c(){var b=a.contentDocument;token="two"}</script><footer>new evidence</footer></body>',
  );

  const normalize = (bytes) =>
    artifactBytesForHash(
      bytes,
      "html-without-volatile-assets-and-edge-challenge",
    );
  assert.equal(sha256Hex(normalize(first)), sha256Hex(normalize(second)));
  assert.notEqual(sha256Hex(normalize(first)), sha256Hex(normalize(changed)));
  assert.notEqual(
    sha256Hex(normalize(first)),
    sha256Hex(normalize(contentAfterChallenge)),
  );
});
