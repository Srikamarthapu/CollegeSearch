import assert from "node:assert/strict";
import test from "node:test";
import {
  DEADLINE_BACKUP_MAX_BYTES, DEADLINE_LIMIT, commitDeadlineEditor, deadlineBackup, deadlineEditorKey,
  deadlineGroups, deadlinePlanKey, deadlinePlanLockName, deriveDeadlineScope,
  editorForDeadline, emptyDeadlineEditor, emptyDeadlinePlan, formatCalendarDate,
  localCalendarDate, normalizedSourceUrl, parseDeadlineBackup, parseDeadlineEditor,
  parseDeadlinePlan, patchDeadlineEditor, validCalendarDate, validateDeadlineEditor,
  type DeadlineEntry,
} from "../app/lib/deadline-data.ts";
import { createDeadlinePlanStore, deadlinePlanDraftKey, readDeadlinePlan, type DeadlinePlanLockManager, type DeadlinePlanStorage } from "../app/lib/deadline-plan.ts";

const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const entryA = "11111111-1111-4111-8111-111111111111";
const entryB = "22222222-2222-4222-8222-222222222222";
const known = new Set([101, 202]);
const example: DeadlineEntry = { id: entryA, collegeId: 101, task: "application", title: "Regular decision", date: "2027-01-03", sourceUrl: "https://example.edu/apply?cycle=2027", sourceChecked: true, checkedOn: "2026-09-13", notes: "Check the time zone on the source page.", completed: false };
const plan = { version: 1 as const, entries: [example] };
function memory() {
  const records = new Map<string, string>();
  const storage: DeadlinePlanStorage = { getItem: (key) => records.get(key) ?? null, setItem: (key, value) => { records.set(key, value); }, removeItem: (key) => { records.delete(key); } };
  return { records, storage };
}
function serialLocks(): DeadlinePlanLockManager {
  const chains = new Map<string, Promise<unknown>>();
  return { request: (name, _options, task) => { const next = (chains.get(name) ?? Promise.resolve()).then(task); chains.set(name, next.catch(() => undefined)); return next; } };
}
const locks = serialLocks();
function makeStore(storage = memory().storage, journal = memory().storage, allowed: (scope: string) => boolean = () => true, lockManager: DeadlinePlanLockManager | null = locks) {
  const store = createDeadlinePlanStore(known, () => storage, () => journal, () => lockManager, allowed);
  store.activate("guest"); return store;
}

