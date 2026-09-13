export const VERIFICATION_MAX_AGE_HOURS = 192;
export const EXPECTED_VERIFICATION_ARTIFACTS = 26;

/**
 * Artifact availability/fingerprint checks only, not reporting-year freshness.
 * @param {{ checkedAt?: unknown, passed?: unknown, total?: unknown }} record
 */
export function verificationRecency(record, now = Date.now(), maxAgeHours = VERIFICATION_MAX_AGE_HOURS) {
  const checkedAt = typeof record.checkedAt === "string" ? record.checkedAt : null;
  const ageHours = checkedAt ? (now - Date.parse(checkedAt)) / 3_600_000 : NaN;
  const { passed, total } = record;
  if (!checkedAt || !Number.isFinite(now) || !Number.isFinite(ageHours) || ageHours < -1 ||
      !Number.isFinite(maxAgeHours) || maxAgeHours < 0 ||
      typeof passed !== "number" || typeof total !== "number" ||
      !Number.isInteger(passed) || !Number.isInteger(total) ||
      passed < 0 || total !== EXPECTED_VERIFICATION_ARTIFACTS || passed > total) {
    return { state: "unknown", checkedAt };
  }
  return {
    state: passed !== total ? "needs_review" : ageHours > maxAgeHours ? "stale" : "within_window",
    checkedAt, ageHours: +ageHours.toFixed(2), passed, total, maxAgeHours,
  };
}
