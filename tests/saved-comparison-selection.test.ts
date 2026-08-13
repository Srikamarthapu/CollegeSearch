import assert from "node:assert/strict";
import test from "node:test";

import {
  type SavedComparisonSelection,
  visibleSavedComparisonIds,
} from "../app/lib/saved-comparison-selection.ts";

test("comparison selections never cross saved-list account scopes", () => {
  const accountA: SavedComparisonSelection = {
    ids: [101, 202],
    scopeKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };

  assert.deepEqual(
    visibleSavedComparisonIds(accountA, "loading", []),
    [],
  );
  assert.deepEqual(
    visibleSavedComparisonIds(
      accountA,
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      [101, 202],
    ),
    [],
  );
  assert.deepEqual(
    visibleSavedComparisonIds(accountA, "guest", [101, 202]),
    [],
  );
});

test("comparison selections retain only colleges still saved in the same scope", () => {
  const selection: SavedComparisonSelection = {
    ids: [101, 202, 303],
    scopeKey: "guest",
  };

  assert.deepEqual(
    visibleSavedComparisonIds(selection, "guest", [101, 303, 404]),
    [101, 303],
  );
});
