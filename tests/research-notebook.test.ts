import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_NOTE_MAX_LENGTH,
  deriveResearchNotebookScope,
  emptyResearchNotebook,
  parseResearchNotebook,
  readResearchNotebook,
  researchNotebookKey,
  researchNotebooksEqual,
  retainResearchCollection,
  writeResearchNotebook as atomicWriteResearchNotebook,
  type ResearchNotebookStorage,
} from "../app/lib/research-notebook.ts";

const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sample = { version: 1 as const, notes: "Ask about first-year advising.", checked: ["major" as const] };

test("student list roles preserve legacy notebooks and never accept inferred rating fields", async () => {
  assert.deepEqual(parseResearchNotebook(JSON.stringify(sample)), sample);
  const planned = { ...sample, listRole: "reach" as const };
  assert.deepEqual(parseResearchNotebook(JSON.stringify({ ...planned, probability: .8, aiGrade: "A" })), planned);
  assert.equal(parseResearchNotebook(JSON.stringify({ ...sample, listRole: "guaranteed" })), null);
  assert.equal(researchNotebooksEqual(sample, planned), false);
  assert.equal(researchNotebooksEqual(planned, { ...planned, listRole: "likely" }), false);
});

function memoryStorage() {
  const records = new Map<string, string>();
  const storage: ResearchNotebookStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
  };
  return { storage, records };
}

test("notebook records remain separate by college and verified account scope", async () => {
  const { storage, records } = memoryStorage();
  assert.equal((await writeResearchNotebook("guest", 101, sample, null, storage)).status, "saved");
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, sample.notes);
  assert.deepEqual(readResearchNotebook(accountA, 101, storage).data, emptyResearchNotebook());
  assert.deepEqual(readResearchNotebook(accountB, 101, storage).data, emptyResearchNotebook());
  assert.deepEqual(readResearchNotebook("guest", 202, storage).data, emptyResearchNotebook());
  assert.equal((await writeResearchNotebook(accountA, 101, { ...sample, notes: "Account A only" }, null, storage)).status, "saved");
  assert.equal(readResearchNotebook("guest", 101, storage).data.notes, sample.notes);
  assert.equal(readResearchNotebook(accountA, 101, storage).data.notes, "Account A only");
  assert.equal(records.size, 2);
});

test("loading, unverified, malformed, and unsafe college scopes never read or write storage", async () => {
  const storage: ResearchNotebookStorage = {
    getItem: () => { throw new Error("Must not reach storage"); },
    setItem: () => { throw new Error("Must not reach storage"); },
  };
  for (const scope of ["loading", "", "someone@example.com", "account:123", "guest:101", "null"]) {
    assert.equal(researchNotebookKey(scope, 101), null);
    assert.equal(readResearchNotebook(scope, 101, storage).status, "blocked");
    assert.equal((await writeResearchNotebook(scope, 101, sample, null, storage)).status, "blocked");
  }
  for (const unitId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(researchNotebookKey(accountA, unitId), null);
  }
  assert.equal(researchNotebookKey(accountA.toUpperCase(), 101), researchNotebookKey(accountA, 101));
});

test("parser rejects corrupt or unsupported data and projects known fields only", async () => {
  for (const raw of [
    "broken JSON", "null", "[]", "42", "{}",
    JSON.stringify({ ...sample, version: 2 }),
    JSON.stringify({ ...sample, notes: 42 }),
    JSON.stringify({ ...sample, checked: ["unknown"] }),
    JSON.stringify({ ...sample, checked: ["major", "major"] }),
    JSON.stringify({ ...sample, checked: { major: true } }),
    JSON.stringify({ ...sample, notes: "x".repeat(RESEARCH_NOTE_MAX_LENGTH + 1) }),
  ]) {
    assert.equal(parseResearchNotebook(raw), null);
  }
  assert.deepEqual(
    parseResearchNotebook(JSON.stringify({ ...sample, checked: ["campus", "major"], ignored: "not retained" })),
    { ...sample, checked: ["major", "campus"] },
  );
  assert.equal(parseResearchNotebook(JSON.stringify({ ...sample, notes: "x".repeat(RESEARCH_NOTE_MAX_LENGTH) }))?.notes.length, RESEARCH_NOTE_MAX_LENGTH);
});

