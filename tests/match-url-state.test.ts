import assert from "node:assert/strict";
import test from "node:test";
import { initialMatchWorksheet, parseMatchWorksheet, serializeMatchWorksheet } from "../app/match/url-state.ts";

const options = { majorOptions: ["Engineering", "Business & Marketing"], stateOptions: ["CA", "NY"] };

test("a shared worksheet restores exact preferences, weights, and active criteria", () => {
  const original = initialMatchWorksheet();
  original.preferences = {
    major: "Business & Marketing", majorMode: "require", region: "state:CA",
    ownership: "Public", maxNetPrice: 20000, residencyState: "CA", size: "large", setting: "City",
    weights: { major: 5, location: 3, price: 4, size: 2, setting: 2, graduation: 0, earnings: 1 },
  };
  original.activeCriteria = ["major", "location", "price", "size", "setting", "earnings"];
  original.hasStudentInput = true;
  const query = serializeMatchWorksheet("?ref=counselor", original);
  assert.equal(new URLSearchParams(query).get("ref"), "counselor");
  assert.deepEqual(parseMatchWorksheet(query, options), original);
});

test("restoring one preference does not turn on untouched weights", () => {
  const result = parseMatchWorksheet("?location=west&active=location", options);
  assert.deepEqual(result.activeCriteria, ["location"]);
  assert.equal(result.preferences.weights.graduation, 4);
  assert.equal(result.preferences.weights.earnings, 3);
  assert.equal(result.hasStudentInput, true);
  assert.deepEqual(parseMatchWorksheet("", options), initialMatchWorksheet());
});

test("invalid URL values return neutral defaults instead of changing the formula", () => {
  const result = parseMatchWorksheet("?major=Fake&field=require&location=state:ZZ&type=For-profit&price=-1&size=huge&setting=Moon&weights=5,4,99&active=major,location,price,size,setting,unknown", options);
  assert.deepEqual(result, initialMatchWorksheet());
  const badWeights = parseMatchWorksheet("?weights=5,3,4,2,2,4,NaN", options);
  assert.deepEqual(badWeights.preferences.weights, initialMatchWorksheet().preferences.weights);
});

test("zero weights and unset criteria cannot be reactivated by a URL", () => {
  const result = parseMatchWorksheet("?major=Engineering&weights=0,0,0,0,0,0,0&active=major,location,graduation,earnings,major", options);
  assert.deepEqual(result.activeCriteria, []);
  assert.equal(result.hasStudentInput, true);
  assert.deepEqual(parseMatchWorksheet(serializeMatchWorksheet("", result), options), result);
  assert.deepEqual(parseMatchWorksheet("?active=major,location,price,size,setting", options).activeCriteria, []);
});

test("reset removes worksheet parameters and preserves unrelated URL context", () => {
  const query = serializeMatchWorksheet("?major=Engineering&location=west&weights=1,1,1,1,1,1,1&active=major&type=Public&ref=family", initialMatchWorksheet());
  assert.equal(query, "ref=family");
  assert.deepEqual(parseMatchWorksheet(query, options), initialMatchWorksheet());
});

test("initial worksheets do not share mutable weights", () => {
  const one = initialMatchWorksheet();
  one.preferences.weights.major = 0;
  assert.equal(initialMatchWorksheet().preferences.weights.major, 5);
});
