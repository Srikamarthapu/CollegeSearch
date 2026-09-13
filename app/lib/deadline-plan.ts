import { deadlineEditorKey, deadlinePlanKey, deadlinePlanLockName, emptyDeadlinePlan, parseDeadlineEditor, parseDeadlinePlan, type DeadlineEditor, type DeadlinePlan } from "./deadline-data.ts";

export type DeadlinePlanStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type DeadlinePlanSnapshot = {
  draft: DeadlinePlan; revision: string | null; persisted: boolean; draftPersisted?: boolean;
  status: "ready" | "saving" | "unavailable" | "unsupported" | "invalid" | "conflict" | "blocked";
};
export function getDeadlineStorage(): DeadlinePlanStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}
export function readDeadlinePlan(scope: unknown, knownIds: ReadonlySet<number>, storage = getDeadlineStorage()): DeadlinePlanSnapshot {
  const key = deadlinePlanKey(scope);
  const base = { draft: emptyDeadlinePlan(), revision: null, persisted: false };
  if (!key) return { ...base, status: "blocked" };
  if (!storage) return { ...base, status: "unavailable" };
  try {
    const revision = storage.getItem(key);
    const draft = parseDeadlinePlan(revision, knownIds);
    return { draft: draft ?? emptyDeadlinePlan(), revision, persisted: draft !== null && revision !== null, status: draft ? "ready" : "invalid" };
  } catch { return { ...base, status: "unavailable" }; }
}


export type DeadlinePlanLockManager = {
  request<T>(name: string, options: { mode: "exclusive" }, task: () => T | Promise<T>): Promise<T>;
};
export function getDeadlineLocks(): DeadlinePlanLockManager | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
}
export function getDeadlineJournal(): DeadlinePlanStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}
export function deadlinePlanDraftKey(scope: unknown) {
  const key = deadlinePlanKey(scope);
  return key ? `${key}:draft` : null;
}

/** Shared copies are written only under the same exclusive Web Lock in every tab. */
async function writeDeadlinePlan(
  knownIds: ReadonlySet<number>, scope: unknown, draft: DeadlinePlan, expectedRevision: string | null,
  storage = getDeadlineStorage(), locks = getDeadlineLocks(),
  isCurrent: () => boolean = () => true, replaceBrowserCopy = false,
): Promise<DeadlinePlanSnapshot> {
  const key = deadlinePlanKey(scope);
  const base = { draft, revision: expectedRevision, persisted: false };
  if (!key || !isCurrent()) return { ...base, status: "blocked" };
  const parsed = parseDeadlinePlan(JSON.stringify(draft), knownIds);
  if (!parsed) return { ...base, status: "invalid" };
  if (!storage) return { ...base, status: "unavailable" };
  if (!locks) return { ...base, status: "unsupported" };
  try {
    return await locks.request(deadlinePlanLockName(scope)!, { mode: "exclusive" }, () => {
      // Authentication may have changed while this tab waited for the lock.
      if (!isCurrent()) return { ...base, status: "blocked" as const };
      if (!replaceBrowserCopy && storage.getItem(key) !== expectedRevision) return { ...base, status: "conflict" as const };
      const revision = JSON.stringify(parsed);
      storage.setItem(key, revision);
      return { draft: parsed, revision, persisted: true, status: "ready" as const };
    });
  } catch { return { ...base, status: "unavailable" }; }
}

/**
 * Each keystroke journals synchronously to this tab's sessionStorage before an
 * async autosave. Exclusive Web Locks protect the canonical localStorage copy;
 * a module cache retains drafts across SPA navigation and verification pauses.
 */
