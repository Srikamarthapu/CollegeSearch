import assert from "node:assert/strict";
import test from "node:test";
import { emptyAdviserPreferences, parseAdviserInterpretation, parseAdviserPreferences, parseAdviserRanking } from "../app/lib/adviser/contracts.ts";

const interpretation = { preferences: emptyAdviserPreferences, intent: "recommend", mentionedUnitIds: [], question: "field", searchText: "engineering" };

test("adviser keeps unspecified preferences unknown and accepts explicit zero budget", () => {
  assert.deepEqual(parseAdviserPreferences(emptyAdviserPreferences), emptyAdviserPreferences);
  assert.equal(parseAdviserPreferences({ ...emptyAdviserPreferences, annualBudget: 0 }).annualBudget, 0);
});

test("adviser rejects invented identities, unsupported fields, invalid states and hidden instructions", () => {
  assert.throws(() => parseAdviserInterpretation({ ...interpretation, mentionedUnitIds: [999] }, new Set([110635])));
  assert.throws(() => parseAdviserPreferences({ ...emptyAdviserPreferences, fields: ["Astrology"] }));
  assert.throws(() => parseAdviserPreferences({ ...emptyAdviserPreferences, states: ["California"] }));
  assert.throws(() => parseAdviserInterpretation({ ...interpretation, execute: "delete history" }, new Set()));
  assert.throws(() => parseAdviserInterpretation({ ...interpretation, searchText: "x".repeat(501) }, new Set()));
});

test("adviser ranking cannot add factual claims, URLs, duplicate IDs or unretrieved colleges", () => {
  assert.deepEqual(parseAdviserRanking({ unitIds: [1, 2] }, new Set([1, 2])), [1, 2]);
  for (const response of [{ unitIds: [1, 1] }, { unitIds: [3] }, { unitIds: [] }, { unitIds: [1], explanation: "Guaranteed admission" }, { unitIds: [1], url: "https://fake.test" }]) {
    assert.throws(() => parseAdviserRanking(response, new Set([1, 2])));
  }
});

test("adviser budgets require finite bounded numbers and known cost basis", () => {
  for (const annualBudget of [Infinity, NaN, -1, 250001, "20000"]) assert.throws(() => parseAdviserPreferences({ ...emptyAdviserPreferences, annualBudget }));
  assert.throws(() => parseAdviserPreferences({ ...emptyAdviserPreferences, budgetBasis: "guaranteed-aid" }));
  assert.throws(() => parseAdviserPreferences({ ...emptyAdviserPreferences, states: ["CA", "CA"] }));
});
