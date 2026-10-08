import { sanitizeSavedCollegeIds } from "./local-saves.ts";

export type SavedCollegeRemoteStore = {
  listOwned(userId: string): Promise<unknown>;
  removeOwned(userId: string, unitIds: readonly number[]): Promise<void>;
  upsertOwned(userId: string, unitIds: readonly number[]): Promise<void>;
};

export type SavedCollegeMutation = {
  action: "remove" | "save";
  unitId: number;
};

export type SavedCollegeMutationResult = {
  removedIds: number[];
  savedIds: number[];
  syncedIds: number[];
};

function requireUserId(userId: string) {
  const normalized = userId.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized,
    )
  ) {
    throw new Error(
      "A valid verified user ID is required for saved-college sync.",
    );
  }
  return normalized;
}

export function savedCollegeIdsEqual(
  left: readonly number[],
  right: readonly number[],
) {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((unitId) => rightIds.has(unitId));
}

export function sanitizeSavedCollegeMutations(
  value: readonly SavedCollegeMutation[],
  knownIds: ReadonlySet<number>,
) {
  const latest = new Map<number, "remove" | "save">();
  for (const mutation of value) {
    if (
      mutation &&
      knownIds.has(mutation.unitId) &&
      (mutation.action === "remove" || mutation.action === "save")
    ) {
      latest.set(mutation.unitId, mutation.action);
    }
  }
  return Array.from(latest, ([unitId, action]) => ({ action, unitId }));
}

export async function syncSavedCollegeMutations({
  knownIds,
  mutations,
  remote,
  syncedIds,
  userId,
}: {
  knownIds: ReadonlySet<number>;
  mutations: readonly SavedCollegeMutation[];
  remote: SavedCollegeRemoteStore;
  syncedIds: unknown;
  userId: string;
}): Promise<SavedCollegeMutationResult> {
  const ownedUserId = requireUserId(userId);
  const synced = sanitizeSavedCollegeIds(syncedIds, knownIds);
  const sanitizedMutations = sanitizeSavedCollegeMutations(mutations, knownIds);
  const savedIds = sanitizedMutations
    .filter((mutation) => mutation.action === "save")
    .map((mutation) => mutation.unitId);
  const removedIds = sanitizedMutations
    .filter((mutation) => mutation.action === "remove")
    .map((mutation) => mutation.unitId);

  if (savedIds.length > 0) {
    await remote.upsertOwned(ownedUserId, savedIds);
  }
  if (removedIds.length > 0) {
    await remote.removeOwned(ownedUserId, removedIds);
  }

  const next = new Set(synced);
  for (const unitId of savedIds) next.add(unitId);
  for (const unitId of removedIds) next.delete(unitId);
  return { removedIds, savedIds, syncedIds: Array.from(next) };
}

/**
 * Serializes rapid local edits. New desired state received during a request is
 * picked up before the shared flush promise resolves, so late events are not
 * overwritten by an older response.
 */
export class SavedCollegeMutationQueue {
  readonly #knownIds: ReadonlySet<number>;
  readonly #remote: SavedCollegeRemoteStore;
  readonly #userId: string;
  readonly #onBatchCommitted?: (
    mutations: readonly SavedCollegeMutation[],
    syncedIds: readonly number[],
  ) => void;
  #pending = new Map<number, "remove" | "save">();
  #syncedIds: number[];
  #activeFlush: Promise<SavedCollegeMutationResult> | null = null;

  constructor({
    knownIds,
    pendingMutations = [],
    onBatchCommitted,
    remote,
    syncedIds,
    userId,
  }: {
    knownIds: ReadonlySet<number>;
    pendingMutations?: readonly SavedCollegeMutation[];
    onBatchCommitted?: (
      mutations: readonly SavedCollegeMutation[],
      syncedIds: readonly number[],
    ) => void;
    remote: SavedCollegeRemoteStore;
    syncedIds: unknown;
    userId: string;
  }) {
    this.#userId = requireUserId(userId);
    this.#knownIds = knownIds;
    this.#remote = remote;
    this.#onBatchCommitted = onBatchCommitted;
    this.#syncedIds = sanitizeSavedCollegeIds(syncedIds, knownIds);
    for (const mutation of sanitizeSavedCollegeMutations(
      pendingMutations,
      knownIds,
    )) {
      this.#pending.set(mutation.unitId, mutation.action);
    }
  }

  enqueue(mutation: SavedCollegeMutation) {
    if (!this.#knownIds.has(mutation.unitId)) return;
    this.#pending.set(mutation.unitId, mutation.action);
  }

  get pendingCount() {
    return this.#pending.size;
  }

  get hasPendingChanges() {
    return this.pendingCount > 0;
  }

  get pendingMutations() {
    return Array.from(this.#pending, ([unitId, action]) => ({
      action,
      unitId,
    }));
  }

  get displayIds() {
    const result = new Set(this.#syncedIds);
    for (const [unitId, action] of this.#pending) {
      if (action === "save") result.add(unitId);
      if (action === "remove") result.delete(unitId);
    }
    return Array.from(result);
  }

  get syncedIds() {
    return [...this.#syncedIds];
  }

  flush() {
    if (this.#activeFlush) return this.#activeFlush;

    this.#activeFlush = this.#flushUntilCurrent().finally(() => {
      this.#activeFlush = null;
    });
    return this.#activeFlush;
  }

  async #flushUntilCurrent(): Promise<SavedCollegeMutationResult> {
    let lastResult: SavedCollegeMutationResult = {
      removedIds: [],
      savedIds: [],
      syncedIds: this.syncedIds,
    };

    while (this.#pending.size > 0) {
      const targetMutations = this.pendingMutations;
      lastResult = await syncSavedCollegeMutations({
        knownIds: this.#knownIds,
        mutations: targetMutations,
        remote: this.#remote,
        syncedIds: this.#syncedIds,
        userId: this.#userId,
      });
      this.#syncedIds = lastResult.syncedIds;
      this.#onBatchCommitted?.(targetMutations, this.#syncedIds);
      for (const mutation of targetMutations) {
        if (this.#pending.get(mutation.unitId) === mutation.action) {
          this.#pending.delete(mutation.unitId);
        }
      }
    }

    return lastResult;
  }
}
