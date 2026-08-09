import { createHash } from "node:crypto";

const ALLOWED_METRICS = new Set([
  "admitRate",
  "applicants",
  "admits",
  "enrollees",
  "yieldRate",
  "undergraduateEnrollment",
  "graduationRate",
  "tuitionInState",
  "tuitionOutOfState",
  "averageNetPrice",
  "medianEarnings",
]);

const ALLOWED_STATUSES = new Set([
  "reported",
  "derived",
  "suppressed",
  "unavailable",
  "stale",
]);

const RATE_METRICS = new Set(["admitRate", "yieldRate", "graduationRate"]);
const COUNT_METRICS = new Set([
  "applicants",
  "admits",
  "enrollees",
  "undergraduateEnrollment",
]);
const MONEY_METRICS = new Set([
  "tuitionInState",
  "tuitionOutOfState",
  "averageNetPrice",
  "medianEarnings",
]);
const HASH_MODES = new Set([
  "raw",
  "html-without-volatile-assets-and-edge-challenge",
]);
const ARTIFACT_KINDS = new Set(["html", "pdf"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertHttpsUrl(value, label) {
  assert(isNonEmptyString(value), `${label} is required.`);
  const url = new URL(value);
  assert(url.protocol === "https:", `${label} must use HTTPS.`);
}

function assertIsoDate(value, label) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value), `${label} must be an ISO date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert(
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value,
    `${label} must be a real calendar date.`,
  );
}

function assertObservation(metric, observation, unitId) {
  const label = `UNITID ${unitId} ${metric}`;
  assert(
    observation && typeof observation === "object" && !Array.isArray(observation),
    `${label} must be an object.`,
  );
  assert(Number.isFinite(observation.value), `${label} must have a finite value.`);
  assert(Number.isInteger(observation.reportingYear), `${label} needs an integer reportingYear.`);
  assert(
    observation.reportingYear >= 1990 && observation.reportingYear <= 2100,
    `${label} has an implausible reportingYear.`,
  );
  for (const field of [
    "unit",
    "periodLabel",
    "finality",
    "comparabilityKey",
    "sourceField",
    "cohort",
    "definition",
  ]) {
    assert(isNonEmptyString(observation[field]), `${label} needs ${field}.`);
  }
  assert(ALLOWED_STATUSES.has(observation.status), `${label} has an invalid status.`);

  if (RATE_METRICS.has(metric)) {
    assert(observation.unit === "ratio", `${label} must use ratio units.`);
    assert(
      observation.value >= 0 && observation.value <= 1,
      `${label} must be between zero and one.`,
    );
  }
  if (COUNT_METRICS.has(metric)) {
    assert(observation.unit === "count", `${label} must use count units.`);
    assert(
      Number.isInteger(observation.value) && observation.value >= 0,
      `${label} must be a non-negative integer.`,
    );
  }
  if (MONEY_METRICS.has(metric)) {
    assert(observation.unit === "usd", `${label} must use usd units.`);
    assert(observation.value >= 0, `${label} must be non-negative.`);
  }
}

function almostEqual(left, right) {
  return Math.abs(left - right) <= 1e-12;
}

export function validateInstitutionOverlays(dataset) {
  assert(dataset && typeof dataset === "object", "Overlay dataset must be an object.");
  assert(Array.isArray(dataset.sources), "Overlay dataset needs a sources array.");
  assert(Array.isArray(dataset.colleges), "Overlay dataset needs a colleges array.");

  const sourcesById = new Map();
  for (const source of dataset.sources) {
    assert(isNonEmptyString(source.id), "Every overlay source needs an id.");
    assert(!sourcesById.has(source.id), `Duplicate overlay source id ${source.id}.`);
    for (const field of [
      "publisher",
      "sourceName",
      "accessedOn",
      "finality",
      "publicationStatus",
      "revisionStatus",
      "cohort",
      "notes",
    ]) {
      assert(isNonEmptyString(source[field]), `Source ${source.id} needs ${field}.`);
    }
    assertIsoDate(source.accessedOn, `Source ${source.id} accessedOn`);
    assertHttpsUrl(source.sourcePage ?? source.sourceUrl, `Source ${source.id} publisher URL`);

    const hasArtifactUrl = isNonEmptyString(source.artifactUrl);
    const hasArtifactHash = isNonEmptyString(source.artifactSha256);
    assert(
      hasArtifactUrl === hasArtifactHash,
      `Source ${source.id} must provide artifactUrl and artifactSha256 together.`,
    );
    if (hasArtifactUrl) {
      assertHttpsUrl(source.artifactUrl, `Source ${source.id} artifactUrl`);
      assert(
        /^[a-f0-9]{64}$/.test(source.artifactSha256),
        `Source ${source.id} artifactSha256 must be lowercase SHA-256.`,
      );
      assert(
        HASH_MODES.has(source.artifactHashMode ?? "raw"),
        `Source ${source.id} has an unsupported artifactHashMode.`,
      );
      assert(
        ARTIFACT_KINDS.has(source.artifactKind),
        `Source ${source.id} needs a supported artifactKind.`,
      );
      assert(
        Array.isArray(source.allowedArtifactHosts) && source.allowedArtifactHosts.length > 0,
        `Source ${source.id} needs allowedArtifactHosts.`,
      );
      for (const host of source.allowedArtifactHosts) {
        assert(
          isNonEmptyString(host) && !host.includes("/") && host === host.toLowerCase(),
          `Source ${source.id} has an invalid allowed artifact host.`,
        );
      }
      assert(
        source.allowedArtifactHosts.includes(new URL(source.artifactUrl).hostname.toLowerCase()),
        `Source ${source.id} artifact host is not allowlisted.`,
      );
      if ((source.artifactHashMode ?? "raw") !== "raw") {
        assert(
          source.artifactKind === "html",
          `Source ${source.id} may normalize only an HTML artifact.`,
        );
        assert(
          Array.isArray(source.evidenceAnchors) && source.evidenceAnchors.length >= 2,
          `Source ${source.id} needs multiple evidenceAnchors for normalized HTML.`,
        );
        for (const anchor of source.evidenceAnchors) {
          assert(
            isNonEmptyString(anchor) && anchor.length <= 200,
            `Source ${source.id} has an invalid evidence anchor.`,
          );
        }
      }
      assert(
        source.review && typeof source.review === "object" && !Array.isArray(source.review),
        `Source ${source.id} needs a review record.`,
      );
      assert(source.review.status === "approved", `Source ${source.id} review is not approved.`);
      assertIsoDate(source.review.reviewedOn, `Source ${source.id} review reviewedOn`);
      assert(
        source.review.approvedSha256 === source.artifactSha256,
        `Source ${source.id} review is not bound to the artifact fingerprint.`,
      );
      assert(
        source.review.method === "manual",
        `Source ${source.id} review method must be manual.`,
      );
      assert(
        isNonEmptyString(source.review.notes),
        `Source ${source.id} review needs notes.`,
      );
    }
    sourcesById.set(source.id, source);
  }

  const unitIds = new Set();
  let observationCount = 0;
  for (const college of dataset.colleges) {
    assert(Number.isInteger(college.unitId), "Every overlay college needs an integer unitId.");
    assert(!unitIds.has(college.unitId), `Duplicate overlay UNITID ${college.unitId}.`);
    unitIds.add(college.unitId);
    assert(
      sourcesById.has(college.sourceId),
      `UNITID ${college.unitId} references unknown source ${college.sourceId}.`,
    );
    assert(
      college.observations && typeof college.observations === "object",
      `UNITID ${college.unitId} needs observations.`,
    );
    assert(
      Object.keys(college.observations).length > 0,
      `UNITID ${college.unitId} needs at least one observation.`,
    );

    for (const [metric, observation] of Object.entries(college.observations)) {
      assert(ALLOWED_METRICS.has(metric), `UNITID ${college.unitId} has unsupported metric ${metric}.`);
      assertObservation(metric, observation, college.unitId);
      observationCount += 1;
    }

    const { applicants, admits, enrollees, admitRate, yieldRate } = college.observations;
    if (applicants && admits) {
      assert(
        applicants.value >= admits.value,
        `UNITID ${college.unitId} must satisfy applicants >= admits.`,
      );
    }
    if (admits && enrollees) {
      assert(
        admits.value >= enrollees.value,
        `UNITID ${college.unitId} must satisfy admits >= enrollees.`,
      );
    }
    if (applicants && admits && enrollees) {
      assert(
        applicants.value >= admits.value && admits.value >= enrollees.value,
        `UNITID ${college.unitId} must satisfy applicants >= admits >= enrollees.`,
      );
    }
    if (applicants && admits && admitRate) {
      assert(
        almostEqual(admitRate.value, admits.value / applicants.value),
        `UNITID ${college.unitId} admitRate does not equal admits / applicants.`,
      );
      assert(admitRate.status === "derived", `UNITID ${college.unitId} admitRate must be derived.`);
    }
    if (admits && enrollees && yieldRate) {
      assert(
        almostEqual(yieldRate.value, enrollees.value / admits.value),
        `UNITID ${college.unitId} yieldRate does not equal enrollees / admits.`,
      );
      assert(yieldRate.status === "derived", `UNITID ${college.unitId} yieldRate must be derived.`);
    }
  }

  const sourceIdsInUse = new Set(dataset.colleges.map((college) => college.sourceId));
  for (const sourceId of sourcesById.keys()) {
    assert(sourceIdsInUse.has(sourceId), `Overlay source ${sourceId} is not used by any college.`);
  }

  return {
    sourceCount: dataset.sources.length,
    collegeCount: dataset.colleges.length,
    observationCount,
    artifactCount: dataset.sources.filter((source) => source.artifactUrl).length,
  };
}

export function artifactBytesForHash(bytes, mode = "raw") {
  assert(HASH_MODES.has(mode), `Unsupported artifact hash mode ${mode}.`);
  if (mode === "raw") return bytes;

  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const normalized = html
    .replace(/\?ver=[0-9.]+/g, "?ver=VERSION")
    .replace(
      /<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>\s*(?=<\/body>)/,
      "",
    );
  return new TextEncoder().encode(normalized);
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