test("missing notes are empty, malformed notes preserve a revision for explicit replacement", async () => {
  const { storage, records } = memoryStorage();
  const first = readResearchNotebook("guest", 101, storage);
  assert.equal(first.status, "ready");
  assert.equal(first.revision, null);
  assert.deepEqual(first.data, emptyResearchNotebook());
  records.set(researchNotebookKey("guest", 101)!, "old unreadable content");
  const invalid = readResearchNotebook("guest", 101, storage);
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.revision, "old unreadable content");
  assert.equal((await writeResearchNotebook("guest", 101, sample, null, storage)).status, "conflict");
  assert.equal((await writeResearchNotebook("guest", 101, sample, invalid.revision, storage)).status, "saved");
});

test("a stale notebook save cannot replace a copy that changed after it was loaded", async () => {
  const { storage } = memoryStorage();
  const tabA = readResearchNotebook(accountA, 101, storage);
  const tabB = readResearchNotebook(accountA, 101, storage);
  assert.equal((await writeResearchNotebook(accountA, 101, sample, tabA.revision, storage)).status, "saved");
  assert.equal((await writeResearchNotebook(accountA, 101, { ...sample, notes: "Stale draft" }, tabB.revision, storage)).status, "conflict");
  assert.equal(readResearchNotebook(accountA, 101, storage).data.notes, sample.notes);
});

test("unavailable and quota-limited storage fail visibly without claiming persistence", async () => {
  assert.equal(readResearchNotebook("guest", 101, null).status, "unavailable");
  assert.equal((await writeResearchNotebook("guest", 101, sample, null, null)).status, "unavailable");
  const inaccessible: ResearchNotebookStorage = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("SecurityError"); },
  };
  assert.equal(readResearchNotebook("guest", 101, inaccessible).status, "unavailable");
  assert.equal((await writeResearchNotebook("guest", 101, sample, null, inaccessible)).status, "unavailable");
  const quota: ResearchNotebookStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
  };
  assert.equal((await writeResearchNotebook("guest", 101, sample, null, quota)).status, "unavailable");
});

test("invalid writes leave the existing stored research intact", async () => {
  const { storage, records } = memoryStorage();
  const saved = (await writeResearchNotebook("guest", 101, sample, null, storage));
  assert.equal(saved.status, "saved");
  const before = [...records];
  assert.equal((await writeResearchNotebook("guest", 101, { ...sample, notes: "x".repeat(2001) }, readResearchNotebook("guest", 101, storage).revision, storage)).status, "invalid");
  assert.deepEqual([...records], before);
});

test("checklist order does not create false dirty states and empty records do not share arrays", async () => {
  assert.equal(researchNotebooksEqual(
    { ...sample, checked: ["campus", "major"] },
    { ...sample, checked: ["major", "campus"] },
  ), true);
  assert.equal(researchNotebooksEqual(sample, { ...sample, notes: "Changed" }), false);
  const first = emptyResearchNotebook();
  first.checked.push("major");
  assert.deepEqual(emptyResearchNotebook().checked, []);
});

test("transient verification preserves an account's editor key and resumes only that scope", async () => {
  const ready = { scopeKey: accountA, unitId: 101, clientReady: true, hydrated: true, canMutate: true };
  const account = deriveResearchNotebookScope(null, ready);
  assert.equal(account.canEdit, true);
  const checking = deriveResearchNotebookScope(account.retainedScope, {
    ...ready, scopeKey: "loading", hydrated: false, canMutate: false,
  });
  assert.equal(checking.canEdit, false);
  assert.equal(checking.retainedScope, accountA);
  assert.equal(checking.editorKey, account.editorKey);
  const checkingAgain = deriveResearchNotebookScope(checking.retainedScope, {
    ...ready, scopeKey: "loading", hydrated: false, canMutate: false,
  });
  assert.deepEqual(checkingAgain, checking);
  const resumed = deriveResearchNotebookScope(checkingAgain.retainedScope, ready);
  assert.deepEqual(resumed, account);
});

