import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_ERASURE_PREFIX, accountErasureKey, browserKeyBelongsToAccount, eraseAccountBrowserData, getAccountErasureState, purgeAccountStorage, sweepRecordedAccountErasures, type AccountErasureLocks } from "../app/lib/account-browser-erasure.ts";
import { createResearchEditor, researchDraftKey } from "../app/lib/research-drafts.ts";
import { previewResearchRestore, restoreResearchBackup, type ResearchBackup } from "../app/lib/research-backup.ts";
import { researchNotebookKey } from "../app/lib/research-notebook.ts";

const account = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
function memory() {
  const data = new Map<string, string>();
  return { data, get length() { return data.size; }, key(index: number) { return [...data.keys()][index] ?? null; }, getItem(key: string) { return data.get(key) ?? null; }, setItem(key: string, value: string) { data.set(key, value); }, removeItem(key: string) { data.delete(key); } };
}
function serialLocks(): AccountErasureLocks {
  const tails = new Map<string, Promise<unknown>>();
  return { request(name, _options, task) { const work = (tails.get(name) ?? Promise.resolve()).then(task); tails.set(name, work.catch(() => undefined)); return work; } };
}
const immediateLocks: AccountErasureLocks = { request: async (_name, _options, task) => task() };

function accountKeys(id: string) {
  return [
    `college-search-saved-user-cache:${id}`,
    `college-search-saved-user-outbox:${id}`,
    `college-search-saved-user-outbox:${id}:9999999999`,
    `college-search-research:v1:${id}:101`,
    `college-search-research:v2:${id}:202`,
    `college-search-research-draft:v1:${id}:101`,
    `college-search-applicant:v1:${id}`,
    `college-search-applicant:v1:${id}:draft`,
    `college-search-deadlines:v1:${id}`,
    `college-search-deadlines:v1:${id}:draft`,
    `college-search-deadlines:v1:${id}:editor`,
  ];
}

test("account key matching uses complete scope delimiters and never erases guest or unrelated namespaces", () => {
  const id = account(1);
  for (const key of accountKeys(id)) assert.equal(browserKeyBelongsToAccount(key, id), true, key);
  for (const key of [...accountKeys(account(2)), ...accountKeys("guest"), "college-search-saved", "college-compass-saved", `unrelated:${id}`, `${ACCOUNT_ERASURE_PREFIX}${id}`, `college-search-applicant:v1:${id}0`, `college-search-saved-user-cache:${id}0`]) assert.equal(browserKeyBelongsToAccount(key, id), false, key);
});

test("purge snapshots storage indexes and removes every owned key including out-of-directory records", () => {
  const store = memory(); const id = account(3);
  for (const key of accountKeys(id)) store.setItem(key, "sensitive placeholder");
  for (const key of accountKeys("guest")) store.setItem(key, "guest kept");
  const result = purgeAccountStorage(id, store);
  assert.equal(result.removedCount, accountKeys(id).length);
  assert.deepEqual(result.failedKeys, []);
  assert.equal(store.length, accountKeys("guest").length);
});

test("successful erasure keeps other owners, marker and guest records and invalidates the captured account", async () => {
  const id = account(4); const other = account(5); const local = memory(); const session = memory();
  for (const key of [...accountKeys(id), ...accountKeys(other), ...accountKeys("guest")]) { local.setItem(key, "kept unless owned"); session.setItem(key, "kept unless owned"); }
  const forgotten: string[] = [];
  const result = await eraseAccountBrowserData(id, { localStorage: local, sessionStorage: session, locks: immediateLocks, forgetScope: (scope) => forgotten.push(scope), announce: () => {} });
  assert.equal(result.status, "complete");
  assert.deepEqual(forgotten, [id]);
  assert.equal(getAccountErasureState(id, local), "deleted");
  assert.equal(getAccountErasureState(other, local), "active");
  assert.equal(getAccountErasureState("guest", local), "active");
  for (const key of [...accountKeys(other), ...accountKeys("guest")]) assert.ok(local.getItem(key));
  for (const key of accountKeys(id)) { assert.equal(local.getItem(key), null); assert.equal(session.getItem(key), null); }
  assert.equal(local.getItem(accountErasureKey(id)!), "1");
});

test("blocked receipt storage reports partial cleanup instead of changing the server deletion result", async () => {
  const id = account(6); const local = memory(); const session = memory();
  local.setItem(accountKeys(id)[0], "target");
  const broken = { get length() { return local.length; }, key: local.key, getItem: local.getItem, removeItem: local.removeItem, setItem() { throw new Error("QuotaExceededError"); } };
  const result = await eraseAccountBrowserData(id, { localStorage: broken, sessionStorage: session, locks: immediateLocks, forgetScope() {}, announce() {} });
  assert.equal(result.status, "partial");
  assert.equal(result.markerPersisted, false);
  assert.equal(getAccountErasureState(id, local), "deleted", "current tab remains fenced in memory");
  assert.equal(local.length, 0);
});

