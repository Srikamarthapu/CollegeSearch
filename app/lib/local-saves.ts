export const SAVED_COLLEGES_STORAGE_KEY = "college-search-saved";
export const LEGACY_SAVED_COLLEGES_STORAGE_KEY = "college-compass-saved";
export const SAVED_COLLEGES_CHANGE_EVENT = "college-search-saved-change";

const savedCollegeStorageKeys = [
  SAVED_COLLEGES_STORAGE_KEY,
  LEGACY_SAVED_COLLEGES_STORAGE_KEY,
] as const;

export type SavedCollegeStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type SavedCollegeReadResult = {
  ids: number[];
  storageAvailable: boolean;
};

export type SavedCollegeWriteResult = SavedCollegeReadResult & {
  persisted: boolean;
};

function browserStorage(): SavedCollegeStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function sanitizeSavedCollegeIds(
  value: unknown,
  knownIds?: ReadonlySet<number>,
) {
  if (!Array.isArray(value)) return [];

  const ids: number[] = [];
  const seen = new Set<number>();

  for (const candidate of value) {
    if (
      !Number.isInteger(candidate) ||
      (candidate as number) <= 0 ||
      seen.has(candidate as number) ||
      (knownIds && !knownIds.has(candidate as number))
    ) {
      continue;
    }

    const unitId = candidate as number;
    seen.add(unitId);
    ids.push(unitId);
  }

  return ids;
}

export function readSavedCollegeIds(
  knownIds?: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = browserStorage(),
): SavedCollegeReadResult {
  if (!storage) return { ids: [], storageAvailable: false };

  for (const key of savedCollegeStorageKeys) {
    let serialized: string | null;

    try {
      serialized = storage.getItem(key);
    } catch {
      return { ids: [], storageAvailable: false };
    }

    if (serialized === null) continue;

    try {
      const parsed: unknown = JSON.parse(serialized);
      if (Array.isArray(parsed)) {
        return {
          ids: sanitizeSavedCollegeIds(parsed, knownIds),
          storageAvailable: true,
        };
      }
    } catch {
      // A malformed browser-local value is ignored and removed when possible.
    }

    try {
      storage.removeItem(key);
    } catch {
      // Reading remains safe even when storage cleanup is blocked.
    }
  }

  return { ids: [], storageAvailable: true };
}

function announceSavedCollegeChange(ids: number[]) {
  if (typeof window === "undefined") return;

  try {
    window.dispatchEvent(
      new CustomEvent<{ ids: number[] }>(SAVED_COLLEGES_CHANGE_EVENT, {
        detail: { ids },
      }),
    );
  } catch {
    // Persistence succeeded; an unavailable notification API should not undo it.
  }
}

export function writeSavedCollegeIds(
  value: unknown,
  knownIds?: ReadonlySet<number>,
  storage: SavedCollegeStorage | null = browserStorage(),
): SavedCollegeWriteResult {
  const ids = sanitizeSavedCollegeIds(value, knownIds);
  if (!storage) return { ids, storageAvailable: false, persisted: false };

  try {
    storage.setItem(SAVED_COLLEGES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    return { ids, storageAvailable: false, persisted: false };
  }

  try {
    storage.removeItem(LEGACY_SAVED_COLLEGES_STORAGE_KEY);
  } catch {
    // The canonical write succeeded, so legacy cleanup can be best-effort.
  }

  announceSavedCollegeChange(ids);
  return { ids, storageAvailable: true, persisted: true };
}

export function subscribeToSavedCollegeChanges(
  listener: (result: SavedCollegeReadResult) => void,
  knownIds?: ReadonlySet<number>,
) {
  if (typeof window === "undefined") return () => {};

  const refresh = () => listener(readSavedCollegeIds(knownIds));
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === SAVED_COLLEGES_STORAGE_KEY ||
      event.key === LEGACY_SAVED_COLLEGES_STORAGE_KEY
    ) {
      refresh();
    }
  };

  window.addEventListener(SAVED_COLLEGES_CHANGE_EVENT, refresh);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(SAVED_COLLEGES_CHANGE_EVENT, refresh);
    window.removeEventListener("storage", handleStorage);
  };
}
