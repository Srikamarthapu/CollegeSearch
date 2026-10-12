export type SavedComparisonSelection = {
  ids: number[];
  scopeKey: string;
};

export function visibleSavedComparisonIds(
  selection: SavedComparisonSelection,
  activeScopeKey: string,
  savedIds: readonly number[],
) {
  if (selection.scopeKey !== activeScopeKey) return [];

  const saved = new Set(savedIds);
  return selection.ids.filter((unitId) => saved.has(unitId));
}
