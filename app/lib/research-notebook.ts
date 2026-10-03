export const RESEARCH_NOTE_MAX_LENGTH = 2_000;

export const RESEARCH_CHECKLIST = [
  { id: "major", label: "Verify my major is currently offered" },
  { id: "cost", label: "Run the college's net price calculator" },
  { id: "deadlines", label: "Confirm application and aid deadlines" },
  { id: "campus", label: "Explore campus life or plan a visit" },
] as const;

export type ResearchCheckId = (typeof RESEARCH_CHECKLIST)[number]["id"];
export const STUDENT_LIST_ROLES = [
  { value: "reach", label: "Reach" },
  { value: "target", label: "Target" },
  { value: "likely", label: "Likely / safety" },
] as const;
export type StudentListRole = (typeof STUDENT_LIST_ROLES)[number]["value"];
export type ResearchNotebookData = {
  version: 1;
  notes: string;
  checked: ResearchCheckId[];
  /** A student-authored planning label, never a model or institutional judgment. */
  listRole?: StudentListRole;
};

export type ResearchNotebookStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export type ResearchNotebookRead = {
  data: ResearchNotebookData;
  revision: string | null;
  status: "ready" | "unavailable" | "invalid" | "blocked";
};

export function emptyResearchNotebook(): ResearchNotebookData {
  return { version: 1, notes: "", checked: [] };
}

/** Callers supply the verified scope from SavedCollegesProvider, never an email. */
export function normalizeResearchNotebookScope(scopeKey: unknown) {
  if (typeof scopeKey !== "string") return null;
  const scope = scopeKey.trim().toLowerCase();
  return scope === "guest" ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(scope)
    ? scope
    : null;
}

export function researchNotebookKey(scopeKey: unknown, unitId: unknown) {
  if (
    typeof unitId !== "number" ||
    !Number.isSafeInteger(unitId) ||
    unitId <= 0
  ) {
    return null;
  }
  const scope = normalizeResearchNotebookScope(scopeKey);
  if (!scope) return null;
  return `college-search-research:v1:${scope}:${unitId}`;
}

export type ResearchNotebookScopeInput = {
  scopeKey: string;
  unitId: number;
  clientReady: boolean;
  hydrated: boolean;
  canMutate: boolean;
};

/**
 * Loading is a temporary visibility gate, not evidence of an account switch.
 * A different verified scope replaces the retained editor immediately, even
 * while its saved list is still loading. Retained editors cannot read user
 * input or write storage until that same scope is ready again.
 */
export function deriveResearchNotebookScope(
  lastVerifiedScope: string | null,
  input: ResearchNotebookScopeInput,
) {
  const currentScope = input.clientReady && researchNotebookKey(input.scopeKey, input.unitId)
    ? normalizeResearchNotebookScope(input.scopeKey)
    : null;
  const previousScope = researchNotebookKey(lastVerifiedScope, input.unitId)
    ? normalizeResearchNotebookScope(lastVerifiedScope)
    : null;
  const retainedScope = currentScope ?? previousScope;
  return {
    retainedScope,
    editorKey: retainedScope ? researchNotebookKey(retainedScope, input.unitId) : null,
    canEdit: currentScope !== null && input.hydrated && input.canMutate,
  };
}

export type ResearchCollectionSnapshot<T> = {
  scopeKey: string | null;
  items: readonly T[];
};

/** Keep the same card instances through loading, never across verified owners. */
export function retainResearchCollection<T>(
  previous: ResearchCollectionSnapshot<T>,
  scopeKey: string,
  hydrated: boolean,
  items: readonly T[],
): ResearchCollectionSnapshot<T> {
  const verifiedScope = normalizeResearchNotebookScope(scopeKey);
  if (!verifiedScope) return previous;
  if (hydrated) {
    return previous.scopeKey === verifiedScope && previous.items === items
      ? previous
      : { scopeKey: verifiedScope, items };
  }
  return previous.scopeKey === verifiedScope
    ? previous
    : { scopeKey: verifiedScope, items: [] };
}

export function parseResearchNotebook(raw: string | null): ResearchNotebookData | null {
  if (raw === null) return emptyResearchNotebook();
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const value = candidate as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.notes !== "string" ||
    value.notes.length > RESEARCH_NOTE_MAX_LENGTH ||
    !Array.isArray(value.checked) ||
    value.checked.length > RESEARCH_CHECKLIST.length ||
    !value.checked.every((id) => RESEARCH_CHECKLIST.some((item) => item.id === id)) ||
    new Set(value.checked).size !== value.checked.length ||
    (value.listRole !== undefined && !STUDENT_LIST_ROLES.some((role) => role.value === value.listRole))
  ) {
    return null;
  }
  const checked = value.checked;
  // Project only supported fields and keep a stable checklist order.
  return {
    version: 1,
    notes: value.notes,
    ...(value.listRole !== undefined ? { listRole: value.listRole as StudentListRole } : {}),
    checked: RESEARCH_CHECKLIST.filter((item) => checked.includes(item.id)).map(
      (item) => item.id,
    ),
  };
}

