import {
  readSavedCollegeIds,
  sanitizeSavedCollegeIds,
  type SavedCollegeStorage,
} from "./local-saves.ts";

export const SAVED_COLLEGE_USER_CACHE_PREFIX =
  "college-search-saved-user-cache:";
export const SAVED_COLLEGE_USER_OUTBOX_PREFIX =
  "college-search-saved-user-outbox:";

export type SavedCollegePendingAction = "remove" | "save";
export type SavedCollegePendingMutation = {
  action: SavedCollegePendingAction;
  unitId: number;
};

type SavedCollegeMutationPayload = {
  action: SavedCollegePendingAction;
  version: 2;
};

function normalizedVerifiedUserId(userId: string) {
  const normalized = userId.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error("A valid verified user ID is required for scoped saves.");
  }
  return normalized;
}

export function savedCollegeUserCacheKey(userId: string) {
  return `${SAVED_COLLEGE_USER_CACHE_PREFIX}${normalizedVerifiedUserId(userId)}`;
}

export function savedCollegeUserOutboxKey(userId: string) {
  return `${SAVED_COLLEGE_USER_OUTBOX_PREFIX}${normalizedVerifiedUserId(userId)}`;
}

export function savedCollegeUserMutationKey(userId: string, unitId: number) {
  if (!Number.isInteger(unitId) || unitId <= 0) {
    throw new Error("A positive college UNITID is required for scoped saves.");
  }
  return `${savedCollegeUserOutboxKey(userId)}:${unitId}`;
}

export function getSavedCollegeBrowserStorage(): SavedCollegeStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSavedCollegeIdsAtKey(
  key: string,
  knownIds: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = getSavedCollegeBrowserStorage(),
) {
  if (!storage) {
    return {
      ids: [],
      present: false,
      storageAvailable: false,
      valid: false,
    };
  }
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return {
      ids: [],
      present: false,
      storageAvailable: false,
      valid: false,
    };
  }
  if (serialized === null) {
    return {
      ids: [],
      present: false,
      storageAvailable: true,
      valid: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {
      ids: [],
      present: true,
      storageAvailable: true,
      valid: false,
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      ids: [],
      present: true,
      storageAvailable: true,
      valid: false,
    };
  }
  return {
    ids: sanitizeSavedCollegeIds(parsed, knownIds),
    present: true,
    storageAvailable: true,
    valid: true,
  };
}

export function writeSavedCollegeIdsAtKey(
  key: string,
  value: unknown,
  knownIds: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = getSavedCollegeBrowserStorage(),
) {
  const ids = sanitizeSavedCollegeIds(value, knownIds);
  if (!storage) return { ids, persisted: false, storageAvailable: false };
  try {
    storage.setItem(key, JSON.stringify(ids));
    return { ids, persisted: true, storageAvailable: true };
  } catch {
    return { ids, persisted: false, storageAvailable: false };
  }
}

