import {
  clearResearchNotebook,
  emptyResearchNotebook,
  normalizeResearchNotebookScope,
  getResearchNotebookLockManager,
  getResearchNotebookStorage,
  parseResearchNotebook,
  readResearchNotebook,
  researchNotebookKey,
  researchNotebooksEqual,
  writeResearchNotebook,
  type ResearchNotebookData,
  type ResearchNotebookLockManager,
  type ResearchNotebookRead,
  type ResearchNotebookStorage,
  type ResearchNotebookWriteResult,
} from "./research-notebook.ts";

import { getAccountErasureState } from "./account-browser-erasure.ts";

export type ResearchDraftStorage = ResearchNotebookStorage & { removeItem(key: string): void };
export type ResearchEditorSnapshot = ResearchNotebookRead & {
  draft: ResearchNotebookData;
  dirty: boolean;
  saving: boolean;
  draftStatus: "ready" | "unavailable" | "invalid";
  feedback: ResearchNotebookWriteResult["status"] | null;
};

export function researchDraftKey(scope: string, unitId: number) {
  return researchNotebookKey(scope, unitId)?.replace("college-search-research:", "college-search-research-draft:") ?? null;
}

function browserDraftStorage(): ResearchDraftStorage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

function parseDraft(raw: string): { baseRevision: string | null; data: ResearchNotebookData } | null {
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !(value.baseRevision === null || typeof value.baseRevision === "string")) return null;
    const data = parseResearchNotebook(JSON.stringify(value.data));
    return data ? { baseRevision: value.baseRevision, data } : null;
  } catch { return null; }
}