export function researchNotebooksEqual(a: ResearchNotebookData, b: ResearchNotebookData) {
  return (
    a.notes === b.notes &&
    a.listRole === b.listRole &&
    a.checked.length === b.checked.length &&
    a.checked.every((id) => b.checked.includes(id))
  );
}

export function getResearchNotebookStorage(): ResearchNotebookStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readResearchNotebook(
  scopeKey: string,
  unitId: number,
  storage: ResearchNotebookStorage | null = getResearchNotebookStorage(),
): ResearchNotebookRead {
  const key = researchNotebookKey(scopeKey, unitId);
  if (!key) return { data: emptyResearchNotebook(), revision: null, status: "blocked" };
  if (!storage) {
    return { data: emptyResearchNotebook(), revision: null, status: "unavailable" };
  }
  try {
    const revision = storage.getItem(key);
    const data = parseResearchNotebook(revision);
    return {
      data: data ?? emptyResearchNotebook(),
      revision,
      status: data ? "ready" : "invalid",
    };
  } catch {
    return { data: emptyResearchNotebook(), revision: null, status: "unavailable" };
  }
}

export type ResearchNotebookLockManager = {
  request<T>(name: string, options: { mode: "exclusive" }, task: () => T | Promise<T>): Promise<T>;
};

export function getResearchNotebookLockManager(): ResearchNotebookLockManager | null {
  return typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null;
}

/** All writes, including restore, use this scope-wide lock. No unsafe fallback. */
export function researchNotebookLockName(scopeKey: string) {
  const scope = normalizeResearchNotebookScope(scopeKey);
  return scope ? `college-search:research:${scope}` : null;
}

export type ResearchNotebookWriteResult =
  | { status: "saved"; revision: string | null; data: ResearchNotebookData }
  | { status: "blocked" | "invalid" | "unavailable" | "unsupported" | "conflict" };

/** The revision check AND replacement execute inside one cross-tab Web Lock. */
export async function writeResearchNotebook(
  scopeKey: string,
  unitId: number,
  draft: ResearchNotebookData,
  expectedRevision: string | null,
  storage: ResearchNotebookStorage | null = getResearchNotebookStorage(),
  locks: ResearchNotebookLockManager | null = getResearchNotebookLockManager(),
  isCurrent: () => boolean = () => true,
): Promise<ResearchNotebookWriteResult> {
  const key = researchNotebookKey(scopeKey, unitId);
  const lockName = researchNotebookLockName(scopeKey);
  if (!key || !lockName || !isCurrent()) return { status: "blocked" };
  let data: ResearchNotebookData | null;
  try { data = parseResearchNotebook(JSON.stringify(draft)); } catch { return { status: "invalid" }; }
  if (!data) return { status: "invalid" };
  if (!storage) return { status: "unavailable" };
  if (!locks) return { status: "unsupported" };
  try {
    return await locks.request(lockName, { mode: "exclusive" }, () => {
      // Auth may have changed while this tab waited for another writer.
      if (!isCurrent()) return { status: "blocked" } as const;
      if (storage.getItem(key) !== expectedRevision) return { status: "conflict" } as const;
      const revision = JSON.stringify(data);
      storage.setItem(key, revision);
      return { status: "saved", revision, data } as const;
    });
  } catch {
    return { status: "unavailable" };
  }
}

/** Explicit erasure removes the complete saved record under the same CAS lock. */
export async function clearResearchNotebook(
  scopeKey: string,
  unitId: number,
  expectedRevision: string | null,
  storage: ResearchNotebookStorage | null = getResearchNotebookStorage(),
  locks: ResearchNotebookLockManager | null = getResearchNotebookLockManager(),
  isCurrent: () => boolean = () => true,
): Promise<ResearchNotebookWriteResult> {
  const key = researchNotebookKey(scopeKey, unitId);
  const lockName = researchNotebookLockName(scopeKey);
  if (!key || !lockName || !isCurrent()) return { status: "blocked" };
  if (!storage?.removeItem) return { status: "unavailable" };
  if (!locks) return { status: "unsupported" };
  try {
    return await locks.request(lockName, { mode: "exclusive" }, () => {
      if (!isCurrent()) return { status: "blocked" } as const;
      if (storage.getItem(key) !== expectedRevision) return { status: "conflict" } as const;
      storage.removeItem!(key);
      return { status: "saved", revision: null, data: emptyResearchNotebook() } as const;
    });
  } catch { return { status: "unavailable" }; }
}
