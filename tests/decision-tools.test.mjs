import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { historicalAdmitBand } from "../app/chances/context.ts";
import {
  hasActiveMatchSignal,
  matchBounds,
  rankMatches,
  scoreCollege,
} from "../app/match/scoring.ts";

const metric = (value, periodLabel = "2024 cohort") => ({
  value,
  periodLabel,
  publisher: "Test publisher",
});

function college(overrides = {}) {
  return {
    unitId: 1,
    slug: "example-college",
    name: "Example College",
    city: "Example",
    state: "CA",
    ownership: "Public",
    setting: "City",
    majors: [
      {
        name: "Engineering",
        share: 0.2,
        periodLabel: "2024-2025 programs and awards",
      },
    ],
    admitRate: metric(0.1),
    netPrice: metric(20_000),
    graduationRate: metric(0.8),
    medianEarnings: metric(70_000),
    enrollment: metric(18_000),
    ...overrides,
  };
}

const preferences = {
  major: "Engineering",
  region: "state:CA",
  ownership: "any",
  maxNetPrice: 25_000,
  size: "medium",
  weights: {
    major: 5,
    location: 3,
    price: 4,
    size: 2,
    graduation: 4,
    earnings: 3,
  },
};

test("preference scoring never uses overall admit rate", () => {
  const colleges = [college(), college({ unitId: 2, admitRate: metric(0.9) })];
  const bounds = matchBounds(colleges);
  const lowRate = scoreCollege(colleges[0], preferences, bounds);
  const highRate = scoreCollege(colleges[1], preferences, bounds);

  assert.equal(lowRate.score, highRate.score);
  assert.ok(lowRate.components.every((component) => component.key !== "admitRate"));
});

test("missing evidence is excluded instead of treated as zero", () => {
  const complete = college();
  const missingEarnings = college({ medianEarnings: metric(null) });
  const bounds = matchBounds([complete, missingEarnings]);
  const result = scoreCollege(missingEarnings, preferences, bounds);
  const earnings = result.components.find((component) => component.key === "earnings");

  assert.equal(earnings.score, null);
  assert.equal(earnings.missing, true);
  assert.equal(result.usedWeight, 18, "the three-point earnings weight is excluded");
  assert.equal(result.score, 96, "remaining evidence is normalized over its available weights");
});

test("ownership remains an explicit hard filter", () => {
  const publicCollege = college();
  const privateCollege = college({
    unitId: 2,
    slug: "private-college",
    name: "Private College",
    ownership: "Private nonprofit",
  });
  const results = rankMatches(
    [publicCollege, privateCollege],
    { ...preferences, ownership: "Public" },
    10,
  );

  assert.deepEqual(results.map((result) => result.college.unitId), [1]);
});

test("zero weights leave the match worksheet unranked", () => {
  const zeroWeights = Object.fromEntries(
    Object.keys(preferences.weights).map((criterion) => [criterion, 0]),
  );
  const zeroWeightPreferences = {
    ...preferences,
    weights: zeroWeights,
  };

  assert.equal(hasActiveMatchSignal(zeroWeights), false);
  assert.deepEqual(rankMatches([college()], zeroWeightPreferences, 10), []);
});

test("the sticky preference rail keeps every control reachable", async () => {
  const [componentSource, stylesheet] = await Promise.all([
    readFile(new URL("../app/match/MatchTool.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/match/match.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(componentSource, /className=\{styles\.controls\}[\s\S]*data-lenis-prevent/);
  assert.match(stylesheet, /\.controls\s*\{[\s\S]*max-height:\s*calc\(100dvh\s*-\s*104px\)/);
  assert.match(stylesheet, /\.controls\s*\{[\s\S]*overflow-y:\s*auto/);
});

test("historical admit bands are descriptive and deterministic", () => {
  assert.equal(historicalAdmitBand(null).label, "No usable overall rate");
  assert.equal(historicalAdmitBand(0.1).label, "Very low observed overall rate");
  assert.equal(historicalAdmitBand(0.2).label, "Low observed overall rate");
  assert.equal(historicalAdmitBand(0.4).label, "Moderate observed overall rate");
  assert.equal(historicalAdmitBand(0.7).label, "Broad observed overall rate");
});
