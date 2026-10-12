import assert from "node:assert/strict";
import test from "node:test";

import {
  plannerTabFromHash,
  plannerTabFromKey,
} from "../app/saved/planner-tabs.ts";

test("planner hashes preserve legacy saved and deadline deep links", () => {
  assert.equal(plannerTabFromHash("#colleges"), "colleges");
  assert.equal(plannerTabFromHash("#deadlines"), "deadlines");
  assert.equal(plannerTabFromHash("#DEADLINES"), "deadlines");
  assert.equal(plannerTabFromHash(""), "colleges");
  assert.equal(plannerTabFromHash("#unknown"), "colleges");
});

test("planner tabs support wrapping arrows plus Home and End", () => {
  assert.equal(plannerTabFromKey("colleges", "ArrowRight"), "deadlines");
  assert.equal(plannerTabFromKey("deadlines", "ArrowRight"), "colleges");
  assert.equal(plannerTabFromKey("colleges", "ArrowLeft"), "deadlines");
  assert.equal(plannerTabFromKey("deadlines", "ArrowLeft"), "colleges");
  assert.equal(plannerTabFromKey("deadlines", "Home"), "colleges");
  assert.equal(plannerTabFromKey("colleges", "End"), "deadlines");
  assert.equal(plannerTabFromKey("colleges", "Enter"), null);
});
