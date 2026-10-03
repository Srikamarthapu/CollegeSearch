import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOverlaySnapshotUnchanged,
  validateStagedRelease,
} from "../scripts/lib/data-refresh-validation.mjs";

function stagedFixture(overrides = {}) {
  return {
    finalizedAdmissions: { release: { reportingYear: 2025 } },
    latestAdmissions: { release: { reportingYear: 2026 } },
    generatedColleges: {
      release: { institutionCount: 2 },
      colleges: [{ unitId: 2 }, { unitId: 1 }],
    },
    expectedUnitIds: [1, 2],
    ...overrides,
  };
}

test("accepts a distinct UC archive and the exact reviewed cohort", () => {
  const release = validateStagedRelease(stagedFixture());
  assert.deepEqual(release.fileNames, [
    "uc-admissions-2025.json",
    "uc-admissions-2026.json",
    "uc-admissions-latest.json",
    "colleges.json",
  ]);
});

test("rejects a finalized/latest UC filename collision", () => {
  assert.throws(
    () =>
      validateStagedRelease(
        stagedFixture({ latestAdmissions: { release: { reportingYear: 2025 } } }),
      ),
    /both resolve to 2025/,
  );
});

test("rejects missing, duplicate, or unexpected cohort UNITIDs", () => {
  assert.throws(
    () =>
      validateStagedRelease(
        stagedFixture({ latestAdmissions: { release: {} } }),
      ),
    /has no reporting year/,
  );
  assert.throws(
    () =>
      validateStagedRelease(
        stagedFixture({
          generatedColleges: {
            release: { institutionCount: 2 },
            colleges: [{ unitId: 1 }, { unitId: 1 }],
          },
        }),
      ),
    /reviewed 2-college cohort/,
  );
  assert.throws(
    () =>
      validateStagedRelease(
        stagedFixture({
          generatedColleges: {
            release: { institutionCount: 2 },
            colleges: [{ unitId: 1 }, { unitId: 3 }],
          },
        }),
      ),
    /reviewed 2-college cohort/,
  );
});

test("detects a manifest edit between verification and publication", () => {
  const reviewed = new TextEncoder().encode('{"sources":["reviewed"]}');
  const unchanged = new Uint8Array(reviewed);
  const changed = new TextEncoder().encode('{"sources":["changed"]}');

  assert.doesNotThrow(() => assertOverlaySnapshotUnchanged(reviewed, unchanged));
  assert.throws(
    () => assertOverlaySnapshotUnchanged(reviewed, changed),
    /changed during refresh/,
  );
});