test("calendar validation handles leap years, month lengths, and date-only values", () => {
  for (const value of ["2024-02-29", "2000-02-29", "2026-09-13", "9999-12-31"]) assert.equal(validCalendarDate(value), true);
  for (const value of ["2026-02-29", "1900-02-29", "2100-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-1-01", "2026-01-01T00:00:00Z", "", "NaN"]) assert.equal(validCalendarDate(value), false);
});
test("local today and date display do not shift an entered date through timezone conversion", () => {
  assert.equal(localCalendarDate(new Date(2026, 8, 13, 0, 3)), "2026-09-13");
  assert.equal(formatCalendarDate("2027-01-03", "en-US"), "Jan 3, 2027");
  assert.equal(formatCalendarDate("2024-02-29", "en-US"), "Feb 29, 2024");
  assert.equal(formatCalendarDate("2026-02-29"), "Date not set");
  assert.equal(parseDeadlinePlan(JSON.stringify(plan), known)?.entries[0].date, "2027-01-03");
});
test("upcoming, past, and completed are derived from today's local calendar date", () => {
  const groups = deadlineGroups({ version: 1, entries: [
    { ...example, date: "2026-09-12" }, { ...example, id: entryB, date: "2026-09-13" },
    { ...example, id: accountA, date: "2026-09-14" }, { ...example, id: accountB, date: "2026-09-11", completed: true },
  ] }, "2026-09-13");
  assert.deepEqual(groups.upcoming.map((entry) => entry.date), ["2026-09-13", "2026-09-14"]);
  assert.deepEqual(groups.past.map((entry) => entry.date), ["2026-09-12"]);
  assert.equal(groups.completed[0].completed, true);
});
test("source URLs reject script schemes, embedded credentials, and controls without claiming a source is official", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "https://user:pass@example.edu", "example.edu/apply", "https://example.edu/\npath"]) assert.equal(normalizedSourceUrl(value), null);
  assert.equal(normalizedSourceUrl(""), "");
  assert.equal(normalizedSourceUrl(" https://example.edu/apply "), "https://example.edu/apply");
  assert.equal(normalizedSourceUrl("http://example.edu"), "http://example.edu/");
});
test("new forms never invent a date, source, cycle, or confirmation", () => {
  const blank = emptyDeadlineEditor();
  assert.equal(blank.date, ""); assert.equal(blank.sourceUrl, ""); assert.equal(blank.sourceChecked, false);
  assert.ok(validateDeadlineEditor(blank, known).date);
  assert.ok(validateDeadlineEditor(blank, known).collegeId);
  const form = { ...blank, collegeId: "101", date: "2026-10-12", sourceChecked: true };
  assert.ok(validateDeadlineEditor(form, known).sourceChecked);
  assert.deepEqual(validateDeadlineEditor({ ...form, sourceChecked: false }, known), {});
});
test("material edits reset student confirmation, and notes do not create a new checked-on date", () => {
  const editor = editorForDeadline(example);
  for (const patch of [{ collegeId: "202" }, { task: "visit" as const }, { title: "Early action" }, { date: "2027-01-04" }, { sourceUrl: "https://example.edu/aid" }]) assert.equal(patchDeadlineEditor(editor, patch).sourceChecked, false);
  const notesOnly = patchDeadlineEditor(editor, { notes: "New note" });
  assert.equal(notesOnly.sourceChecked, true);
  const result = commitDeadlineEditor(plan, notesOnly, known, "2026-09-20", entryB);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.entry.checkedOn, "2026-09-13");
});
test("add/edit preserve completion, and stale edit forms do not overwrite changed tasks", () => {
  const editor = { ...emptyDeadlineEditor(), collegeId: "101", task: "visit" as const, date: "2026-10-15" };
  const added = commitDeadlineEditor(emptyDeadlinePlan(), editor, known, "2026-09-13", entryA);
  assert.equal(added.ok, true);
  if (!added.ok) return;
  const completedPlan = { version: 1 as const, entries: [{ ...added.entry, completed: true }] };
  const edit = patchDeadlineEditor(editorForDeadline(completedPlan.entries[0]), { date: "2026-10-16" });
  const changed = commitDeadlineEditor(completedPlan, edit, known, "2026-09-13", entryB);
  assert.equal(changed.ok && changed.entry.completed, true);
  const stale = commitDeadlineEditor({ version: 1, entries: [{ ...completedPlan.entries[0], notes: "Another tab" }] }, edit, known, "2026-09-13", entryB);
  assert.equal(stale.ok, false); if (!stale.ok) assert.ok(stale.errors.form);
});
test("parser validates known colleges, 100-task limit, duplicates, fields, and checked provenance", () => {
  assert.deepEqual(parseDeadlinePlan(JSON.stringify({ ...plan, accountId: accountA, email: "private" }), known), plan);
  for (const entry of [{ ...example, collegeId: 999 }, { ...example, sourceUrl: "javascript:x" }, { ...example, checkedOn: "" }, { ...example, sourceChecked: false }, { ...example, date: "2026-02-30" }, { ...example, notes: "x".repeat(501) }, { ...example, task: "automated-odds" }]) assert.equal(parseDeadlinePlan(JSON.stringify({ version: 1, entries: [entry] }), known), null);
  assert.equal(parseDeadlinePlan(JSON.stringify({ version: 1, entries: [example, example] }), known), null);
  assert.equal(parseDeadlinePlan(JSON.stringify({ version: 1, entries: Array(DEADLINE_LIMIT + 1).fill(example) }), known), null);
  assert.equal(parseDeadlinePlan("{broken", known), null);
});
test("portable backup round-trips user text and dates without account scope or executable formats", () => {
  const textPlan = { version: 1 as const, entries: [{ ...example, title: 'Task, "quoted"', notes: "<script>x</script>\n=1+1" }] };
  const backup = deadlineBackup(textPlan, "2026-09-13");
  assert.deepEqual(parseDeadlineBackup(backup, known), textPlan);
  assert.ok(!backup.includes(accountA)); assert.ok(!backup.includes("college-search-deadlines:v1"));
  assert.equal(parseDeadlineBackup(backup, new Set([202])), null);
  assert.equal(parseDeadlineBackup(JSON.stringify({ format: "wrong", version: 1, exportedOn: "2026-09-13", entries: [example] }), known), null);
  assert.equal(parseDeadlineBackup("x".repeat(DEADLINE_BACKUP_MAX_BYTES + 1), known), null);
});
test("a full 100-task tracker with bounded Unicode notes produces a restorable backup", () => {
  const full = { version: 1 as const, entries: Array.from({ length: DEADLINE_LIMIT }, (_, index) => ({ ...example, id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, title: "界".repeat(100), notes: "界".repeat(500) })) };
  assert.ok(parseDeadlinePlan(JSON.stringify(full), known));
  const backup = deadlineBackup(full, "2026-09-13");
  assert.ok(new TextEncoder().encode(backup).length < DEADLINE_BACKUP_MAX_BYTES);
  assert.deepEqual(parseDeadlineBackup(backup, known), full);
  const editor = { ...emptyDeadlineEditor(), collegeId: "101", date: "2026-10-15" };
  const added = commitDeadlineEditor(full, editor, known, "2026-09-13", entryB);
  assert.equal(added.ok, false);
});
test("scope gates never guess guest during verification or allow unverified identifiers", () => {
  const ready = { scopeKey: accountA, clientReady: true, hydrated: true, canMutate: true };
  assert.equal(deriveDeadlineScope(ready), accountA);
  for (const gate of ["clientReady", "hydrated", "canMutate"]) assert.equal(deriveDeadlineScope({ ...ready, [gate]: false }), null);
  for (const scopeKey of ["loading", "some@example.com", "account:123", "guest:101", ""]) {
    assert.equal(deadlinePlanKey(scopeKey), null); assert.equal(deriveDeadlineScope({ ...ready, scopeKey }), null);
  }
  assert.equal(deadlinePlanLockName(accountA), `college-search:deadlines:${accountA}`);
});
test("guest/account records and unfinished form drafts survive reload without crossing scopes", async () => {
  const local = memory().storage; const journal = memory().storage; const store = makeStore(local, journal);
  store.update("guest", plan); await store.flush("guest");
  const incomplete = { ...emptyDeadlineEditor(), collegeId: "101", date: "", notes: "Last keystroke before navigation" };
  store.updateEditor("guest", incomplete);
  const reloaded = makeStore(local, journal);
  assert.deepEqual(reloaded.get("guest").draft, plan);
  assert.deepEqual(reloaded.getEditor("guest").editor, incomplete);
  assert.equal(reloaded.get(accountA).draft.entries.length, 0);
  assert.equal(reloaded.getEditor(accountA).editor, null);
  store.activate(accountA); store.update(accountA, { version: 1, entries: [{ ...example, notes: "Account A" }] }); await store.flush(accountA);
  assert.equal(readDeadlinePlan("guest", known, local).draft.entries[0].notes, example.notes);
  assert.equal(readDeadlinePlan(accountA, known, local).draft.entries[0].notes, "Account A");
});
test("incomplete editor drafts are bounded and preserve invalid dates for correction", () => {
  const draft = { ...emptyDeadlineEditor(), date: "2026-02-30", sourceUrl: "not a URL yet" };
  assert.deepEqual(parseDeadlineEditor(JSON.stringify(draft)), draft);
  assert.equal(parseDeadlineEditor(JSON.stringify({ ...draft, notes: "x".repeat(501) })), null);
  assert.equal(parseDeadlineEditor(JSON.stringify({ ...draft, sourceChecked: "yes" })), null);
});
test("collection edits are journaled before autosave and restore after an immediate reload", async () => {
  const local = memory().storage; const journal = memory().storage; const store = makeStore(local, journal);
  const staged = store.update("guest", plan);
  assert.equal(staged.draftPersisted, true); assert.equal(staged.persisted, false);
  assert.equal(readDeadlinePlan("guest", known, local).draft.entries.length, 0);
  const reloaded = makeStore(local, journal); assert.deepEqual(reloaded.get("guest").draft, plan);
  await reloaded.flush("guest"); assert.deepEqual(readDeadlinePlan("guest", known, local).draft, plan);
  assert.equal(journal.getItem(deadlinePlanDraftKey("guest")!), null);
});
test("simultaneous writers serialize and the losing tab retains a recoverable conflict draft", async () => {
  const local = memory().storage; const journalA = memory().storage; const journalB = memory().storage;
  const a = makeStore(local, journalA); const b = makeStore(local, journalB);
  a.update("guest", plan); b.update("guest", { version: 1, entries: [{ ...example, id: entryB, notes: "Tab B" }] });
  const results = await Promise.all([a.flush("guest"), b.flush("guest")]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["conflict", "ready"]);
  assert.equal(readDeadlinePlan("guest", known, local).draft.entries[0].id, entryA);
  assert.equal(makeStore(local, journalB).get("guest").draft.entries[0].id, entryB);
  assert.equal((await b.flush("guest")).status, "conflict");
  assert.equal((await b.flush("guest", true)).status, "ready");
  assert.equal(readDeadlinePlan("guest", known, local).draft.entries[0].id, entryB);
});