test("a different verified account replaces the hidden editor before its list hydrates", async () => {
  const ready = { scopeKey: accountA, unitId: 101, clientReady: true, hydrated: true, canMutate: true };
  const account = deriveResearchNotebookScope(null, ready);
  const nextAccount = deriveResearchNotebookScope(account.retainedScope, {
    ...ready, scopeKey: accountB, hydrated: false, canMutate: false,
  });
  assert.equal(nextAccount.retainedScope, accountB);
  assert.notEqual(nextAccount.editorKey, account.editorKey);
  assert.equal(nextAccount.canEdit, false);
  const resumed = deriveResearchNotebookScope(nextAccount.retainedScope, { ...ready, scopeKey: accountB });
  assert.equal(resumed.canEdit, true);
  assert.equal(resumed.editorKey, nextAccount.editorKey);
});

test("sign-out discards the account editor and subsequent loading retains only guest research", async () => {
  const ready = { scopeKey: accountA, unitId: 101, clientReady: true, hydrated: true, canMutate: true };
  const account = deriveResearchNotebookScope(null, ready);
  const guest = deriveResearchNotebookScope(account.retainedScope, { ...ready, scopeKey: "guest" });
  assert.equal(guest.retainedScope, "guest");
  assert.notEqual(guest.editorKey, account.editorKey);
  const loading = deriveResearchNotebookScope(guest.retainedScope, {
    ...ready, scopeKey: "loading", hydrated: false, canMutate: false,
  });
  assert.equal(loading.retainedScope, "guest");
  assert.equal(loading.editorKey, guest.editorKey);
  assert.equal(loading.canEdit, false);
});

test("server and initial loading render no editor, while readiness failures disable retained editors", async () => {
  const ready = { scopeKey: accountA, unitId: 101, clientReady: true, hydrated: true, canMutate: true };
  assert.deepEqual(deriveResearchNotebookScope(null, { ...ready, clientReady: false }), {
    retainedScope: null, editorKey: null, canEdit: false,
  });
  assert.deepEqual(deriveResearchNotebookScope(null, { ...ready, scopeKey: "loading" }), {
    retainedScope: null, editorKey: null, canEdit: false,
  });
  const key = researchNotebookKey(accountA, 101);
  for (const state of [
    { hydrated: false, canMutate: true },
    { hydrated: true, canMutate: false },
    { hydrated: false, canMutate: false },
  ]) {
    const pending = deriveResearchNotebookScope(accountA, { ...ready, ...state });
    assert.equal(pending.canEdit, false);
    assert.equal(pending.editorKey, key);
  }
});

test("saved-card snapshots preserve item references during same-account re-verification", async () => {
  const colleges = [{ unitId: 101 }, { unitId: 202 }];
  const ready = retainResearchCollection({ scopeKey: null, items: [] }, accountA, true, colleges);
  const checking = retainResearchCollection(ready, "loading", false, []);
  assert.equal(checking, ready);
  assert.equal(checking.items, colleges);
  assert.equal(retainResearchCollection(checking, accountA, false, []), ready);
  assert.equal(retainResearchCollection(checking, accountA, true, colleges), ready);
});

test("a newly verified account clears old cards immediately, without waiting for hydration", async () => {
  const ready = retainResearchCollection({ scopeKey: null, items: [] }, accountA, true, [{ unitId: 101 }]);
  const switching = retainResearchCollection(ready, accountB, false, []);
  assert.equal(switching.scopeKey, accountB);
  assert.deepEqual(switching.items, []);
  assert.notEqual(switching, ready);
  const loading = retainResearchCollection(switching, "loading", false, []);
  assert.equal(loading, switching);
  const signedOut = retainResearchCollection(ready, "guest", false, []);
  assert.equal(signedOut.scopeKey, "guest");
  assert.deepEqual(signedOut.items, []);
});

test("hydrated changes replace retained cards, including a genuinely empty saved list", async () => {
  const ready = retainResearchCollection({ scopeKey: null, items: [] }, accountA, true, [{ unitId: 101 }]);
  const changedItems = [{ unitId: 202 }];
  const changed = retainResearchCollection(ready, accountA, true, changedItems);
  assert.equal(changed.items, changedItems);
  const cleared = retainResearchCollection(changed, accountA, true, []);
  assert.equal(cleared.scopeKey, accountA);
  assert.deepEqual(cleared.items, []);
});

async function writeResearchNotebook(...args: Parameters<typeof atomicWriteResearchNotebook>) {
  return atomicWriteResearchNotebook(args[0], args[1], args[2], args[3], args[4], { request: async (_name, _options, task) => task() });
}