test("storage read failure is unavailable, not fabricated evidence of deletion", () => {
  const store = memory();
  const broken = { get length() { return store.length; }, key: store.key, setItem: store.setItem, removeItem: store.removeItem, getItem() { throw new Error("SecurityError"); } };
  assert.equal(getAccountErasureState(account(7), broken), "unavailable");
  assert.equal(getAccountErasureState("guest", broken), "active");
  assert.equal(getAccountErasureState("loading", store), "invalid");
});

test("resumed tab erases its old session journals from the durable deletion marker without touching guest drafts", () => {
  const id = account(8); const local = memory(); const oldTabSession = memory();
  local.setItem(accountErasureKey(id)!, "1");
  for (const key of [...accountKeys(id), ...accountKeys("guest")]) oldTabSession.setItem(key, "old draft");
  const seen: string[] = [];
  const result = sweepRecordedAccountErasures((scope) => seen.push(scope), local, oldTabSession);
  assert.ok(seen.includes(id));
  assert.ok(result.find((item) => item.userId === id)?.memoryCleared);
  for (const key of accountKeys(id)) assert.equal(oldTabSession.getItem(key), null);
  for (const key of accountKeys("guest")) assert.equal(oldTabSession.getItem(key), "old draft");
});

test("cleanup fences immediately then drains an already running research write before final sweep", async () => {
  const id = account(9); const local = memory(); const session = memory(); const locks = serialLocks();
  let release: () => void = () => {};
  const held = locks.request(`college-search:research:${id}`, { mode: "exclusive" }, async () => { await new Promise<void>((resolve) => { release = resolve; }); local.setItem(researchNotebookKey(id, 101)!, "old pending writer"); });
  await Promise.resolve();
  const erasing = eraseAccountBrowserData(id, { localStorage: local, sessionStorage: session, locks, forgetScope() {}, announce() {} });
  assert.equal(getAccountErasureState(id, local), "deleted");
  release(); await held;
  assert.equal((await erasing).status, "complete");
  assert.equal(local.getItem(researchNotebookKey(id, 101)!), null);
});

test("confirmed notebook deletion prevents pending results or subsequent input from recreating memory or storage", async () => {
  const id = account(10); const local = memory(); const session = memory(); const locks = serialLocks();
  let allowed = true;
  let release: () => void = () => {};
  const held = locks.request(`college-search:research:${id}`, { mode: "exclusive" }, () => new Promise<void>((resolve) => { release = resolve; }));
  await Promise.resolve();
  const editor = createResearchEditor(id, 101, local, session, locks, () => allowed);
  editor.update({ version: 1, notes: "Erase this draft", checked: ["cost"], listRole: "target" });
  const saving = editor.save();
  allowed = false;
  editor.forget();
  release(); await held;
  assert.equal((await saving).status, "blocked");
  editor.update({ version: 1, notes: "Stale callback", checked: [] });
  editor.refresh();
  assert.equal(editor.getSnapshot().draft.notes, "");
  assert.equal(editor.getSnapshot().status, "blocked");
  assert.equal(session.getItem(researchDraftKey(id, 101)!), null);
  assert.equal(local.getItem(researchNotebookKey(id, 101)!), null);
});

test("temporarily paused initial notebook recovers a retained journal when writing is allowed again", () => {
  const id = account(11); const local = memory(); const session = memory();
  const original = createResearchEditor(id, 101, local, session, immediateLocks);
  original.update({ version: 1, notes: "Retained paused draft", checked: ["cost"] });
  let allowed = false;
  const paused = createResearchEditor(id, 101, local, session, immediateLocks, () => allowed);
  assert.equal(paused.getSnapshot().draft.notes, "");
  assert.equal(paused.getSnapshot().status, "blocked");
  allowed = true; paused.refresh();
  assert.equal(paused.getSnapshot().draft.notes, "Retained paused draft");
  assert.ok(session.getItem(researchDraftKey(id, 101)!));
});

test("invalid deletion targets never call callbacks or touch either storage", async () => {
  const local = memory(); const session = memory(); local.setItem("college-search-saved", "guest");
  for (const invalid of ["guest", "loading", "person@example.com", "", `${account(12)}:101`]) {
    const result = await eraseAccountBrowserData(invalid, { localStorage: local, sessionStorage: session, locks: immediateLocks, forgetScope() { throw new Error("Must not call"); } });
    assert.equal(result.status, "invalid");
  }
  assert.equal(local.length, 1);
});

test("a stale backup restore cannot recreate notebooks for a deleted account", async () => {
  const id = account(13); const local = memory(); const session = memory();
  const backup: ResearchBackup = { format: "collegesearch-research", version: 1, exportedAt: "2026-09-13T00:00:00.000Z", notebooks: [{ unitId: 101, collegeName: "College", data: { version: 1, notes: "Must not restore", checked: [] } }] };
  const preview = previewResearchRestore(backup, id, new Set([101]), () => false, local);
  await eraseAccountBrowserData(id, { localStorage: local, sessionStorage: session, locks: immediateLocks, forgetScope() {}, announce() {} });
  const result = await restoreResearchBackup(preview.ready, id, () => false, () => true, local, immediateLocks);
  assert.equal(result.status, "blocked");
  assert.equal(local.getItem(researchNotebookKey(id, 101)!), null);
  assert.throws(() => previewResearchRestore(backup, id, new Set([101]), () => false, local));
});