test("removing the final task is a durable empty intent, even when another tab changes the list", async () => {
  const local = memory().storage; const journalA = memory().storage; const journalB = memory().storage;
  const a = makeStore(local, journalA); a.update("guest", plan); await a.flush("guest");
  const b = makeStore(local, journalB); b.get("guest");
  a.update("guest", emptyDeadlinePlan());
  b.update("guest", { version: 1, entries: [{ ...example, notes: "Other tab's edit" }] }); await b.flush("guest");
  const conflict = a.reconcile("guest");
  assert.equal(conflict.status, "conflict"); assert.equal(conflict.draft.entries.length, 0);
  const reloaded = makeStore(local, journalA);
  assert.equal(reloaded.get("guest").status, "conflict"); assert.equal(reloaded.get("guest").draft.entries.length, 0);
  assert.equal((await a.flush("guest", true)).status, "ready");
  assert.equal(readDeadlinePlan("guest", known, local).draft.entries.length, 0);
});
test("account switches while waiting for a lock prevent stale writes and preserve old-owner drafts", async () => {
  const local = memory().storage; const journal = memory().storage; const serial = serialLocks(); const store = makeStore(local, journal, () => true, serial);
  let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; });
  const held = serial.request(deadlinePlanLockName(accountA)!, { mode: "exclusive" }, () => hold);
  store.activate(accountA); store.update(accountA, plan); const pending = store.flush(accountA);
  store.activate(accountB); release(); await held;
  assert.equal((await pending).status, "blocked"); assert.equal(readDeadlinePlan(accountA, known, local).draft.entries.length, 0);
  assert.equal(store.get(accountB).draft.entries.length, 0); assert.equal(store.get(accountA).draft.entries.length, 1);
});
test("confirmed deletion fences writes and clears only that owner's plan/form journals and cache", async () => {
  const local = memory().storage; const journal = memory().storage; const deleted = new Set<string>(); const store = makeStore(local, journal, (scope) => !deleted.has(scope));
  store.update("guest", plan); await store.flush("guest"); store.updateEditor("guest", emptyDeadlineEditor());
  store.activate(accountA); store.update(accountA, plan); store.updateEditor(accountA, { ...emptyDeadlineEditor(), notes: "Private draft" });
  deleted.add(accountA); store.forget(accountA); store.activate(accountA);
  assert.equal(store.get(accountA).status, "blocked"); assert.equal(store.getEditor(accountA).editor, null);
  assert.equal(journal.getItem(deadlinePlanDraftKey(accountA)!), null); assert.equal(journal.getItem(deadlineEditorKey(accountA)!), null);
  assert.equal((await store.flush(accountA)).status, "blocked"); assert.equal(readDeadlinePlan(accountA, known, local).draft.entries.length, 0);
  assert.equal(store.get("guest").draft.entries.length, 1); assert.ok(store.getEditor("guest").editor);
});
test("unsupported locks and quota failures never pretend a shared save succeeded", async () => {
  const local = memory().storage; const journal = memory().storage; const store = makeStore(local, journal, () => true, null);
  store.update("guest", plan); const result = await store.flush("guest");
  assert.equal(result.status, "unsupported"); assert.equal(result.draftPersisted, true); assert.equal(result.persisted, false);
  assert.equal(readDeadlinePlan("guest", known, local).draft.entries.length, 0);
  const broken: DeadlinePlanStorage = { ...local, setItem: () => { throw new Error("Quota"); } };
  const failed = makeStore(broken, journal); failed.update("guest", plan); assert.equal((await failed.flush("guest")).status, "unavailable");
  assert.deepEqual(failed.get("guest").draft, plan);
});
test("a transient deletion-marker failure blocks access without deleting previously retained drafts", () => {
  const local = memory().storage; const journal = memory().storage; let allowed = true; const store = makeStore(local, journal, () => allowed);
  store.activate(accountA); store.update(accountA, plan); store.updateEditor(accountA, { ...emptyDeadlineEditor(), notes: "Retain me" });
  allowed = false;
  assert.equal(store.get(accountA).status, "blocked"); assert.equal(store.getEditor(accountA).editor, null);
  assert.ok(journal.getItem(deadlineEditorKey(accountA)!)); assert.ok(journal.getItem(deadlinePlanDraftKey(accountA)!));
  allowed = true; assert.equal(store.get(accountA).draft.entries.length, 1); assert.equal(store.getEditor(accountA).editor?.notes, "Retain me");
});
