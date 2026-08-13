import { normalizeSavedCollegeUserId } from "./saved-college-view-state.ts";

export const SAVED_COLLEGE_ACCOUNT_LOCK_PREFIX =
  "college-search:saved-colleges:";

export type SavedCollegeLockManager = {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T> | T,
  ): Promise<T>;
};

export class SavedCollegeCoordinationUnavailableError extends Error {
  constructor() {
    super(
      "This browser cannot safely coordinate account saves across tabs.",
    );
    this.name = "SavedCollegeCoordinationUnavailableError";
  }
}

export function savedCollegeUserLockName(userId: string) {
  const normalized = normalizeSavedCollegeUserId(userId);
  if (!normalized) {
    throw new Error("A valid verified user ID is required for account locking.");
  }
  return `${SAVED_COLLEGE_ACCOUNT_LOCK_PREFIX}${normalized}`;
}

export function getSavedCollegeBrowserLockManager(): SavedCollegeLockManager | null {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    return null;
  }

  return navigator.locks as SavedCollegeLockManager;
}

/**
 * Serializes the remote-read -> pending-operation -> acknowledgement cycle for
 * one verified account across every same-origin tab. Without this lock, an
 * older request can complete after a newer one and restore a deleted row.
 */
export function withSavedCollegeAccountLock<T>(
  userId: string,
  task: () => Promise<T> | T,
  manager: SavedCollegeLockManager | null = getSavedCollegeBrowserLockManager(),
) {
  if (!manager) {
    return Promise.reject(new SavedCollegeCoordinationUnavailableError());
  }

  return manager.request(
    savedCollegeUserLockName(userId),
    { mode: "exclusive" },
    task,
  );
}
