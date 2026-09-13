"use client";

import { CalendarDays, Download, Plus, Upload } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import { getAccountErasureState } from "@/app/lib/account-browser-erasure";
import {
  DEADLINE_BACKUP_MAX_BYTES, DEADLINE_LIMIT, DEADLINE_TASKS,
  commitDeadlineEditor, deadlineBackup, deadlineGroups, deadlinePlanKey,
  deadlineTitle, deriveDeadlineScope, editorForDeadline, emptyDeadlineEditor,
  formatCalendarDate, localCalendarDate, parseDeadlineBackup, patchDeadlineEditor,
  normalizedSourceUrl,
  type DeadlineEditor, type DeadlineEntry, type DeadlineErrors, type DeadlinePlan,
} from "@/app/lib/deadline-data";
import { createDeadlinePlanStore } from "@/app/lib/deadline-plan";
import styles from "./DeadlinePlanner.module.css";

export type DeadlineCollege = { unitId: number; name: string; deadlineSourceUrl?: string; admissionsSourceUrl?: string };
type PlannerStore = ReturnType<typeof createDeadlinePlanStore>;
const stores = new Map<string, PlannerStore>();
function storeFor(colleges: DeadlineCollege[]) {
  const ids = [...new Set(colleges.map((college) => college.unitId))].sort((a, b) => a - b);
  const key = ids.join(",");
  let store = stores.get(key);
  if (!store) {
    store = createDeadlinePlanStore(new Set(ids), undefined, undefined, undefined, (scope) => getAccountErasureState(scope) === "active");
    stores.set(key, store);
  }
  return store;
}
/** Wire this to the app's confirmed account-erasure callback/observer. */
export function forgetDeadlinePlannerScope(scope: string) { for (const store of stores.values()) store.forget(scope); }
const subscribeClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function DeadlinePlanner({ colleges }: { colleges: DeadlineCollege[] }) {
  const saved = useSavedColleges();
  const clientReady = useSyncExternalStore(subscribeClient, clientSnapshot, serverSnapshot);
  const scope = deriveDeadlineScope({ ...saved, clientReady });
  const [store] = useState(() => storeFor(colleges));
  useLayoutEffect(() => { store.activate(scope); return () => store.activate(null); }, [scope, store]);
  return scope ? <ScopedDeadlinePlanner key={scope} scope={scope} colleges={colleges} store={store} /> : <p className={styles.pending} role="status">Your date tracker is paused while your browser or account is verified. Its drafts stay separate for each owner.</p>;
}

