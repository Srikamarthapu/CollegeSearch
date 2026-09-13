"use client";

import { BookOpen, Check, ChevronDown, Save } from "lucide-react";
import { type FormEvent, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import {
  RESEARCH_CHECKLIST,
  RESEARCH_NOTE_MAX_LENGTH,
  STUDENT_LIST_ROLES,
  deriveResearchNotebookScope,
  type ResearchCheckId,
  type StudentListRole,
} from "@/app/lib/research-notebook";
import { getResearchEditor } from "@/app/lib/research-drafts";
import styles from "./ResearchNotebook.module.css";

type ResearchNotebookProps = {
  unitId: number;
  collegeName: string;
  expanded?: boolean;
};

const subscribeToClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Visibility follows verified identity; each owner keeps a separate recoverable draft. */
export function ResearchNotebook(props: ResearchNotebookProps) {
  const { scopeKey, hydrated, canMutate } = useSavedColleges();
  const clientReady = useSyncExternalStore(
    subscribeToClient,
    clientSnapshot,
    serverSnapshot,
  );
  const [lastVerifiedScope, setLastVerifiedScope] = useState<string | null>(null);
  const scope = deriveResearchNotebookScope(lastVerifiedScope, {
    scopeKey,
    unitId: props.unitId,
    clientReady,
    hydrated,
    canMutate,
  });
  if (scope.retainedScope !== lastVerifiedScope) {
    // Conditional render-time adjustment keeps the new owner's key current
    // before children render; an effect would commit the previous owner's UI.
    setLastVerifiedScope(scope.retainedScope);
  }

  return (
    <>
      {!scope.canEdit ? (
        <div className={styles.pending} role="status">
          <BookOpen size={17} aria-hidden="true" />
          <span>
            {scope.editorKey
              ? "Research is paused while your saved list reconnects. Your draft will return when the same account is ready."
              : "Your research notebook will be available when your saved list is ready."}
          </span>
        </div>
      ) : null}
      <div hidden={!scope.canEdit} inert={!scope.canEdit}>
        {scope.editorKey && scope.retainedScope ? (
          <ScopedResearchNotebook
            key={scope.editorKey}
            {...props}
            scopeKey={scope.retainedScope}
            canEdit={scope.canEdit}
          />
        ) : null}
      </div>
    </>
  );
}

function ScopedResearchNotebook({
  unitId,
  collegeName,
  expanded = false,
  scopeKey,
  canEdit,
}: ResearchNotebookProps & { scopeKey: string; canEdit: boolean }) {
  const id = useId();
  const [downloadStatus, setDownloadStatus] = useState("");
  const [controller] = useState(() => getResearchEditor(scopeKey, unitId));
  const editor = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const permitted = useRef(canEdit);
  useLayoutEffect(() => {
    permitted.current = canEdit;
    return () => { permitted.current = false; };
  }, [canEdit]);
  useEffect(() => { if (canEdit) controller.refresh(); }, [canEdit, controller]);
  const dirty = editor.dirty;
  const conflict = editor.feedback === "conflict";
  const latest = conflict ? controller.reviewLatest() : null;

  function toggleCheck(checkId: ResearchCheckId) {
    if (!canEdit) return;
    controller.update({
      ...editor.draft,
      checked: editor.draft.checked.includes(checkId)
        ? editor.draft.checked.filter((item) => item !== checkId)
        : [...editor.draft.checked, checkId],
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canEdit) void controller.save(() => permitted.current);
  }

  return (
    <details
      className={`${styles.notebook} ${expanded ? styles.expanded : ""}`}
      open={expanded || undefined}
    >
      <summary className={styles.summary}>
        <span className={styles.title}>
          <BookOpen size={18} aria-hidden="true" />
          Your research
          <span className={styles.srOnly}>for {collegeName}</span>
        </span>
        <span className={styles.progress}>
          {editor.draft.listRole ? <span>{STUDENT_LIST_ROLES.find((role) => role.value === editor.draft.listRole)?.label} · </span> : null}
          {editor.draft.checked.length} / 4 checked
          <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
        </span>
      </summary>

      <form onSubmit={save} className={styles.body} aria-label={`Research notebook for ${collegeName}`}>
        <p className={styles.intro}>A place for your questions, first impressions, and next steps.</p>

        <div className={styles.listRole}>
          <label htmlFor={`${id}-role`}>My list category <span>Set by you</span></label>
          <select
            id={`${id}-role`}
            value={editor.draft.listRole ?? ""}
            disabled={!canEdit}
            aria-describedby={`${id}-role-help`}
            onChange={(event) => {
              if (!canEdit) return;
              const value = event.target.value as StudentListRole | "";
              controller.update({ ...editor.draft, listRole: value || undefined });
            }}
          >
            <option value="">Not assessed yet</option>
            {STUDENT_LIST_ROLES.map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}
          </select>
          <p id={`${id}-role-help`}>Your planning label, not an admission estimate. Review it with your counselor using current academic requirements and affordability. A “safety” label never guarantees admission.</p>
        </div>

        <div className={styles.workarea}>
          <fieldset className={styles.checklist} disabled={!canEdit}>
            <legend>Things to check</legend>
            {RESEARCH_CHECKLIST.map((item) => (
              <label key={item.id} className={styles.check}>
                <input
                  type="checkbox"
                  checked={editor.draft.checked.includes(item.id)}
                  onChange={() => toggleCheck(item.id)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </fieldset>

          <div className={styles.notes}>
            <label htmlFor={`${id}-notes`}>Your notes</label>
            <textarea
              id={`${id}-notes`}
              value={editor.draft.notes}
              maxLength={RESEARCH_NOTE_MAX_LENGTH}
              disabled={!canEdit}
              rows={5}
              placeholder="What stands out? What do you want to ask a student or an admissions adviser?"
              aria-describedby={`${id}-count ${id}-storage`}
              onChange={(event) => {
                if (!canEdit) return;
                const notes = event.target.value;
                controller.update({ ...editor.draft, notes });
              }}
            />
            <span id={`${id}-count`} className={styles.count}>
              {editor.draft.notes.length.toLocaleString()} / 2,000 characters
            </span>
          </div>
        </div>

        <p id={`${id}-storage`} className={styles.storage}>
          {scopeKey === "guest"
            ? "Saved only in this browser. Guest research stays separate from account research."
            : "Saved only in this browser for this account. Research does not sync across devices."}
          {" "}Drafts stay in this tab through navigation and reload. Save research before closing the tab. Removing a college keeps its notebook.
        </p>

        {editor.status === "invalid" || editor.draftStatus === "invalid" ? (
          <div className={styles.warning} role="status">
            <p>A saved or draft notebook could not be read. The original copy is intact. Copy any visible notes before using Clear all research to start again.</p>
            {editor.status === "ready" && editor.draftStatus === "invalid" ? <button type="button" className={styles.reload} disabled={!canEdit} onClick={() => {
              if (canEdit && window.confirm("Discard the unreadable draft and load the saved notebook?")) controller.discardDraft();
            }}>Discard unreadable draft</button> : null}
          </div>
        ) : null}
        {editor.status === "unavailable" || editor.draftStatus === "unavailable" || editor.feedback === "unavailable" ? (
          <p className={styles.warning} role="status">
            Browser storage is unavailable or full. Your visible edits remain in this tab while you navigate. Use Download this draft or copy the notes before reloading or closing it. Try Save research again after freeing storage.
          </p>
        ) : null}
        {editor.feedback === "unsupported" ? <p className={styles.warning} role="status">This browser cannot safely coordinate research saves across tabs. Your draft is retained in this tab; export it or use a current browser to save it.</p> : null}
        {editor.feedback === "blocked" ? <p className={styles.warning} role="status">Saving paused because your session changed. Your draft is retained for this account. Try again when the account is verified.</p> : null}
        {conflict ? (
          <div className={styles.warning} role="status">
            <p>Another tab saved a different copy. Your draft is retained. Review the saved copy before choosing which to keep; export waits until this is resolved.</p>
            {latest?.status === "ready" ? <details><summary>Review the other tab’s saved copy</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{latest.data.notes || "No notes"}</p><p>Category: {latest.data.listRole ?? "Not assessed"}. Checks: {latest.data.checked.join(", ") || "None"}.</p></details> : null}
            <button type="button" className={styles.reload} disabled={!canEdit || editor.saving} onClick={() => {
              if (canEdit && window.confirm("Discard your draft and load the other tab’s saved copy?")) controller.discardDraft();
            }}>Discard my draft &amp; load saved copy</button>
            {latest?.status === "ready" ? <button type="button" className={styles.reload} disabled={!canEdit || editor.saving} onClick={() => {
              if (canEdit && window.confirm("Replace the saved notebook with your visible draft? This replaces its notes, checks, and list category.")) void controller.replaceWithDraft(latest.revision, () => permitted.current);
            }}>Replace saved copy with my draft</button> : null}
          </div>
        ) : null}

        <div className={styles.footer}>
          <button
            type="submit"
            className={styles.save}
            disabled={!canEdit || editor.saving || conflict || editor.status === "invalid" || editor.draftStatus === "invalid" || !dirty}
          >
            <Save size={15} aria-hidden="true" />
            {editor.saving ? "Saving…" : "Save research"}
          </button>
          <button type="button" className={styles.reload} disabled={!canEdit || editor.saving} onClick={() => {
            if (canEdit && window.confirm(`Clear all research for ${collegeName}? This removes the notes, checklist, and list category in this tab and the saved browser copy.`)) void controller.clear(() => permitted.current);
          }}>Clear all research</button>
          <button type="button" className={styles.reload} disabled={!canEdit} onClick={() => {
            if (!canEdit) return;
            try {
              const content = JSON.stringify({ format: "collegesearch-research", version: 1, exportedAt: new Date().toISOString(), notebooks: [{ unitId, collegeName, data: editor.draft }] }, null, 2);
              const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = `college-research-${unitId}.json`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              setDownloadStatus("A copy of the visible draft was downloaded.");
            } catch { setDownloadStatus("The draft could not be downloaded. Copy the notes before closing this tab."); }
          }}>Download this draft</button>
          <span className={styles.status} role="status">
            {dirty ? (editor.draftStatus === "ready" ? "Draft kept in this tab" : "Draft only in memory") : editor.feedback === "saved" ? (
              <><Check size={15} aria-hidden="true" /> Saved in this browser</>
            ) : ""}
          </span>
        </div>
        {downloadStatus ? <p className={styles.storage} role="status">{downloadStatus}</p> : null}
      </form>
    </details>
  );
}
