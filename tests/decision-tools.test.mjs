import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { historicalAdmitBand } from "../app/chances/context.ts";
import {
  balancedObservedShortlist,
  hasActiveMatchSignal,
  matchBounds,
  rankMatches,
  scoreCollege,
  weightsForActiveCriteria,
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
  majorMode: "prefer",
  region: "state:CA",
  ownership: "any",
  maxNetPrice: 25_000,
  size: "medium",
  setting: "City",
  weights: {
    major: 5,
    location: 3,
    price: 4,
    size: 2,
    setting: 2,
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
  assert.equal(result.usedWeight, 20, "the three-point earnings weight is excluded");
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

test("a required broad field removes colleges without that evidence", () => {
  const withEngineering = college();
  const withoutEngineering = college({
    unitId: 2,
    slug: "no-engineering",
    name: "No Engineering College",
    majors: [],
  });
  const results = rankMatches(
    [withoutEngineering, withEngineering],
    { ...preferences, majorMode: "require" },
    10,
  );

  assert.deepEqual(results.map((result) => result.college.unitId), [1]);
});

test("campus setting is an explicit auditable preference signal", () => {
  const effectiveWeights = weightsForActiveCriteria(
    preferences.weights,
    ["setting"],
  );
  const cityCollege = college();
  const townCollege = college({
    unitId: 2,
    slug: "town-college",
    name: "Town College",
    setting: "Town",
  });
  const results = rankMatches(
    [townCollege, cityCollege],
    { ...preferences, setting: "City", weights: effectiveWeights },
    10,
  );

  assert.deepEqual(results.map((result) => result.college.unitId), [1, 2]);
  assert.ok(
    results.every(
      (result) =>
        result.components.length === 1 &&
        result.components[0].key === "setting",
    ),
  );
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

test("untouched suggested weights keep the match worksheet neutral", () => {
  const effectiveWeights = weightsForActiveCriteria(preferences.weights, []);

  assert.equal(hasActiveMatchSignal(effectiveWeights), false);
  assert.deepEqual(
    rankMatches(
      [college()],
      { ...preferences, weights: effectiveWeights },
      10,
    ),
    [],
  );
});

test("choosing one preference activates only its mapped criterion", () => {
  const effectiveWeights = weightsForActiveCriteria(
    preferences.weights,
    ["location"],
  );
  const westCollege = college({ unitId: 1, state: "CA" });
  const eastCollege = college({
    unitId: 2,
    slug: "east-college",
    name: "East College",
    state: "NY",
    netPrice: metric(1_000),
    graduationRate: metric(1),
    medianEarnings: metric(500_000),
  });
  const results = rankMatches(
    [eastCollege, westCollege],
    {
      ...preferences,
      region: "west",
      weights: effectiveWeights,
    },
    10,
  );

  assert.deepEqual(effectiveWeights, {
    major: 0,
    location: 3,
    price: 0,
    size: 0,
    setting: 0,
    graduation: 0,
    earnings: 0,
  });
  assert.deepEqual(
    results.map((result) => result.college.unitId),
    [1, 2],
    "untouched price, graduation, and earnings suggestions cannot change order",
  );
  assert.ok(
    results.every(
      (result) =>
        result.components.length === 1 &&
        result.components[0].key === "location",
    ),
  );
});

test("a hard ownership filter cannot create an unscored ranking", () => {
  const effectiveWeights = weightsForActiveCriteria(preferences.weights, []);
  assert.deepEqual(
    rankMatches(
      [college()],
      {
        ...preferences,
        ownership: "Public",
        weights: effectiveWeights,
      },
      10,
    ),
    [],
  );
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

test("balanced shortlist keeps the leading fit in each observed rate band", () => {
  const ranked = rankMatches(
    [
      college({ unitId: 1, name: "First very low", admitRate: metric(0.08) }),
      college({ unitId: 2, name: "Second very low", admitRate: metric(0.09) }),
      college({ unitId: 3, name: "Low", admitRate: metric(0.2) }),
      college({ unitId: 4, name: "Moderate", admitRate: metric(0.4) }),
      college({ unitId: 5, name: "Broad", admitRate: metric(0.7) }),
      college({ unitId: 6, name: "Unavailable", admitRate: metric(null) }),
    ],
    preferences,
    10,
  );
  const shortlist = balancedObservedShortlist(ranked);

  assert.deepEqual(
    shortlist.map(({ band }) => band.key),
    ["very-low", "low", "moderate", "broad", "unavailable"],
  );
  assert.equal(
    shortlist.find(({ band }) => band.key === "very-low").result.college.unitId,
    1,
    "the first ranked college represents a repeated band",
  );

  assert.deepEqual(
    balancedObservedShortlist(
      ranked.map((result) => ({ ...result, score: 0 })),
    ),
    [],
    "zero-alignment colleges are not promoted merely to fill a band",
  );
});
