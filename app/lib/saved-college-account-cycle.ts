import {
  SavedCollegeCoordinationUnavailableError,
  type SavedCollegeLockManager,
  withSavedCollegeAccountLock,
} from "./saved-college-lock.ts";
import {
  SavedCollegeMutationQueue,
  type SavedCollegeRemoteStore,
} from "./saved-college-sync.ts";
import {
  applySavedCollegeOutbox,
  clearSavedCollegeMutationIfSatisfied,
  readSavedCollegeOutbox,
  savedCollegeUserCacheKey,
  type SavedCollegePendingMutation,
  writeSavedCollegeIdsAtKey,
} from "./saved-college-storage.ts";
import {
  sanitizeSavedCollegeIds,
  type SavedCollegeStorage,
} from "./local-saves.ts";
import { normalizeSavedCollegeUserId } from "./saved-college-view-state.ts";

export type SavedCollegeAccountCycleStage =
  | "cache-write"
  | "lock"
  | "outbox-ack"
  | "outbox-read"
  | "outbox-reread"
  | "remote-read"
  | "remote-write"
  | "scope";

export type SavedCollegeAccountCycleStageEvent = {
  remoteReadSucceeded: boolean;
  stage: SavedCollegeAccountCycleStage;
  status: "started" | "succeeded";
};

export type SavedCollegeAccountCycleResult = {
  displayIds: number[];
  processedMutations: SavedCollegePendingMutation[];
  remainingMutations: SavedCollegePendingMutation[];
  remoteReadSucceeded: true;
  settled: boolean;
  syncedIds: number[];
};

export class SavedCollegeAccountCycleError extends Error {
  readonly remoteReadSucceeded: boolean;
  readonly stage: SavedCollegeAccountCycleStage;
  readonly storageAvailable: boolean | null;

  constructor({
    cause,
    message,
    remoteReadSucceeded,
    stage,
    storageAvailable = null,
  }: {
    cause?: unknown;
    message: string;
    remoteReadSucceeded: boolean;
    stage: SavedCollegeAccountCycleStage;
    storageAvailable?: boolean | null;
  }) {
    super(message, { cause });
    this.name = "SavedCollegeAccountCycleError";
    this.remoteReadSucceeded = remoteReadSucceeded;
    this.stage = stage;
    this.storageAvailable = storageAvailable;
  }
}

export type SavedCollegeAccountRemoteSnapshot = {
  displayIds: number[];
  pendingMutations: SavedCollegePendingMutation[];
  syncedIds: number[];
};

export type SyncSavedCollegeAccountCycleOptions = {
  knownIds: ReadonlySet<number>;
  lockManager: SavedCollegeLockManager | null;
  onRemoteSnapshot?(snapshot: SavedCollegeAccountRemoteSnapshot): void;
  onStage?(event: SavedCollegeAccountCycleStageEvent): void;
  remote: SavedCollegeRemoteStore;
  storage: SavedCollegeStorage | null;
  userId: string;
};

function cycleError(
  stage: SavedCollegeAccountCycleStage,
  remoteReadSucceeded: boolean,
  message: string,
  cause?: unknown,
  storageAvailable: boolean | null = null,
) {
  return new SavedCollegeAccountCycleError({
    cause,
    message,
    remoteReadSucceeded,
    stage,
    storageAvailable,
  });
}

function reportStage(
  listener: SyncSavedCollegeAccountCycleOptions["onStage"],
  event: SavedCollegeAccountCycleStageEvent,
) {
  try {
    listener?.(event);
  } catch {
    // Diagnostics must never change synchronization semantics.
  }
}

function reportRemoteSnapshot(
  listener: SyncSavedCollegeAccountCycleOptions["onRemoteSnapshot"],
  snapshot: SavedCollegeAccountRemoteSnapshot,
) {
  try {
    listener?.(snapshot);
  } catch {
    // Rendering diagnostics must never change synchronization semantics.
  }
}

/**
 * Runs one complete, storage-backed account synchronization cycle while holding
 * the verified user's exclusive browser lock. The per-unit outbox is read only
 * inside the lock, and an exact record is acknowledged only after both its
 * remote effect and the resulting cache snapshot are durable.
 */
