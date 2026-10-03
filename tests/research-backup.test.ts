import assert from "node:assert/strict";
import test from "node:test";
import { parseResearchBackup, previewResearchRestore, restoreResearchBackup, type ResearchBackup } from "../app/lib/research-backup.ts";
import { readResearchNotebook, researchNotebookKey, type ResearchNotebookLockManager } from "../app/lib/research-notebook.ts";
const locks: ResearchNotebookLockManager = { request: async (_name, _options, task) => task() };
const entry = { unitId: 101, collegeName: "College", data: { version: 1 as const, notes: "Ask about aid", checked: ["cost" as const], listRole: "reach" as const } };
const backup: ResearchBackup = { format: "collegesearch-research", version: 1, exportedAt: "2026-09-13T00:00:00.000Z", notebooks: [entry] };
function memory() {
  const records = new Map<string, string>();
  return { records, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
}

test("backup parser round-trips every research field and rejects unsupported or ambiguous input", () => {
  assert.deepEqual(parseResearchBackup(JSON.stringify(backup)), backup);
  for (const input of [null, {}, { ...backup, version: 2 }, { ...backup, accountId: "secret" }, { ...backup, notebooks: [entry, entry] }, { ...backup, notebooks: [{ ...entry, data: { ...entry.data, probability: .8 } }] }, { ...backup, notebooks: [{ ...entry, data: { ...entry.data, notes: "x".repeat(2001) } }] }, { ...backup, notebooks: [{ ...entry, unitId: -1 }] }]) {
    assert.throws(() => parseResearchBackup(JSON.stringify(input)));
  }
  assert.throws(() => parseResearchBackup("x".repeat(2_000_001)));
});

test("preview identifies drafts, existing, unreadable and unavailable colleges without modifying storage", () => {
  const storage = memory();
  storage.setItem(researchNotebookKey("guest", 202)!, JSON.stringify(entry.data));
  storage.setItem(researchNotebookKey("guest", 303)!, "broken");
  const entries = [101, 202, 303, 404, 505].map((unitId) => ({ ...entry, unitId }));
  const before = [...storage.records];
  const preview = previewResearchRestore({ ...backup, notebooks: entries }, "guest", new Set([101, 202, 303, 404]), (id) => id === 404, storage);
  assert.deepEqual(preview.ready.map((item) => item.unitId), [101]);
  assert.deepEqual(preview.existing.map((item) => item.unitId), [202, 404]);
  assert.deepEqual(preview.unreadable.map((item) => item.unitId), [303]);
  assert.deepEqual(preview.unknown.map((item) => item.unitId), [505]);
  assert.deepEqual([...storage.records], before);
});

test("restore rechecks after preview, never overwrites any existing notes, and isolates owners", async () => {
  const storage = memory();
  const preview = previewResearchRestore(backup, "guest", new Set([101]), () => false, storage);
  storage.setItem(researchNotebookKey("guest", 101)!, JSON.stringify({ ...entry.data, notes: "Saved after preview" }));
  const result = await restoreResearchBackup(preview.ready, "guest", () => false, () => true, storage, locks);
  assert.deepEqual(result.skipped, [101]);
  assert.deepEqual(result.restored, []);
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, "Saved after preview");
  const account = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.deepEqual((await restoreResearchBackup(preview.ready, account, () => false, () => true, storage, locks)).restored, [101]);
  assert.equal(readResearchNotebook(account, 101, storage).data.notes, entry.data.notes);
});

test("restore reports completed entries exactly if storage fills partway through", async () => {
  const storage = memory();
  const flaky = { getItem: storage.getItem, setItem(key: string, value: string) { if (storage.records.size) throw new Error("QuotaExceededError"); storage.setItem(key, value); } };
  const result = await restoreResearchBackup([entry, { ...entry, unitId: 202 }], "guest", () => false, () => true, flaky, locks);
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.restored, [101]);
  assert.equal(storage.records.size, 1);
});

test("restore refuses unverified identities and unavailable coordination", async () => {
  const storage = memory();
  assert.equal((await restoreResearchBackup([entry], "loading", () => false, () => true, storage, locks)).status, "blocked");
  assert.equal((await restoreResearchBackup([entry], "guest", () => false, () => false, storage, locks)).status, "blocked");
  assert.equal((await restoreResearchBackup([entry], "guest", () => false, () => true, storage, null)).status, "unsupported");
  assert.equal(storage.records.size, 0);
});