export function clearSavedCollegeIdsAtKey(
  key: string,
  storage: SavedCollegeStorage | null = getSavedCollegeBrowserStorage(),
) {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readGuestSavedCollegeIds(
  knownIds: ReadonlySet<number>,
  storage?: SavedCollegeStorage | null,
) {
  return readSavedCollegeIds(knownIds, storage);
}

export function readSavedCollegeOutbox(
  userId: string,
  knownIds: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = getSavedCollegeBrowserStorage(),
) {
  if (!storage) {
    return {
      mutations: [],
      present: false,
      storageAvailable: false,
      valid: false,
    };
  }

  const mutations: SavedCollegePendingMutation[] = [];
  let present = false;
  let valid = true;
  for (const unitId of knownIds) {
    let serialized: string | null;
    try {
      serialized = storage.getItem(
        savedCollegeUserMutationKey(userId, unitId),
      );
    } catch {
      return {
        mutations: [],
        present,
        storageAvailable: false,
        valid: false,
      };
    }
    if (serialized === null) continue;
    present = true;

    let parsed: Partial<SavedCollegeMutationPayload>;
    try {
      parsed = JSON.parse(serialized) as Partial<SavedCollegeMutationPayload>;
    } catch {
      valid = false;
      continue;
    }
    if (
      parsed.version !== 2 ||
      (parsed.action !== "save" && parsed.action !== "remove")
    ) {
      valid = false;
      continue;
    }
    mutations.push({ action: parsed.action, unitId });
  }

  return {
    mutations,
    present,
    storageAvailable: true,
    valid,
  };
}

export function writeSavedCollegeMutation(
  userId: string,
  mutation: SavedCollegePendingMutation,
  knownIds: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = getSavedCollegeBrowserStorage(),
) {
  if (
    !knownIds.has(mutation.unitId) ||
    (mutation.action !== "save" && mutation.action !== "remove")
  ) {
    return { persisted: false, storageAvailable: Boolean(storage) };
  }
  if (!storage) return { persisted: false, storageAvailable: false };

  try {
    const payload: SavedCollegeMutationPayload = {
      action: mutation.action,
      version: 2,
    };
    storage.setItem(
      savedCollegeUserMutationKey(userId, mutation.unitId),
      JSON.stringify(payload),
    );
    return { persisted: true, storageAvailable: true };
  } catch {
    return { persisted: false, storageAvailable: false };
  }
}

export function clearSavedCollegeMutationIfSatisfied(
  userId: string,
  mutation: SavedCollegePendingMutation,
  syncedIds: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = getSavedCollegeBrowserStorage(),
) {
  if (!storage) return { cleared: false, storageAvailable: false };
  const satisfied =
    mutation.action === "save"
      ? syncedIds.has(mutation.unitId)
      : !syncedIds.has(mutation.unitId);
  if (!satisfied) return { cleared: false, storageAvailable: true };

  let serialized: string | null;
  try {
    const key = savedCollegeUserMutationKey(userId, mutation.unitId);
    serialized = storage.getItem(key);
  } catch {
    return { cleared: false, storageAvailable: false };
  }
  if (serialized === null) return { cleared: true, storageAvailable: true };

  let parsed: Partial<SavedCollegeMutationPayload>;
  try {
    parsed = JSON.parse(serialized) as Partial<SavedCollegeMutationPayload>;
  } catch {
    return { cleared: false, storageAvailable: true };
  }
  if (
    parsed.version !== 2 ||
    (parsed.action !== "save" && parsed.action !== "remove")
  ) {
    return { cleared: false, storageAvailable: true };
  }
  if (parsed.action !== mutation.action) {
    // A newer intent replaced the committed one while the network request
    // was in flight. Preserve that record and allow the queue to continue.
    return { cleared: true, storageAvailable: true };
  }

  try {
    storage.removeItem(savedCollegeUserMutationKey(userId, mutation.unitId));
    return { cleared: true, storageAvailable: true };
  } catch {
    return { cleared: false, storageAvailable: false };
  }
}

export function writeSavedCollegeOutbox(
  userId: string,
  mutations: readonly SavedCollegePendingMutation[],
  knownIds: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = getSavedCollegeBrowserStorage(),
) {
  const latestByUnitId = new Map<number, SavedCollegePendingAction>();
  for (const mutation of mutations) {
    if (
      knownIds.has(mutation.unitId) &&
      (mutation.action === "save" || mutation.action === "remove")
    ) {
      latestByUnitId.set(mutation.unitId, mutation.action);
    }
  }
  const sanitized = Array.from(latestByUnitId, ([unitId, action]) => ({
    action,
    unitId,
  }));
  if (!storage) {
    return { mutations: sanitized, persisted: false, storageAvailable: false };
  }

  let persisted = true;
  let storageAvailable = true;
  for (const mutation of sanitized) {
    const result = writeSavedCollegeMutation(
      userId,
      mutation,
      knownIds,
      storage,
    );
    persisted &&= result.persisted;
    storageAvailable &&= result.storageAvailable;
  }
  return { mutations: sanitized, persisted, storageAvailable };
}

export function applySavedCollegeOutbox(
  ids: unknown,
  mutations: readonly SavedCollegePendingMutation[],
  knownIds: ReadonlySet<number>,
) {
  const result = new Set(sanitizeSavedCollegeIds(ids, knownIds));
  for (const mutation of mutations) {
    if (!knownIds.has(mutation.unitId)) continue;
    if (mutation.action === "save") result.add(mutation.unitId);
    if (mutation.action === "remove") result.delete(mutation.unitId);
  }
  return Array.from(result);
}