export async function syncSavedCollegeAccountCycle({
  knownIds,
  lockManager,
  onRemoteSnapshot,
  onStage,
  remote,
  storage,
  userId,
}: SyncSavedCollegeAccountCycleOptions): Promise<SavedCollegeAccountCycleResult> {
  const normalizedUserId = normalizeSavedCollegeUserId(userId);
  if (!normalizedUserId) {
    throw cycleError(
      "scope",
      false,
      "A valid verified user ID is required for saved-college sync.",
    );
  }

  reportStage(onStage, {
    remoteReadSucceeded: false,
    stage: "lock",
    status: "started",
  });

  try {
    const result = await withSavedCollegeAccountLock(
      normalizedUserId,
      async () => {
        let remoteReadSucceeded = false;

        reportStage(onStage, {
          remoteReadSucceeded,
          stage: "outbox-read",
          status: "started",
        });
        const pending = readSavedCollegeOutbox(
          normalizedUserId,
          knownIds,
          storage,
        );
        if (!pending.storageAvailable || !pending.valid) {
          throw cycleError(
            "outbox-read",
            remoteReadSucceeded,
            "Pending saved-college changes could not be read safely.",
            undefined,
            pending.storageAvailable,
          );
        }
        reportStage(onStage, {
          remoteReadSucceeded,
          stage: "outbox-read",
          status: "succeeded",
        });

        reportStage(onStage, {
          remoteReadSucceeded,
          stage: "remote-read",
          status: "started",
        });
        let remoteIds: number[];
        try {
          remoteIds = sanitizeSavedCollegeIds(
            await remote.listOwned(normalizedUserId),
            knownIds,
          );
        } catch (error) {
          throw cycleError(
            "remote-read",
            false,
            "The authoritative saved-college list could not be read.",
            error,
          );
        }
        remoteReadSucceeded = true;
        reportStage(onStage, {
          remoteReadSucceeded,
          stage: "remote-read",
          status: "succeeded",
        });
        reportRemoteSnapshot(onRemoteSnapshot, {
          displayIds: applySavedCollegeOutbox(
            remoteIds,
            pending.mutations,
            knownIds,
          ),
          pendingMutations: [...pending.mutations],
          syncedIds: [...remoteIds],
        });

        const cacheKey = savedCollegeUserCacheKey(normalizedUserId);
        const persistCache = (ids: readonly number[]) => {
          reportStage(onStage, {
            remoteReadSucceeded,
            stage: "cache-write",
            status: "started",
          });
          const cached = writeSavedCollegeIdsAtKey(
            cacheKey,
            ids,
            knownIds,
            storage,
          );
          if (!cached.persisted) {
            throw cycleError(
              "cache-write",
              remoteReadSucceeded,
              "The complete saved-college cache could not be persisted.",
              undefined,
              cached.storageAvailable,
            );
          }
          reportStage(onStage, {
            remoteReadSucceeded,
            stage: "cache-write",
            status: "succeeded",
          });
        };

        const queue = new SavedCollegeMutationQueue({
          knownIds,
          onBatchCommitted(committed, nextSyncedIds) {
            // Cache first. If it fails, no outbox record is acknowledged and
            // every idempotent remote operation remains available for retry.
            persistCache(nextSyncedIds);

            const syncedSet = new Set(nextSyncedIds);
            for (const mutation of committed) {
              reportStage(onStage, {
                remoteReadSucceeded,
                stage: "outbox-ack",
                status: "started",
              });
              const acknowledged = clearSavedCollegeMutationIfSatisfied(
                normalizedUserId,
                mutation,
                syncedSet,
                storage,
              );
              if (!acknowledged.cleared) {
                throw cycleError(
                  "outbox-ack",
                  remoteReadSucceeded,
                  "A committed saved-college change could not be acknowledged.",
                  undefined,
                  acknowledged.storageAvailable,
                );
              }
              reportStage(onStage, {
                remoteReadSucceeded,
                stage: "outbox-ack",
                status: "succeeded",
              });
            }
          },
          pendingMutations: pending.mutations,
          remote,
          syncedIds: remoteIds,
          userId: normalizedUserId,
        });

        if (queue.hasPendingChanges) {
          reportStage(onStage, {
            remoteReadSucceeded,
            stage: "remote-write",
            status: "started",
          });
          try {
            await queue.flush();
          } catch (error) {
            if (error instanceof SavedCollegeAccountCycleError) throw error;
            throw cycleError(
              "remote-write",
              remoteReadSucceeded,
              "Pending saved-college changes could not be synchronized.",
              error,
            );
          }
          reportStage(onStage, {
            remoteReadSucceeded,
            stage: "remote-write",
            status: "succeeded",
          });
        } else {
          // A successful authoritative read is itself a new complete snapshot.
          persistCache(queue.syncedIds);
        }

        reportStage(onStage, {
          remoteReadSucceeded,
          stage: "outbox-reread",
          status: "started",
        });
        const remaining = readSavedCollegeOutbox(
          normalizedUserId,
          knownIds,
          storage,
        );
        if (!remaining.storageAvailable || !remaining.valid) {
          throw cycleError(
            "outbox-reread",
            remoteReadSucceeded,
            "Pending saved-college changes could not be confirmed after sync.",
            undefined,
            remaining.storageAvailable,
          );
        }
        reportStage(onStage, {
          remoteReadSucceeded,
          stage: "outbox-reread",
          status: "succeeded",
        });

        const syncedIds = queue.syncedIds;
        return {
          displayIds: applySavedCollegeOutbox(
            syncedIds,
            remaining.mutations,
            knownIds,
          ),
          processedMutations: [...pending.mutations],
          remainingMutations: [...remaining.mutations],
          remoteReadSucceeded: true as const,
          settled: remaining.mutations.length === 0,
          syncedIds,
        };
      },
      lockManager,
    );

    reportStage(onStage, {
      remoteReadSucceeded: true,
      stage: "lock",
      status: "succeeded",
    });
    return result;
  } catch (error) {
    if (error instanceof SavedCollegeAccountCycleError) throw error;
    if (error instanceof SavedCollegeCoordinationUnavailableError) {
      throw cycleError(
        "lock",
        false,
        "Saved-college sync could not acquire cross-tab coordination.",
        error,
      );
    }
    throw cycleError(
      "lock",
      false,
      "Saved-college synchronization could not start safely.",
      error,
    );
  }
}
