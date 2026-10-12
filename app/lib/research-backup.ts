import { getAccountErasureState } from "./account-browser-erasure.ts";
import {
  getResearchNotebookLockManager,
  getResearchNotebookStorage,
  normalizeResearchNotebookScope,
  parseResearchNotebook,
  readResearchNotebook,
  researchNotebookKey,
  researchNotebookLockName,
  type ResearchNotebookData,
  type ResearchNotebookLockManager,
  type ResearchNotebookStorage,
} from "./research-notebook.ts";

export const RESEARCH_BACKUP_MAX_BYTES = 2_000_000;
export type ResearchBackup = {
  format: "collegesearch-research";
  version: 1;
  exportedAt: string;
  notebooks: { unitId: number; collegeName: string; data: ResearchNotebookData }[];
};

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** No coercion, truncation, executable URLs, duplicate IDs, or unknown fields. */
export function parseResearchBackup(raw: string): ResearchBackup {
  if (new TextEncoder().encode(raw).length > RESEARCH_BACKUP_MAX_BYTES) throw new Error("Backup exceeds the 2 MB limit.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("This file is not valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Not a CollegeSearch research backup.");
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ["format", "version", "exportedAt", "notebooks"]) || record.format !== "collegesearch-research" || record.version !== 1 || typeof record.exportedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.exportedAt) || !Number.isFinite(Date.parse(record.exportedAt)) || !Array.isArray(record.notebooks) || record.notebooks.length > 1000) {
    throw new Error("This is not a supported CollegeSearch research backup.");
  }
  const seen = new Set<number>();
  const notebooks = record.notebooks.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("A notebook entry is invalid.");
    const entry = item as Record<string, unknown>;
    if (!exactKeys(entry, ["unitId", "collegeName", "data"]) || typeof entry.unitId !== "number" || !researchNotebookKey("guest", entry.unitId) || seen.has(entry.unitId) || typeof entry.collegeName !== "string" || !entry.collegeName.trim() || entry.collegeName.length > 300 || !entry.data || typeof entry.data !== "object" || Array.isArray(entry.data) || !exactKeys(entry.data as Record<string, unknown>, ["version", "notes", "checked", "listRole"])) {
      throw new Error("A notebook entry is invalid or duplicated. Nothing was imported.");
    }
    const data = parseResearchNotebook(JSON.stringify(entry.data));
    if (!data) throw new Error("A notebook has invalid notes, checklist, or category. Nothing was imported.");
    seen.add(entry.unitId);
    return { unitId: entry.unitId, collegeName: entry.collegeName, data };
  });
  return { format: "collegesearch-research", version: 1, exportedAt: record.exportedAt, notebooks };
}

export type ResearchRestorePreview = {
  ready: ResearchBackup["notebooks"];
  existing: ResearchBackup["notebooks"];
  unknown: ResearchBackup["notebooks"];
  unreadable: ResearchBackup["notebooks"];
};

export function previewResearchRestore(
  backup: ResearchBackup,
  scope: string,
  knownIds: ReadonlySet<number>,
  hasDraft: (unitId: number) => boolean,
  storage: ResearchNotebookStorage | null = getResearchNotebookStorage(),
): ResearchRestorePreview {
  if (!normalizeResearchNotebookScope(scope) || getAccountErasureState(scope, storage) !== "active") throw new Error("Wait for an active, verified account before restoring research.");
  const preview: ResearchRestorePreview = { ready: [], existing: [], unknown: [], unreadable: [] };
  for (const entry of backup.notebooks) {
    if (!knownIds.has(entry.unitId)) { preview.unknown.push(entry); continue; }
    const current = readResearchNotebook(scope, entry.unitId, storage);
    if (current.status !== "ready") preview.unreadable.push(entry);
    else if (current.revision !== null || hasDraft(entry.unitId)) preview.existing.push(entry);
    else preview.ready.push(entry);
  }
  return preview;
}

/** Add-only restore: a later edit in any cooperating tab is rechecked under the lock. */
export async function restoreResearchBackup(
  entries: ResearchBackup["notebooks"],
  scope: string,
  hasDraft: (unitId: number) => boolean,
  isCurrent: () => boolean,
  storage: ResearchNotebookStorage | null = getResearchNotebookStorage(),
  locks: ResearchNotebookLockManager | null = getResearchNotebookLockManager(),
) {
  const result = { status: "complete" as "complete" | "unavailable" | "unsupported" | "blocked", restored: [] as number[], skipped: [] as number[] };
  const lock = researchNotebookLockName(scope);
  if (!lock || !isCurrent()) return { ...result, status: "blocked" as const };
  if (!storage) return { ...result, status: "unavailable" as const };
  if (getAccountErasureState(scope, storage) !== "active") return { ...result, status: "blocked" as const };
  if (!locks) return { ...result, status: "unsupported" as const };
  try {
    await locks.request(lock, { mode: "exclusive" }, () => {
      for (const entry of entries) {
        if (!isCurrent() || getAccountErasureState(scope, storage) !== "active") { result.status = "blocked"; break; }
        const current = readResearchNotebook(scope, entry.unitId, storage);
        if (current.status !== "ready") { result.status = "unavailable"; break; }
        if (current.revision !== null || hasDraft(entry.unitId)) { result.skipped.push(entry.unitId); continue; }
        const key = researchNotebookKey(scope, entry.unitId);
        const data = parseResearchNotebook(JSON.stringify(entry.data));
        if (!key || !data) { result.status = "blocked"; break; }
        storage.setItem(key, JSON.stringify(data));
        result.restored.push(entry.unitId);
      }
    });
  } catch { result.status = "unavailable"; }
  return result;
}
