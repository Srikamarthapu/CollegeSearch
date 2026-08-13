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
const ARTIFACT_KINDS = new Set(["html", "pdf", "xlsx"]);
const DERIVED_CONTEXT_FIELDS = [
  "reportingYear",
  "periodLabel",
  "cohort",
  "finality",
];

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

export function resolveInstitutionOverlayObservationSourceId(
  college,
  observation,
) {
  return observation.sourceId ?? college.sourceId;
}

function assertCollegeSourceDeclaration(college, sourcesById) {
  assert(
    isNonEmptyString(college.sourceId),
    `UNITID ${college.unitId} needs a default sourceId.`,
  );
  assert(
    sourcesById.has(college.sourceId),
    `UNITID ${college.unitId} references unknown source ${college.sourceId}.`,
  );

  if (college.sourceIds === undefined) {
    return {
      declaredSourceIds: new Set([college.sourceId]),
      requiresMetricSourceIds: false,
    };
  }

  assert(
    Array.isArray(college.sourceIds),
    `UNITID ${college.unitId} sourceIds must be an array.`,
  );
  assert(
    college.sourceIds.length >= 2,
    `UNITID ${college.unitId} sourceIds must declare at least two sources; omit sourceIds for a single-source overlay.`,
  );

  const declaredSourceIds = new Set();
  for (const sourceId of college.sourceIds) {
    assert(
      isNonEmptyString(sourceId),
      `UNITID ${college.unitId} sourceIds contains an invalid source id.`,
    );
    assert(
      !declaredSourceIds.has(sourceId),
      `UNITID ${college.unitId} sourceIds contains duplicate source ${sourceId}.`,
    );
    assert(
      sourcesById.has(sourceId),
      `UNITID ${college.unitId} sourceIds references unknown source ${sourceId}.`,
    );
    declaredSourceIds.add(sourceId);
  }
  assert(
    declaredSourceIds.has(college.sourceId),
    `UNITID ${college.unitId} sourceIds must include default sourceId ${college.sourceId}.`,
  );
  for (const sourceId of declaredSourceIds) {
    const source = sourcesById.get(sourceId);
    assert(
      isNonEmptyString(source.artifactUrl) && source.review?.status === "approved",
      `UNITID ${college.unitId} multi-source overlay requires a refresh-verifiable, approved artifact for source ${sourceId}.`,
    );
  }

  return { declaredSourceIds, requiresMetricSourceIds: true };
}

function assertObservationLineage({
  college,
  metric,
  observation,
  declaredSourceIds,
  requiresMetricSourceIds,
}) {
  if (requiresMetricSourceIds) {
    assert(
      isNonEmptyString(observation.sourceId),
      `UNITID ${college.unitId} ${metric} needs an explicit sourceId in a multi-source overlay.`,
    );
  }

  const sourceId = resolveInstitutionOverlayObservationSourceId(
    college,
    observation,
  );
  assert(
    declaredSourceIds.has(sourceId),
    requiresMetricSourceIds
      ? `UNITID ${college.unitId} ${metric} sourceId ${sourceId} is not declared in college sourceIds.`
      : `UNITID ${college.unitId} ${metric} sourceId must match college sourceId ${college.sourceId}.`,
  );
  return sourceId;
}

