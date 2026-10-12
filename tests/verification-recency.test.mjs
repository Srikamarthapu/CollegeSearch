import assert from "node:assert/strict";
import test from "node:test";
import { verificationRecency, VERIFICATION_MAX_AGE_HOURS } from "../app/lib/verification-recency.mjs";
import { publishedSnapshot } from "../scripts/ops/pilot-probe.mjs";

const checkedAt = "2026-09-13T18:44:00.000Z";
const checked = Date.parse(checkedAt);
const record = { checkedAt, passed: 26, total: 26 };
const hour = 3_600_000;

test("verification becomes overdue after the exact eight-day boundary, before rounding", () => {
  assert.equal(VERIFICATION_MAX_AGE_HOURS, 192);
  assert.equal(verificationRecency(record, checked).state, "within_window");
  assert.equal(verificationRecency(record, checked + 192 * hour).state, "within_window");
  const justOverdue = verificationRecency(record, checked + 192 * hour + 1);
  assert.equal(justOverdue.state, "stale");
  assert.equal(justOverdue.ageHours, 192);
});

test("future verification timestamps tolerate at most one hour of clock skew", () => {
  assert.equal(verificationRecency(record, checked - hour).state, "within_window");
  assert.equal(verificationRecency(record, checked - hour - 1).state, "unknown");
});

test("unverified coverage takes precedence over overdue age", () => {
  assert.equal(verificationRecency({ ...record, passed: 25 }, checked).state, "needs_review");
  assert.equal(verificationRecency({ ...record, passed: 25 }, checked + 9 * 24 * hour).state, "needs_review");
});

test("unusable timestamps and inconsistent artifact coverage fail closed", () => {
  for (const patch of [
    { checkedAt: null }, { checkedAt: "not-a-date" }, { checkedAt: "" },
    { passed: -1 }, { passed: 1.5 }, { passed: undefined }, { passed: "26" },
    { total: 25 }, { total: 26.5 }, { passed: 27 }, { passed: 0, total: 0 },
  ]) assert.equal(verificationRecency({ ...record, ...patch }, checked).state, "unknown", JSON.stringify(patch));
  assert.equal(verificationRecency(record, NaN).state, "unknown");
  assert.equal(verificationRecency(record, checked, -1).state, "unknown");
});

test("the HTML probe and page classifier share the same clock and coverage policy", () => {
  const html = `<h2>26<!-- --> of <!-- -->26<!-- --> registered artifacts passed</h2><p>Published verification snapshot: <time datetime="${checkedAt}">Date</time></p>`;
  for (const now of [checked, checked + 192 * hour, checked + 192 * hour + 1, checked - hour - 1]) {
    assert.deepEqual(publishedSnapshot(html, now), verificationRecency(record, now));
  }
});