export function createDeadlinePlanStore(
  knownIds: ReadonlySet<number>,
  storageProvider = getDeadlineStorage,
  journalProvider = getDeadlineJournal,
  locksProvider = getDeadlineLocks,
  scopeAllowed: (scope: string) => boolean = (scope) => scope === "guest",
) {
  const sessions = new Map<string, DeadlinePlanSnapshot>();
  const editors = new Map<string, { editor: DeadlineEditor | null; persisted: boolean }>();
  const epochs = new Map<string, number>();
  const running = new Map<string, Promise<DeadlinePlanSnapshot>>();
  const listeners = new Set<() => void>();
  let activeScope: string | null = null;
  function publish(scope: string, snapshot: DeadlinePlanSnapshot) {
    const key = deadlinePlanKey(scope);
    if (key) sessions.set(key, snapshot);
    for (const listener of listeners) listener();
    return snapshot;
  }
  function journal(scope: string, snapshot: DeadlinePlanSnapshot) {
    try {
      const key = deadlinePlanDraftKey(scope);
      const storage = journalProvider();
      if (!key || !storage) return false;
      storage.setItem(key, JSON.stringify({ version: 1, baseRevision: snapshot.revision, draft: snapshot.draft }));
      return true;
    } catch { return false; }
  }
  function removeJournal(scope: string) {
    try {
      const key = deadlinePlanDraftKey(scope);
      const storage = journalProvider();
      if (!key || !storage) return false;
      storage.removeItem(key);
      return true;
    } catch { return false; }
  }
  function get(scope: string): DeadlinePlanSnapshot {
    const key = deadlinePlanKey(scope);
    if (!key || !scopeAllowed(scope)) return { draft: emptyDeadlinePlan(), revision: null, persisted: false, status: "blocked" };
    const existing = sessions.get(key);
    if (existing) return existing;
    let initial = readDeadlinePlan(scope, knownIds, storageProvider());
    try {
      const raw = journalProvider()?.getItem(deadlinePlanDraftKey(scope)!);
      if (raw) {
        const candidate = JSON.parse(raw) as Record<string, unknown>;
        const draft = parseDeadlinePlan(JSON.stringify(candidate.draft), knownIds);
        if (candidate.version === 1 && draft && (typeof candidate.baseRevision === "string" || candidate.baseRevision === null)) {
          // A prior autosave may have finished immediately before the page left.
          if (initial.revision === JSON.stringify(draft)) removeJournal(scope);
          else initial = { draft, revision: candidate.baseRevision, persisted: false, draftPersisted: true,
            status: initial.status === "unavailable" ? "unavailable" : candidate.baseRevision === initial.revision ? "saving" : "conflict" };
        }
      }
    } catch { /* Preserve the canonical copy if a recovery journal is unreadable. */ }
    sessions.set(key, initial);
    return initial;
  }
  function isCurrent(scope: string) { return deadlinePlanKey(activeScope) === deadlinePlanKey(scope) && deadlinePlanKey(scope) !== null && scopeAllowed(scope); }
  function getEditor(scope: string) {
    const key = deadlineEditorKey(scope);
    if (!key || !scopeAllowed(scope)) return { editor: null, persisted: false };
    const cached = editors.get(key);
    if (cached) return cached;
    let editor: DeadlineEditor | null = null;
    try { editor = parseDeadlineEditor(journalProvider()?.getItem(key) ?? null); } catch { /* Keep the list available if a form draft cannot be read. */ }
    const result = { editor, persisted: editor !== null };
    editors.set(key, result);
    return result;
  }
  function update(scope: string, patch: Partial<DeadlinePlan>) {
    const current = get(scope);
    if (!isCurrent(scope)) return { ...current, status: "blocked" as const };
    const draft = parseDeadlinePlan(JSON.stringify({ ...current.draft, ...patch, version: 1 }), knownIds);
    if (!draft) return { ...current, status: "invalid" as const };
    const next: DeadlinePlanSnapshot = { ...current, draft, persisted: false,
      status: current.status === "conflict" || current.status === "invalid" ? current.status : "saving" };
    next.draftPersisted = journal(scope, next);
    return publish(scope, next);
  }
  function flush(scope: string, replaceBrowserCopy = false): Promise<DeadlinePlanSnapshot> {
    const key = deadlinePlanKey(scope);
    const current = get(scope);
    if (!key || !isCurrent(scope)) return Promise.resolve({ ...current, status: "blocked" });
    const pending = running.get(key);
    if (pending) return pending;
    if (current.persisted || (!replaceBrowserCopy && ["conflict", "invalid"].includes(current.status))) return Promise.resolve(current);
    const submitted = current;
    const epoch = epochs.get(key) ?? 0;
    const promise = writeDeadlinePlan(knownIds, scope, submitted.draft, submitted.revision, storageProvider(), locksProvider(), () => isCurrent(scope) && (epochs.get(key) ?? 0) === epoch, replaceBrowserCopy)
      .then((result) => {
        const latest = get(scope);
        if ((epochs.get(key) ?? 0) !== epoch || !scopeAllowed(scope)) return latest;
        if (result.status === "ready") {
          const unchanged = JSON.stringify(latest.draft) === JSON.stringify(submitted.draft);
          if (unchanged) {
            const removed = removeJournal(scope);
            return publish(scope, { ...result, draftPersisted: !removed && Boolean(latest.draftPersisted) });
          }
          const rebased: DeadlinePlanSnapshot = { ...latest, revision: result.revision, persisted: false, status: "saving" };
          rebased.draftPersisted = journal(scope, rebased);
          return publish(scope, rebased);
        }
        return publish(scope, { ...latest, status: result.status, persisted: false });
      })
      .finally(() => {
        running.delete(key);
        if (get(scope).status === "saving" && isCurrent(scope)) void flush(scope);
      });
    running.set(key, promise);
    return promise;
  }
  return {
    get, update, flush, getEditor,
    updateEditor(scope: string, value: DeadlineEditor) {
      const key = deadlineEditorKey(scope);
      if (!key || !isCurrent(scope)) return { ...getEditor(scope), persisted: false };
      const editor = parseDeadlineEditor(JSON.stringify(value));
      if (!editor) return { ...getEditor(scope), persisted: false };
      let persisted = false;
      try { const storage = journalProvider(); if (storage) { storage.setItem(key, JSON.stringify(editor)); persisted = true; } } catch { /* Keep the scoped in-memory draft. */ }
      const result = { editor, persisted };
      editors.set(key, result);
      return result;
    },
    discardEditor(scope: string) {
      const key = deadlineEditorKey(scope);
      if (!key || !isCurrent(scope)) return false;
      try { journalProvider()?.removeItem(key); } catch { return false; }
      editors.set(key, { editor: null, persisted: false });
      return true;
    },
    activate(scope: string | null) { activeScope = scope && deadlinePlanKey(scope) && scopeAllowed(scope) ? scope : null; },
    /** A deletion observer can forget memory after removing the owner's local keys. */
    forget(scope: string) {
      const key = deadlinePlanKey(scope);
      if (!key) return;
      epochs.set(key, (epochs.get(key) ?? 0) + 1);
      if (deadlinePlanKey(activeScope) === key) activeScope = null;
      removeJournal(scope);
      const editorKey = deadlineEditorKey(scope)!;
      try { journalProvider()?.removeItem(editorKey); } catch { /* The deletion receipt still denies this scope. */ }
      editors.delete(editorKey);
      publish(scope, { draft: emptyDeadlinePlan(), revision: null, status: "blocked", persisted: false });
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reconcile(scope: string) {
      const current = get(scope);
      if (!scopeAllowed(scope)) return current;
      const stored = readDeadlinePlan(scope, knownIds, storageProvider());
      if (stored.revision === current.revision && stored.status === "ready") {
        return current.status === "blocked" ? publish(scope, { ...current, status: "saving" }) : current;
      }
      // An empty dirty list can represent a deliberate removal of the last task.
      if (current.persisted || (current.status === "ready" && current.revision === null && current.draft.entries.length === 0)) return publish(scope, stored);
      return publish(scope, { ...current, status: stored.status === "unavailable" ? "unavailable" : "conflict", persisted: false });
    },
    useSaved(scope: string) {
      if (!isCurrent(scope)) return get(scope);
      if (!removeJournal(scope)) return publish(scope, { ...get(scope), status: "unavailable" });
      return publish(scope, readDeadlinePlan(scope, knownIds, storageProvider()));
    },
    saveDraft: flush,
    async clear(scope: string): Promise<DeadlinePlanSnapshot> {
      const key = deadlinePlanKey(scope);
      // Finish an outstanding autosave before taking the same lock for clear.
      const pending = key ? running.get(key) : null;
      if (pending) await pending;
      const current = get(scope);
      if (!key || !isCurrent(scope)) return { ...current, status: "blocked" };
      const epoch = epochs.get(key) ?? 0;
      const storage = storageProvider();
      const locks = locksProvider();
      if (!storage || !locks) return publish(scope, { ...current, status: !storage ? "unavailable" : "unsupported" });
      try {
        return await locks.request(deadlinePlanLockName(scope)!, { mode: "exclusive" }, () => {
          if (!isCurrent(scope) || (epochs.get(key) ?? 0) !== epoch) return { ...current, status: "blocked" as const };
          // A new edit made while clear waited is not part of the confirmed clear.
          const latest = get(scope);
          if (JSON.stringify(latest.draft) !== JSON.stringify(current.draft) || latest.revision !== current.revision) return latest;
          if (storage.getItem(key) !== current.revision) return publish(scope, { ...current, status: "conflict", persisted: false });
          storage.removeItem(key);
          if (!removeJournal(scope)) return publish(scope, { ...current, revision: null, status: "unavailable", persisted: false });
          return publish(scope, { draft: emptyDeadlinePlan(), revision: null, status: "ready", persisted: false });
        });
      } catch { return publish(scope, { ...current, status: "unavailable", persisted: false }); }
    },
  };
}