function assertSharedDerivedContext(college, relationship, observations) {
  const [referenceMetric, referenceObservation] = observations[0];
  for (const field of DERIVED_CONTEXT_FIELDS) {
    for (const [metric, observation] of observations.slice(1)) {
      assert(
        observation[field] === referenceObservation[field],
        `UNITID ${college.unitId} ${relationship} must share ${field}; ${metric} does not match ${referenceMetric}.`,
      );
    }
  }

  const referenceSourceId = resolveInstitutionOverlayObservationSourceId(
    college,
    referenceObservation,
  );
  for (const [metric, observation] of observations.slice(1)) {
    assert(
      resolveInstitutionOverlayObservationSourceId(college, observation) ===
        referenceSourceId,
      `UNITID ${college.unitId} ${relationship} must share sourceId; ${metric} does not match ${referenceMetric}.`,
    );
  }
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
  const sourceIdsInUse = new Set();
  let observationCount = 0;
  let multiSourceCollegeCount = 0;
  for (const college of dataset.colleges) {
    assert(Number.isInteger(college.unitId), "Every overlay college needs an integer unitId.");
    assert(!unitIds.has(college.unitId), `Duplicate overlay UNITID ${college.unitId}.`);
    unitIds.add(college.unitId);
    const { declaredSourceIds, requiresMetricSourceIds } =
      assertCollegeSourceDeclaration(college, sourcesById);
    if (requiresMetricSourceIds) multiSourceCollegeCount += 1;
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
      sourceIdsInUse.add(
        assertObservationLineage({
          college,
          metric,
          observation,
          declaredSourceIds,
          requiresMetricSourceIds,
        }),
      );
      observationCount += 1;
    }

    for (const sourceId of declaredSourceIds) {
      const usedByCollege = Object.values(college.observations).some(
        (observation) =>
          resolveInstitutionOverlayObservationSourceId(college, observation) ===
          sourceId,
      );
      assert(
        usedByCollege,
        `UNITID ${college.unitId} declares unused source ${sourceId}.`,
      );
    }

    const { applicants, admits, enrollees, admitRate, yieldRate } = college.observations;
    if (admitRate?.status === "derived") {
      assert(
        applicants && admits,
        `UNITID ${college.unitId} derived admitRate requires applicants and admits.`,
      );
    }
    if (yieldRate?.status === "derived") {
      assert(
        admits && enrollees,
        `UNITID ${college.unitId} derived yieldRate requires admits and enrollees.`,
      );
    }
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
      assertSharedDerivedContext(college, "admit-rate inputs", [
        ["applicants", applicants],
        ["admits", admits],
        ["admitRate", admitRate],
      ]);
      assert(
        almostEqual(admitRate.value, admits.value / applicants.value),
        `UNITID ${college.unitId} admitRate does not equal admits / applicants.`,
      );
      assert(admitRate.status === "derived", `UNITID ${college.unitId} admitRate must be derived.`);
    }
    if (admits && enrollees && yieldRate) {
      assertSharedDerivedContext(college, "yield-rate inputs", [
        ["admits", admits],
        ["enrollees", enrollees],
        ["yieldRate", yieldRate],
      ]);
      assert(
        almostEqual(yieldRate.value, enrollees.value / admits.value),
        `UNITID ${college.unitId} yieldRate does not equal enrollees / admits.`,
      );
      assert(yieldRate.status === "derived", `UNITID ${college.unitId} yieldRate must be derived.`);
    }
  }

  for (const sourceId of sourcesById.keys()) {
    assert(sourceIdsInUse.has(sourceId), `Overlay source ${sourceId} is not used by any college.`);
  }

  return {
    sourceCount: dataset.sources.length,
    collegeCount: dataset.colleges.length,
    observationCount,
    artifactCount: dataset.sources.filter((source) => source.artifactUrl).length,
    multiSourceCollegeCount,
  };
}

export function artifactBytesForHash(bytes, mode = "raw") {
  assert(HASH_MODES.has(mode), `Unsupported artifact hash mode ${mode}.`);
  if (mode === "raw") return bytes;

  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const normalized = html
    .replace(/\?ver=[0-9.]+/g, "?ver=VERSION")
    .replace(
      /(<!-- This site is optimized with the Yoast SEO plugin )v[0-9.]+( - https:\/\/yoast\.com\/product\/yoast-seo-wordpress\/ -->)/g,
      "$1vVERSION$2",
    )
    .replace(
      /<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>\s*(?=<\/body>)/,
      "",
    );
  return new TextEncoder().encode(normalized);
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
