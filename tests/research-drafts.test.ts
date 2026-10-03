import assert from "node:assert/strict";
import test from "node:test";
import { createResearchEditor, readResearchForExport, researchDraftKey } from "../app/lib/research-drafts.ts";
import { readResearchNotebook, researchNotebookKey, writeResearchNotebook, type ResearchNotebookData, type ResearchNotebookLockManager } from "../app/lib/research-notebook.ts";

const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sample: ResearchNotebookData = { version: 1, notes: "Discuss aid", checked: ["cost"], listRole: "target" };
function memory() {
  const records = new Map<string, string>();
  return { records, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
}
function serialLocks(): ResearchNotebookLockManager {
  const tails = new Map<string, Promise<unknown>>();
  return { request(name, _options, task) {
    const work = (tails.get(name) ?? Promise.resolve()).then(task);
    tails.set(name, work.catch(() => undefined));
    return work;
  } };
}

test("draft journals recover all fields after controller and route destruction without changing saved v1 data", () => {
  const storage = memory(); const drafts = memory(); const locks = serialLocks();
  const first = createResearchEditor(accountA, 101, storage, drafts, locks);
  first.update(sample);
  assert.equal(storage.records.size, 0);
  assert.equal(first.getSnapshot().dirty, true);
  const afterNavigationAndReload = createResearchEditor(accountA, 101, storage, drafts, locks);
  assert.deepEqual(afterNavigationAndReload.getSnapshot().draft, sample);
  assert.equal(afterNavigationAndReload.getSnapshot().draftStatus, "ready");
  assert.equal(createResearchEditor(accountB, 101, storage, drafts, locks).getSnapshot().draft.notes, "");
  assert.equal(createResearchEditor("guest", 101, storage, drafts, locks).getSnapshot().draft.notes, "");
  assert.equal(createResearchEditor(accountA, 202, storage, drafts, locks).getSnapshot().draft.notes, "");
});

test("simultaneous stale writes serialize revision check with commit and only one succeeds", async () => {
  const storage = memory(); const locks = serialLocks();
  const results = await Promise.all([
    writeResearchNotebook(accountA, 101, sample, null, storage, locks),
    writeResearchNotebook(accountA, 101, { ...sample, notes: "Another tab" }, null, storage, locks),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["conflict", "saved"]);
  assert.equal(readResearchNotebook(accountA, 101, storage).data.notes, sample.notes);
});

test("save without cross-tab locks is explicitly unsupported and never writes", async () => {
  const storage = memory(); const editor = createResearchEditor("guest", 101, storage, memory(), null);
  editor.update(sample);
  assert.equal((await editor.save()).status, "unsupported");
  assert.equal(storage.records.size, 0);
  assert.deepEqual(editor.getSnapshot().draft, sample);
});

test("verification changes while waiting for lock abort writes while retaining scoped draft", async () => {
  const storage = memory(); const drafts = memory(); const locks = serialLocks();
  let release: () => void = () => {};
  const held = locks.request(`college-search:research:${accountA}`, { mode: "exclusive" }, () => new Promise<void>((resolve) => { release = resolve; }));
  await Promise.resolve();
  let verified = true;
  const editor = createResearchEditor(accountA, 101, storage, drafts, locks);
  editor.update(sample);
  const saving = editor.save(() => verified);
  verified = false; release(); await held;
  assert.equal((await saving).status, "blocked");
  assert.equal(storage.records.size, 0);
  assert.deepEqual(createResearchEditor(accountA, 101, storage, drafts, locks).getSnapshot().draft, sample);
});

test("edits typed while a save is waiting are retained and rebased for the next save", async () => {
  const storage = memory(); const drafts = memory(); const locks = serialLocks();
  const editor = createResearchEditor("guest", 101, storage, drafts, locks);
  editor.update(sample);
  const saving = editor.save();
  editor.update({ ...sample, notes: "Even newer edits" });
  assert.equal((await saving).status, "saved");
  assert.equal(editor.getSnapshot().dirty, true);
  assert.equal(editor.getSnapshot().draft.notes, "Even newer edits");
  assert.equal((await editor.save()).status, "saved");
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, "Even newer edits");
  assert.equal(drafts.records.size, 0);
});

test("another tab's commit preserves dirty local edits and explicit replacement is conflict checked", async () => {
  const storage = memory(); const locks = serialLocks(); const drafts = memory();
  const editor = createResearchEditor("guest", 101, storage, drafts, locks);
  editor.update(sample);
  await writeResearchNotebook("guest", 101, { ...sample, notes: "Other writer" }, null, storage, locks);
  editor.refresh();
  assert.equal(editor.getSnapshot().feedback, "conflict");
  assert.equal(editor.getSnapshot().draft.notes, sample.notes);
  assert.equal((await editor.save()).status, "conflict");
  assert.equal((await editor.replaceWithDraft(editor.reviewLatest().revision)).status, "saved");
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, sample.notes);
});