function ScopedDeadlinePlanner({ scope, colleges, store }: { scope: string; colleges: DeadlineCollege[]; store: PlannerStore }) {
  const id = useId();
  const [snapshot, setSnapshot] = useState(() => store.reconcile(scope));
  const [form, setForm] = useState(() => store.getEditor(scope));
  const [errors, setErrors] = useState<DeadlineErrors>({});
  const [message, setMessage] = useState("");
  const [today, setToday] = useState(() => localCalendarDate());
  const [removeId, setRemoveId] = useState("");
  const [restore, setRestore] = useState<DeadlinePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const plannerRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const knownIds = new Set(colleges.map((college) => college.unitId));
  const selectedCollege = form.editor ? colleges.find((college) => college.unitId === Number(form.editor?.collegeId)) : undefined;
  const deadlineSource = normalizedSourceUrl(selectedCollege?.deadlineSourceUrl ?? "");
  const admissionsSource = normalizedSourceUrl(selectedCollege?.admissionsSourceUrl ?? "");
  const groups = deadlineGroups(snapshot.draft, today);
  const needsChoice = snapshot.status === "conflict" || snapshot.status === "invalid";

  // Only user-initiated transitions request focus; storage updates never move it.
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const target = document.getElementById(pendingFocus.current);
    pendingFocus.current = null;
    const fallback = document.getElementById(`${id}-heading`);
    if (!plannerRef.current) return;
    if (target && plannerRef.current.contains(target) && !target.matches(":disabled") && target.getClientRects().length) target.focus();
    if (document.activeElement !== target && fallback && plannerRef.current.contains(fallback)) fallback.focus();
  });
  function focusAfterUpdate(target: string) { pendingFocus.current = `${id}-${target}`; }
  function focusAfterAsync(target: "storage" | "restore-heading", origin: Element | null, removedTrigger?: HTMLButtonElement) {
    window.requestAnimationFrame(() => {
      if (!plannerRef.current || removedTrigger?.isConnected) return;
      const active = document.activeElement;
      const removedOrigin = origin && !origin.isConnected && active === document.body;
      if (active !== origin && !removedOrigin) return;
      const control = document.getElementById(`${id}-${target}`);
      if (control && plannerRef.current.contains(control) && !control.matches(":disabled") && !control.closest("details:not([open]), [hidden], [inert]") && control.getClientRects().length) control.focus();
    });
  }
  async function recoverList(action: "replace" | "reload" | "retry", trigger: HTMLButtonElement) {
    const focusOrigin = document.activeElement;
    if (action === "reload") setSnapshot(store.useSaved(scope));
    else await store.flush(scope, action === "replace");
    focusAfterAsync("storage", focusOrigin, trigger);
  }

  useEffect(() => {
    const unsubscribe = store.subscribe(() => { setSnapshot(store.get(scope)); setForm(store.getEditor(scope)); });
    if (store.get(scope).status === "saving") void store.flush(scope);
    const refresh = (event: StorageEvent) => { if (event.key === null || event.key === deadlinePlanKey(scope)) setSnapshot(store.reconcile(scope)); };
    window.addEventListener("storage", refresh);
    return () => { unsubscribe(); window.removeEventListener("storage", refresh); };
  }, [scope, store]);
  useEffect(() => {
    const refreshDate = () => setToday(localCalendarDate());
    const interval = window.setInterval(refreshDate, 60_000);
    document.addEventListener("visibilitychange", refreshDate);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refreshDate); };
  }, []);
  useEffect(() => {
    const hasUnprotectedForm = form.editor && !form.persisted;
    const hasUnprotectedPlan = !snapshot.persisted && !snapshot.draftPersisted && (snapshot.draft.entries.length > 0 || snapshot.revision !== null);
    if (!hasUnprotectedForm && !hasUnprotectedPlan) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [form, snapshot]);

  function openForm(editor: DeadlineEditor) {
    setForm(store.updateEditor(scope, editor)); setErrors({}); setMessage("");
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLSelectElement>("select")?.focus());
  }
  function patchForm(patch: Partial<DeadlineEditor>) {
    if (!form.editor) return;
    setForm(store.updateEditor(scope, patchDeadlineEditor(form.editor, patch)));
    setErrors({});
  }
  function updatePlan(plan: DeadlinePlan, replace = false) {
    const staged = store.update(scope, plan);
    setSnapshot(staged);
    void store.flush(scope, replace);
    return staged;
  }
  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.editor || busy) return;
    const result = commitDeadlineEditor(store.get(scope).draft, form.editor, knownIds, localCalendarDate(), crypto.randomUUID());
    if (!result.ok) { focusAfterUpdate("errors"); setErrors(result.errors); return; }
    const wasEditing = Boolean(form.editor.editingId);
    const staged = updatePlan(result.plan);
    // Retain an editing form until either the collection journal or canonical copy is durable.
    setForm(store.updateEditor(scope, editorForDeadline(result.entry)));
    if (staged.draftPersisted) {
      if (store.discardEditor(scope)) {
        focusAfterUpdate(result.entry.completed ? "completed" : `${result.entry.id}-edit`);
        setForm(store.getEditor(scope));
      }
    } else {
      const trigger = document.activeElement;
      setBusy(true);
      const saved = await store.flush(scope);
      setBusy(false);
      if (saved.persisted && store.discardEditor(scope)) {
        if (document.activeElement === trigger || document.activeElement === document.body) focusAfterUpdate(result.entry.completed ? "completed" : `${result.entry.id}-edit`);
        setForm(store.getEditor(scope));
      }
    }
    setErrors({}); setMessage(`Task ${wasEditing ? "updated in" : "added to"} your tracker. Review the storage status below for this browser’s saved copy.`);
  }
  function downloadBackup() {
    try {
      const url = URL.createObjectURL(new Blob([deadlineBackup(store.get(scope).draft, localCalendarDate())], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "collegesearch-deadlines.json";
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Backup download requested. It contains your current task list, including pending list changes. An unfinished add/edit form is separate; add it to the tracker before backing it up.");
    } catch { setMessage("The backup download could not start. Try again before leaving this tab."); }
  }
  async function readBackup(file?: File) {
    if (!file) return;
    if (file.size > DEADLINE_BACKUP_MAX_BYTES) { setMessage("That file is too large. Use a CollegeSearch deadline backup under 1 MB."); return; }
    const focusOrigin = document.activeElement;
    try {
      const restored = parseDeadlineBackup(await file.text(), knownIds);
      if (!restored) { setMessage("This backup could not be restored. It must contain at most 100 valid tasks for colleges in this directory, with valid dates and source links."); return; }
      setRestore(restored); setMessage(""); focusAfterAsync("restore-heading", focusOrigin);
    } catch { setMessage("The file could not be read. Your current tracker is unchanged."); }
  }
  const status = snapshot.status === "ready"
    ? snapshot.persisted ? "Saved only in this browser. Changes save automatically." : "No tasks saved yet. Dates you add stay in this browser."
    : snapshot.status === "saving" ? snapshot.draftPersisted ? "Saving the browser copy. A recovery draft is saved in this tab." : "Saving the browser copy. This tab could not save a recovery draft yet."
    : needsChoice ? "The browser copy changed or could not be read. Your current list draft is retained. Download a backup before choosing which copy to keep."
    : snapshot.draftPersisted ? "The shared browser copy could not be saved. A recovery copy survives reload in this tab; closing the tab may erase it. Download a backup to keep it."
    : "This browser cannot save or safely coordinate the tracker. Current list changes may be lost on reload. Download a backup to keep them.";

  function taskCard(entry: DeadlineEntry) {
    const collegeName = colleges.find((college) => college.unitId === entry.collegeId)?.name ?? "College outside this directory";
    const taskContext = `${deadlineTitle(entry)} at ${collegeName}, ${formatCalendarDate(entry.date)}`;
    return <li className={styles.card} key={entry.id}>
      <div className={styles.cardMain}>
        <span className={styles.college}>{collegeName}</span>
        <h4>{deadlineTitle(entry)}</h4>
        <p className={styles.date}><time dateTime={entry.date}>{formatCalendarDate(entry.date)}</time>{entry.date === today && !entry.completed ? <span>Today</span> : null}</p>
        <p className={styles.verification}>{entry.sourceChecked ? `Checked by you · ${formatCalendarDate(entry.checkedOn)}` : "Student-entered · source not checked"}</p>
        {entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">Open the source you entered<span className={styles.srOnly}> for {deadlineTitle(entry)} at {colleges.find((college) => college.unitId === entry.collegeId)?.name}</span></a> : null}
        {entry.notes ? <p className={styles.notes}>{entry.notes}</p> : null}
      </div>
      <div className={styles.cardActions}>
        <label><input id={`${id}-${entry.id}-completed`} type="checkbox" checked={entry.completed} disabled={busy} onChange={(event) => {
          focusAfterUpdate(event.target.checked ? "completed" : `${entry.id}-completed`);
          updatePlan({ version: 1, entries: store.get(scope).draft.entries.map((item) => item.id === entry.id ? { ...item, completed: event.target.checked } : item) });
        }} /><span>Completed<span className={styles.srOnly}> for {taskContext}</span></span></label>
        <button id={`${id}-${entry.id}-edit`} type="button" disabled={busy || Boolean(form.editor)} onClick={() => openForm(editorForDeadline(entry))}>Edit<span className={styles.srOnly}> {taskContext}</span></button>
        {removeId === entry.id ? <div className={styles.removeConfirm}><span>Remove this task?</span><button type="button" onClick={() => {
          focusAfterUpdate("heading");
          updatePlan({ version: 1, entries: store.get(scope).draft.entries.filter((item) => item.id !== entry.id) }); setRemoveId("");
        }}>Yes, remove<span className={styles.srOnly}> {taskContext}</span></button><button id={`${id}-${entry.id}-keep`} type="button" onClick={() => { focusAfterUpdate(`${entry.id}-remove`); setRemoveId(""); }}>Keep task<span className={styles.srOnly}> {taskContext}</span></button></div> : <button id={`${id}-${entry.id}-remove`} type="button" disabled={busy} onClick={() => { focusAfterUpdate(`${entry.id}-keep`); setRemoveId(entry.id); }}>Remove<span className={styles.srOnly}> {taskContext}</span></button>}
      </div>
    </li>;
  }

  if (snapshot.status === "blocked") return <p className={styles.pending} role="status">This tracker is paused while its account and browser storage are verified. Other users’ tasks stay hidden.</p>;

  return <section ref={plannerRef} className={styles.planner} aria-labelledby={`${id}-heading`}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}><CalendarDays size={16} aria-hidden="true" />Your next steps</span><h2 id={`${id}-heading`} tabIndex={-1}>Dates you want to keep in view.</h2><p>Add dates from the college’s official pages or your own plan. CollegeSearch does not supply or verify deadlines, cycles, cut-off times, or time zones.</p></div>
      <button id={`${id}-add`} className={styles.primary} type="button" disabled={Boolean(form.editor) || snapshot.draft.entries.length >= DEADLINE_LIMIT || busy} onClick={() => openForm(emptyDeadlineEditor())}><Plus size={17} aria-hidden="true" />Add a task</button>
    </header>
    <p id={`${id}-storage`} className={styles.storage} role="status" tabIndex={-1}>{status}</p>
    {needsChoice ? <div className={styles.actions}><button type="button" onClick={(event) => { void recoverList("replace", event.currentTarget); }}>Replace browser copy with this list</button><button type="button" onClick={(event) => { void recoverList("reload", event.currentTarget); }}>Discard list draft and reload browser copy</button></div> : ["unavailable", "unsupported"].includes(snapshot.status) ? <div className={styles.actions}><button type="button" onClick={(event) => { void recoverList("retry", event.currentTarget); }}>Retry saving list</button></div> : null}
    <p className={styles.scope}>{scope === "guest" ? "Guest tracker" : "Tracker for this verified account"} · Separate from other users · No account sync or reminder notifications</p>

    {form.editor ? <form ref={formRef} className={styles.form} onSubmit={submitForm} noValidate aria-label={form.editor.editingId ? "Edit a tracked date" : "Add a tracked date"}>
      <h3>{form.editor.editingId ? "Edit your task" : "Add a task and date"}</h3>
      <p className={styles.formStatus}>{form.persisted ? "Form draft saved in this tab; it survives reload. Add the task below to include it in your tracker and backups." : "Form draft is only in memory in this tab. Add the task before leaving, or copy the text somewhere you can keep it."}</p>
      {Object.keys(errors).length ? <div id={`${id}-errors`} tabIndex={-1} className={styles.errors} role="alert"><p>Review these details:</p><ul>{Object.values(errors).map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
      <fieldset disabled={busy} className={styles.formFields}>
        <label htmlFor={`${id}-college`}>College<select id={`${id}-college`} value={form.editor.collegeId} onChange={(event) => patchForm({ collegeId: event.target.value })} aria-invalid={Boolean(errors.collegeId)} required><option value="">Choose a college</option>{colleges.map((college) => <option key={college.unitId} value={college.unitId}>{college.name}</option>)}</select></label>
        <label htmlFor={`${id}-task`}>Task type<select id={`${id}-task`} value={form.editor.task} onChange={(event) => patchForm({ task: event.target.value as DeadlineEditor["task"] })}>{DEADLINE_TASKS.map((task) => <option key={task.value} value={task.value}>{task.label}</option>)}</select></label>
        <label htmlFor={`${id}-title`}>{form.editor.task === "custom" ? "Task name" : "Task name (optional)"}<input id={`${id}-title`} value={form.editor.title} maxLength={100} onChange={(event) => patchForm({ title: event.target.value })} aria-invalid={Boolean(errors.title)} placeholder={form.editor.task === "application" ? "For example, regular decision" : undefined} /></label>
        <label htmlFor={`${id}-date`}>Date from your source or plan<input type="date" id={`${id}-date`} value={form.editor.date} min="1900-01-01" max="9999-12-31" onChange={(event) => patchForm({ date: event.target.value })} aria-invalid={Boolean(errors.date)} required /></label>
        <label className={styles.wide} htmlFor={`${id}-source`}>Official source URL (optional)<input type="url" id={`${id}-source`} value={form.editor.sourceUrl} maxLength={1000} onChange={(event) => patchForm({ sourceUrl: event.target.value })} aria-invalid={Boolean(errors.sourceUrl)} placeholder="https://…" aria-describedby={`${id}-source-help`} /><span className={styles.help} id={`${id}-source-help`}>Use the college’s application or financial-aid page. Recheck the year, task type, exact cut-off time, and time zone there.</span></label>
        {deadlineSource || admissionsSource ? <div className={`${styles.sourceLinks} ${styles.wide}`}><span>College pages to start from</span>{deadlineSource ? <a href={deadlineSource} target="_blank" rel="noopener noreferrer">Open application dates</a> : null}{admissionsSource && admissionsSource !== deadlineSource ? <a href={admissionsSource} target="_blank" rel="noopener noreferrer">Open admissions requirements</a> : null}<p className={styles.help}>Confirm the date for your particular task and cycle, then enter the source above. Opening a page does not mark it checked.</p></div> : null}
        <label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={form.editor.sourceChecked} onChange={(event) => patchForm({ sourceChecked: event.target.checked })} aria-invalid={Boolean(errors.sourceChecked)} /><span>I checked this source for the correct application cycle and task type. <span className={styles.help}>This records your confirmation; it is not verification by CollegeSearch. Changing the college, task, date, or source resets this checkbox.</span></span></label>
        <label className={styles.wide} htmlFor={`${id}-notes`}>Notes (optional)<textarea id={`${id}-notes`} rows={3} value={form.editor.notes} maxLength={500} onChange={(event) => patchForm({ notes: event.target.value })} /><span className={styles.help}>Up to 500 characters. Include the cycle and any cut-off time you need to remember.</span></label>
      </fieldset>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Saving…" : form.editor.editingId ? "Update task" : "Add to tracker"}</button><button type="button" disabled={busy} onClick={() => { if (store.discardEditor(scope)) { focusAfterUpdate("add"); setForm(store.getEditor(scope)); setErrors({}); } else setMessage("This browser could not remove the form draft. It is still available."); }}>Discard form</button>{errors.form && form.editor.editingId ? <button type="button" onClick={() => patchForm({ editingId: "", baseEntry: "" })}>Keep form as a new task</button> : null}</div>
    </form> : null}

    {snapshot.draft.entries.length === 0 ? <div className={styles.empty}>Start with one date you want to remember. It can be an application step, an aid form, a recommendation request, or a visit.</div> : <div className={styles.groups}>
      {groups.upcoming.length ? <section aria-labelledby={`${id}-upcoming`}><h3 id={`${id}-upcoming`}>Upcoming and today <span>{groups.upcoming.length}</span></h3><ul className={styles.cards}>{groups.upcoming.map(taskCard)}</ul></section> : null}
      {groups.past.length ? <section aria-labelledby={`${id}-past`}><h3 id={`${id}-past`}>Past dates to review <span>{groups.past.length}</span></h3><p className={styles.help}>Check whether the task is complete or your plan has changed.</p><ul className={styles.cards}>{groups.past.map(taskCard)}</ul></section> : null}
      {groups.completed.length ? <details className={styles.completed}><summary id={`${id}-completed`}>Completed tasks · {groups.completed.length}</summary><ul className={styles.cards}>{groups.completed.map(taskCard)}</ul></details> : null}
    </div>}

    <footer className={styles.footer}>
      <p>{snapshot.draft.entries.length} / {DEADLINE_LIMIT} tasks. Dates are stored as calendar dates. Guest and account trackers never migrate automatically; a backup contains your task details and source links.</p>
      <div className={styles.actions}><button type="button" onClick={downloadBackup}><Download size={16} aria-hidden="true" />Download backup</button><button id={`${id}-restore`} type="button" onClick={() => fileRef.current?.click()}><Upload size={16} aria-hidden="true" />Restore backup</button><input ref={fileRef} className={styles.fileInput} type="file" accept=".json,application/json" aria-label="Choose a CollegeSearch deadline backup" onChange={(event) => { void readBackup(event.target.files?.[0]); event.target.value = ""; }} /></div>
    </footer>
    {restore ? <div className={styles.restore}>
      <h3 id={`${id}-restore-heading`} tabIndex={-1}>Review the backup before restoring</h3><p>This replaces this {scope === "guest" ? "guest" : "account"} tracker’s {snapshot.draft.entries.length} current tasks with the {restore.entries.length} tasks below. Download your current backup first if you want to keep both. An unfinished form remains separate.</p>
      <div className={styles.restoreList} data-lenis-prevent role="region" tabIndex={0} aria-labelledby={`${id}-restore-heading`}><ul>{restore.entries.map((entry) => <li key={entry.id}><strong>{colleges.find((college) => college.unitId === entry.collegeId)?.name}</strong> — {deadlineTitle(entry)} · {formatCalendarDate(entry.date)} · {entry.completed ? "completed" : "open"} · {entry.sourceChecked ? "checked by student" : "source not checked"}</li>)}</ul></div>
      <div className={styles.actions}><button type="button" className={styles.primary} onClick={() => { focusAfterUpdate("restore"); updatePlan(restore, true); setRestore(null); setMessage("Backup applied to your list draft. Check the browser storage status for confirmation that it saved."); }}>Replace tracker with this backup</button><button type="button" onClick={() => { focusAfterUpdate("restore"); setRestore(null); }}>Keep current tracker</button></div>
    </div> : null}
    <p className={styles.message} role="status">{message}</p>
  </section>;
}