/** One editor per scope/college, independent of React cards and route lifetimes. */
export function createResearchEditor(
  scope: string,
  unitId: number,
  storage: ResearchNotebookStorage | null,
  drafts: ResearchDraftStorage | null,
  locks: ResearchNotebookLockManager | null,
  scopeAllowed: (scope: string) => boolean = () => true,
) {
  const key = researchDraftKey(scope, unitId);
  let forgotten = false;
  let generation = 0;
  const allowed = () => !forgotten && scopeAllowed(scope);
  function initialState(): ResearchEditorSnapshot {
  const saved = allowed() ? readResearchNotebook(scope, unitId, storage) : { data: emptyResearchNotebook(), revision: null, status: "blocked" as const };
  let initial: ResearchEditorSnapshot = {
    ...saved, draft: saved.data, dirty: false, saving: false,
    draftStatus: drafts ? "ready" : "unavailable", feedback: null,
  };
  if (allowed() && key && drafts) {
    try {
      const raw = drafts.getItem(key);
      if (raw !== null) {
        const restored = parseDraft(raw);
        if (!restored) initial.draftStatus = "invalid";
        else {
          const dirty = !researchNotebooksEqual(restored.data, saved.data);
          initial = {
            ...initial, draft: restored.data, dirty,
            revision: dirty ? restored.baseRevision : saved.revision,
            feedback: dirty && saved.revision !== restored.baseRevision ? "conflict" : null,
          };
        }
      }
    } catch { initial.draftStatus = "unavailable"; }
  }
    return initial;
  }
  let state = initialState();
  const listeners = new Set<() => void>();
  function publish(next: ResearchEditorSnapshot) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function journal(next: ResearchEditorSnapshot): ResearchEditorSnapshot {
    if (!key || !drafts) return { ...next, draftStatus: "unavailable" };
    // A corrupt recovery record is never silently overwritten by typing.
    if (state.draftStatus === "invalid") return { ...next, draftStatus: "invalid" };
    try {
      if (next.dirty) drafts.setItem(key, JSON.stringify({ version: 1, baseRevision: next.revision, data: next.draft }));
      else drafts.removeItem(key);
      return { ...next, draftStatus: "ready" };
    } catch { return { ...next, draftStatus: "unavailable" }; }
  }
  function refresh() {
    if (!allowed()) return;
    if (state.status === "blocked") { publish(initialState()); return; }
    const current = readResearchNotebook(scope, unitId, storage);
    if (!state.dirty) {
      publish({ ...state, ...current, draft: current.data, feedback: null });
    } else if (current.revision !== state.revision) {
      publish({ ...state, status: current.status, feedback: "conflict" });
    } else if (state.status !== current.status) {
      publish({ ...state, status: current.status });
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
    /** Called only for confirmed deletion, never for a transient storage error. */
    forget() {
      generation += 1;
      forgotten = true;
      let removed = true;
      try { if (key && drafts) drafts.removeItem(key); else removed = false; } catch { removed = false; }
      const empty = emptyResearchNotebook();
      publish({ data: empty, draft: empty, revision: null, status: "blocked", dirty: false, saving: false, draftStatus: removed ? "ready" : "unavailable", feedback: "blocked" });
      return removed;
    },
    update(data: ResearchNotebookData) {
      if (!allowed()) return;
      const next = parseResearchNotebook(JSON.stringify(data));
      if (!key || !next) return;
      publish(journal({ ...state, draft: next, dirty: state.feedback === "conflict" || !researchNotebooksEqual(next, state.data), feedback: state.feedback === "conflict" ? "conflict" : null }));
    },
    async save(isCurrent: () => boolean = () => true): Promise<ResearchNotebookWriteResult> {
      if (!allowed() || state.saving || !isCurrent()) return { status: "blocked" };
      if (state.draftStatus === "invalid" || state.status === "invalid") return { status: "invalid" };
      const submitted = state.draft;
      const expected = state.revision;
      const epoch = generation;
      const current = () => allowed() && epoch === generation && isCurrent();
      publish({ ...state, saving: true, feedback: null });
      const result = await writeResearchNotebook(scope, unitId, submitted, expected, storage, locks, current);
      if (epoch !== generation) return { status: "blocked" };
      if (result.status === "saved") {
        publish(journal({ ...state, data: result.data, revision: result.revision, status: "ready", dirty: !researchNotebooksEqual(state.draft, result.data), saving: false, feedback: "saved" }));
      } else {
        publish({ ...state, saving: false, feedback: result.status });
      }
      return result;
    },
    /** Caller obtains explicit consent before discarding a draft. */
    discardDraft() {
      if (!allowed()) return false;
      const current = readResearchNotebook(scope, unitId, storage);
      if (current.status !== "ready") return false;
      try {
        if (!key || !drafts) return false;
        drafts.removeItem(key);
      } catch { publish({ ...state, draftStatus: "unavailable" }); return false; }
      publish({ ...current, draft: current.data, dirty: false, saving: false, draftStatus: "ready", feedback: null });
      return true;
    },
    /** Rebase only after the student reviews the other tab's saved copy. */
    reviewLatest(): ResearchNotebookRead { return allowed() ? readResearchNotebook(scope, unitId, storage) : { data: emptyResearchNotebook(), revision: null, status: "blocked" }; },
    async replaceWithDraft(reviewedRevision: string | null, isCurrent: () => boolean = () => true): Promise<ResearchNotebookWriteResult> {
      if (!allowed()) return { status: "blocked" };
      const current = readResearchNotebook(scope, unitId, storage);
      if (current.status !== "ready" || state.saving || !isCurrent()) return { status: "blocked" };
      if (current.revision !== reviewedRevision) {
        publish({ ...state, feedback: "conflict" });
        return { status: "conflict" };
      }
      publish(journal({ ...state, data: current.data, revision: current.revision, dirty: !researchNotebooksEqual(state.draft, current.data), feedback: null }));
      return this.save(isCurrent);
    },
    /** An explicit clear also removes listRole, preserving no invisible fields. */
    async clear(isCurrent: () => boolean = () => true): Promise<ResearchNotebookWriteResult> {
      if (!allowed() || state.saving || !isCurrent()) return { status: "blocked" };
      const submitted = state.draft;
      const expected = state.revision;
      const epoch = generation;
      const current = () => allowed() && epoch === generation && isCurrent();
      publish({ ...state, saving: true, feedback: null });
      const result = await clearResearchNotebook(scope, unitId, expected, storage, locks, current);
      if (epoch !== generation) return { status: "blocked" };
      if (result.status !== "saved") { publish({ ...state, saving: false, feedback: result.status }); return result; }
      let draftStatus: ResearchEditorSnapshot["draftStatus"] = "ready";
      try { if (!key || !drafts) draftStatus = "unavailable"; else drafts.removeItem(key); } catch { draftStatus = "unavailable"; }
      const draft = state.draft === submitted ? result.data : state.draft;
      const next: ResearchEditorSnapshot = { data: result.data, draft, revision: result.revision, status: "ready", dirty: !researchNotebooksEqual(draft, result.data), saving: false, draftStatus, feedback: "saved" };
      // Explicit clear permits removal of a corrupt journal, but later typing survives.
      state = { ...state, draftStatus };
      publish(next.dirty ? journal(next) : next);
      return result;
    },
  };
}

export type ResearchEditor = ReturnType<typeof createResearchEditor>;
const editors = new Map<string, ResearchEditor>();
let browserListenersInstalled = false;

export function getResearchEditor(scope: string, unitId: number): ResearchEditor {
  const key = researchNotebookKey(scope, unitId);
  if (!key || typeof window === "undefined") throw new Error("A verified browser research scope is required.");
  let editor = editors.get(key);
  if (!editor) {
    editor = createResearchEditor(scope, unitId, getResearchNotebookStorage(), browserDraftStorage(), getResearchNotebookLockManager(), (candidate) => getAccountErasureState(candidate) === "active");
    editors.set(key, editor);
  }
  if (!browserListenersInstalled) {
    browserListenersInstalled = true;
    window.addEventListener("storage", (event) => {
      if (event.key === null) editors.forEach((item) => item.refresh());
      else editors.get(event.key)?.refresh();
    });
    // Keeps protecting drafts even when navigation/filtering unmounts the card.
    window.addEventListener("beforeunload", (event) => {
      if (![...editors.values()].some((item) => item.getSnapshot().dirty)) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }
  return editor;
}

/** Export current-tab edits; never report success with a stale or conflicted copy. */
export function readResearchForExport(scope: string, unitIds: readonly number[], getEditor: (scope: string, unitId: number) => ResearchEditor = getResearchEditor) {
  const notebooks: Record<number, ResearchNotebookData> = {};
  let draftCount = 0;
  for (const unitId of unitIds) {
    const editor = getEditor(scope, unitId);
    editor.refresh();
    const state = editor.getSnapshot();
    if (state.status !== "ready" || state.draftStatus === "invalid" || state.feedback === "conflict" || state.saving) {
      return { status: "blocked" as const, unitId };
    }
    notebooks[unitId] = state.draft;
    if (state.dirty) draftCount += 1;
  }
  return { status: "ready" as const, notebooks, draftCount };
}

/** Clears only this account's live controllers; the erasure helper sweeps storage. */
export function forgetResearchScope(scope: string) {
  const normalized = normalizeResearchNotebookScope(scope);
  if (!normalized || normalized === "guest") return;
  const prefix = `college-search-research:v1:${normalized}:`;
  for (const [key, editor] of editors) {
    if (!key.startsWith(prefix)) continue;
    editor.forget();
    editors.delete(key);
  }
}
