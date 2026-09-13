"use client";

import { getAccountErasureState } from "@/app/lib/account-browser-erasure";
import styles from "./ResearchBackupControls.module.css";
import { useLayoutEffect, useRef, useState } from "react";
import type { ClientCollege } from "@/app/lib/college-client-record";
import { getResearchEditor, readResearchForExport } from "@/app/lib/research-drafts";
import { emptyResearchNotebook, researchNotebooksEqual } from "@/app/lib/research-notebook";
import { parseResearchBackup, previewResearchRestore, RESEARCH_BACKUP_MAX_BYTES, restoreResearchBackup, type ResearchBackup } from "@/app/lib/research-backup";

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ResearchBackupControls({ colleges, scopeKey, canUse: allowed }: { colleges: ClientCollege[]; scopeKey: string; canUse: boolean }) {
  const canUse = allowed && getAccountErasureState(scopeKey) === "active";
  const fileInput = useRef<HTMLInputElement>(null);
  const permission = useRef({ scopeKey, canUse });
  const [status, setStatus] = useState("");
  const [backup, setBackup] = useState<{ data: ResearchBackup; scope: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    permission.current = { scopeKey, canUse };
    return () => { permission.current = { scopeKey, canUse: false }; };
  }, [scopeKey, canUse]);
  const hasDraft = (unitId: number) => {
    const state = getResearchEditor(scopeKey, unitId).getSnapshot();
    return state.dirty || state.saving || state.draftStatus === "invalid";
  };
  const preview = canUse && backup?.scope === scopeKey
    ? previewResearchRestore(backup.data, scopeKey, new Set(colleges.map((college) => college.unitId)), hasDraft)
    : null;

  function exportBackup() {
    if (!canUse) return;
    try {
      const result = readResearchForExport(scopeKey, colleges.map((college) => college.unitId));
      if (result.status !== "ready") { setStatus("Resolve unreadable or conflicting research before making a complete backup."); return; }
      const data: ResearchBackup = {
        format: "collegesearch-research", version: 1, exportedAt: new Date().toISOString(),
        notebooks: colleges.filter((college) => !researchNotebooksEqual(result.notebooks[college.unitId], emptyResearchNotebook())).map((college) => ({ unitId: college.unitId, collegeName: college.name, data: result.notebooks[college.unitId] })),
      };
      download(JSON.stringify(data, null, 2), "my-college-research-backup.json");
      setStatus(`Backup downloaded: ${data.notebooks.length} notebooks, including ${result.draftCount} current-tab drafts. It includes research for removed colleges, and excludes the shortlist and account identifiers.`);
    } catch { setStatus("The backup could not be created. Your notebooks are unchanged."); }
  }

  async function restore() {
    if (!canUse || !preview || busy || !backup) return;
    const target = scopeKey;
    const entries = preview.ready;
    const isCurrent = () => permission.current.canUse && permission.current.scopeKey === target && getAccountErasureState(target) === "active";
    setBusy(true);
    try {
      const result = await restoreResearchBackup(entries, target, hasDraft, isCurrent);
      for (const unitId of result.restored) getResearchEditor(target, unitId).refresh();
      if (isCurrent()) {
        setStatus(`${result.restored.length} notebooks restored; ${result.skipped.length} newly changed notebooks skipped. ${result.status === "complete" ? "Existing research was kept. Open the college profiles to view restored notebooks; your shortlist is unchanged." : result.status === "unsupported" ? "This browser cannot safely coordinate restore across tabs. Use a current browser." : "Restore stopped because storage or account verification was unavailable. Completed notebooks are retained; retry the remaining entries."}`);
        setBackup(null);
      }
    } finally { setBusy(false); }
  }

  return (
    <section aria-label="Research backup and restore" className={styles.controls} hidden={!canUse} inert={!canUse}>
      <p>Your notes stay in this browser. Download a private backup to keep them if you change browsers or clear storage.</p>
      <div className={styles.actions}>
        <button type="button" className="page-secondary-action" onClick={exportBackup} disabled={!canUse || busy}>Download notebook backup</button>
        <button type="button" className="page-secondary-action" onClick={() => fileInput.current?.click()} disabled={!canUse || busy}>Restore notebook backup</button>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !canUse) return;
        const target = scopeKey;
        setBackup(null);
        try {
          if (file.size > RESEARCH_BACKUP_MAX_BYTES) throw new Error("Choose a backup smaller than 2 MB.");
          const data = parseResearchBackup(await file.text());
          if (!permission.current.canUse || permission.current.scopeKey !== target) return;
          setBackup({ data, scope: target });
          setStatus("");
        } catch (error) { if (permission.current.scopeKey === target) setStatus(error instanceof Error ? error.message : "The backup could not be read."); }
      }} />
      {preview ? <div className={styles.preview} role="region" aria-label="Backup restore preview">
        <p><strong>Review before restoring</strong> · {backup?.data.exportedAt.slice(0, 10)}</p>
        <p>Destination: {scopeKey === "guest" ? "guest research in this browser" : "the currently verified account’s research in this browser"}. Restore can copy a file you choose into this scope.</p>
        <p>{preview.ready.length} new notebooks can be added. {preview.existing.length} existing notebooks or drafts will be kept; {preview.unknown.length} colleges outside this directory will be skipped; {preview.unreadable.length} unreadable notebooks will be left untouched.</p>
        {preview.ready.length ? <ul>{preview.ready.map((entry) => <li key={entry.unitId}>{colleges.find((college) => college.unitId === entry.unitId)?.name} · {entry.data.notes.length} note characters · {entry.data.checked.length} checks · {entry.data.listRole ?? "no category"}</li>)}</ul> : null}
        <button type="button" className="page-secondary-action" disabled={!preview.ready.length || busy} onClick={() => void restore()}>{busy ? "Restoring…" : `Restore ${preview.ready.length} new notebooks`}</button>
        <button type="button" className="page-secondary-action" disabled={busy} onClick={() => setBackup(null)}>Cancel</button>
      </div> : null}
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}