test("clear removes notes, checks, category and recoverable draft; another tab's unreviewed save survives", async () => {
  const storage = memory(); const drafts = memory(); const locks = serialLocks();
  const editor = createResearchEditor("guest", 101, storage, drafts, locks);
  editor.update(sample); await editor.save();
  editor.update({ ...sample, notes: "New draft" });
  assert.equal((await editor.clear()).status, "saved");
  assert.deepEqual(readResearchNotebook("guest", 101, storage).data, { version: 1, notes: "", checked: [] });
  assert.equal(drafts.records.size, 0);
  assert.equal(storage.records.size, 0, "clear removes the record so an add-only backup can be restored");
  const stale = createResearchEditor("guest", 101, storage, drafts, locks);
  await writeResearchNotebook("guest", 101, sample, stale.getSnapshot().revision, storage, locks);
  assert.equal((await stale.clear()).status, "conflict");
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, sample.notes);
});

test("corrupt or full draft storage is visible and never silently replaces recoverable bytes", () => {
  const storage = memory(); const drafts = memory(); const key = researchDraftKey("guest", 101)!;
  drafts.setItem(key, "corrupt recovery bytes");
  const editor = createResearchEditor("guest", 101, storage, drafts, serialLocks());
  editor.update(sample);
  assert.equal(editor.getSnapshot().draftStatus, "invalid");
  assert.equal(drafts.getItem(key), "corrupt recovery bytes");
  const full = createResearchEditor("guest", 202, storage, { ...memory(), setItem() { throw new Error("QuotaExceededError"); } }, serialLocks());
  full.update(sample);
  assert.equal(full.getSnapshot().draftStatus, "unavailable");
  assert.deepEqual(full.getSnapshot().draft, sample);
});

test("existing v1 saved records recover without mutation and dirty journal detects changes during reload", async () => {
  const storage = memory(); const drafts = memory(); const locks = serialLocks();
  storage.setItem(researchNotebookKey("guest", 101)!, JSON.stringify(sample));
  const editor = createResearchEditor("guest", 101, storage, drafts, locks);
  assert.deepEqual(editor.getSnapshot().draft, sample);
  editor.update({ ...sample, notes: "Draft across reload" });
  await writeResearchNotebook("guest", 101, { ...sample, notes: "Cross-tab save" }, editor.getSnapshot().revision, storage, locks);
  const reloaded = createResearchEditor("guest", 101, storage, drafts, locks);
  assert.equal(reloaded.getSnapshot().feedback, "conflict");
  assert.equal(reloaded.getSnapshot().draft.notes, "Draft across reload");
});

test("exports include the latest uncommitted notes, checks, and category; conflicts block the whole export", async () => {
  const storage = memory(); const drafts = memory(); const locks = serialLocks();
  const editor = createResearchEditor("guest", 101, storage, drafts, locks);
  editor.update(sample); await editor.save();
  const latest: ResearchNotebookData = { ...sample, notes: "Newest draft text", checked: ["campus"], listRole: "likely" };
  editor.update(latest);
  const result = readResearchForExport("guest", [101], () => editor);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.notebooks[101], latest);
  assert.equal(result.draftCount, 1);
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, sample.notes);
  await writeResearchNotebook("guest", 101, { ...sample, notes: "Another tab's change" }, editor.getSnapshot().revision, storage, locks);
  assert.equal(readResearchForExport("guest", [101], () => editor).status, "blocked");
});

test("explicit draft replacement cannot overwrite a copy changed since the student reviewed it", async () => {
  const storage = memory(); const drafts = memory(); const locks = serialLocks();
  const editor = createResearchEditor("guest", 101, storage, drafts, locks);
  editor.update(sample);
  await writeResearchNotebook("guest", 101, { ...sample, notes: "Reviewed copy" }, null, storage, locks);
  const reviewed = editor.reviewLatest();
  await writeResearchNotebook("guest", 101, { ...sample, notes: "Unreviewed newer copy" }, reviewed.revision, storage, locks);
  assert.equal((await editor.replaceWithDraft(reviewed.revision)).status, "conflict");
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, "Unreviewed newer copy");
  assert.equal(editor.getSnapshot().draft.notes, sample.notes);
});
