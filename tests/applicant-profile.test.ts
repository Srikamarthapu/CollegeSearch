import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICANT_PROFILE_LIMITS,
  PREPARATION_CHECKLIST,
  applicantProfileKey,
  applicantProfileDraftKey,
  applicantProfileReviewNotes,
  buildApplicantBrief,
  createApplicantProfileSessionStore,
  deriveApplicantProfileScope,
  emptyApplicantProfile,
  hasApplicantProfileContent,
  parseApplicantProfile,
  readApplicantProfile,
  writeApplicantProfile,
  type ApplicantProfileStorage,
  type ApplicantProfileLockManager,
} from "../app/lib/applicant-profile.ts";

const accountA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sample = {
  ...emptyApplicantProfile(),
  gpa: "92.50", scale: "100-point school scale", weighting: "weighted" as const,
  coursework: "School does not offer AP classes. Taking advanced math.",
  opportunities: "Only one advanced lab fits my school timetable.",
  activities: "Paid work: 12 hours weekly. Care for my sibling after school.",
  interests: "Engineering and community planning", priorities: "Affordability; close to home",
  checked: ["context" as const], nextSteps: "Ask my counselor which official application dates to verify.",
};

function serialLocks(): ApplicantProfileLockManager {
  const tails = new Map<string, Promise<unknown>>();
  return { request: (name, _options, task) => {
    const next = (tails.get(name) ?? Promise.resolve()).then(task);
    tails.set(name, next.catch(() => undefined));
    return next;
  } };
}
const locks = serialLocks();
function makeStore(storage: ApplicantProfileStorage | null, journal = memoryStorage().storage) {
  const store = createApplicantProfileSessionStore(() => storage, () => journal, () => locks);
  store.activate("guest");
  return store;
}

function memoryStorage() {
  const records = new Map<string, string>();
  const storage: ApplicantProfileStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: (key) => { records.delete(key); },
  };
  return { records, storage };
}

test("guest and verified account profiles never migrate or share records", async () => {
  const { storage, records } = memoryStorage();
  await writeApplicantProfile("guest", sample, null, storage, locks);
  await writeApplicantProfile(accountA, { ...sample, activities: "Account A only" }, null, storage, locks);
  assert.equal(readApplicantProfile("guest", storage).draft.activities, sample.activities);
  assert.equal(readApplicantProfile(accountA, storage).draft.activities, "Account A only");
  assert.deepEqual(readApplicantProfile(accountB, storage).draft, emptyApplicantProfile());
  assert.equal(records.size, 2);
  assert.equal(applicantProfileKey(accountA.toUpperCase()), applicantProfileKey(accountA));
});

test("loading, email, malformed IDs, and unverified states cannot expose an editor or access storage", async () => {
  const storage: ApplicantProfileStorage = {
    getItem: () => { assert.fail("Unverified scope reached storage"); },
    setItem: () => { assert.fail("Unverified scope reached storage"); },
    removeItem: () => { assert.fail("Unverified scope reached storage"); },
  };
  for (const scopeKey of ["loading", "someone@example.com", "account:123", "guest:1", "", "a/b"]) {
    assert.equal(applicantProfileKey(scopeKey), null);
    assert.equal(readApplicantProfile(scopeKey, storage).status, "blocked");
    assert.equal((await writeApplicantProfile(scopeKey, sample, null, storage, locks)).status, "blocked");
    assert.equal(deriveApplicantProfileScope({ scopeKey, clientReady: true, hydrated: true, canMutate: true }), null);
  }
  for (const scopeKey of ["guest", accountA, accountB]) {
    const ready = { scopeKey, clientReady: true, hydrated: true, canMutate: true };
    assert.equal(deriveApplicantProfileScope(ready), scopeKey);
    for (const gate of ["clientReady", "hydrated", "canMutate"]) assert.equal(deriveApplicantProfileScope({ ...ready, [gate]: false }), null);
  }
});

test("a scope change or verification pause never selects the previous owner or guesses guest", async () => {
  const input = { clientReady: true, hydrated: true, canMutate: true };
  const transitions = [accountA, "loading", accountB, "loading", "guest"];
  assert.deepEqual(transitions.map((scopeKey) => deriveApplicantProfileScope({ ...input, scopeKey })), [accountA, null, accountB, null, "guest"]);
});

test("bounded parser preserves original GPA/context and ignores unapproved prediction or identity fields", async () => {
  const parsed = parseApplicantProfile(JSON.stringify({ ...sample, probability: 0.99, inferredRole: "safety", email: "private@example.com", token: "private" }));
  assert.deepEqual(parsed, sample);
  assert.equal(parsed?.gpa, "92.50");
  assert.equal(parsed?.scale, "100-point school scale");
  assert.equal(parsed?.weighting, "weighted");
  for (const [field, max] of Object.entries(APPLICANT_PROFILE_LIMITS)) {
    assert.ok(parseApplicantProfile(JSON.stringify({ ...sample, [field]: "x".repeat(max) })));
    assert.equal(parseApplicantProfile(JSON.stringify({ ...sample, [field]: "x".repeat(max + 1) })), null);
  }
});

test("invalid structure and duplicate or invented preparation assertions are rejected", async () => {
  for (const raw of ["{", "null", "42", "[]", "{}",
    JSON.stringify({ ...sample, version: 2 }), JSON.stringify({ ...sample, gpa: 92.5 }),
    JSON.stringify({ ...sample, weighting: "converted" }), JSON.stringify({ ...sample, checked: ["guaranteed-admission"] }),
    JSON.stringify({ ...sample, checked: ["context", "context"] }), JSON.stringify({ ...sample, activities: null }),
  ]) assert.equal(parseApplicantProfile(raw), null);
  assert.deepEqual(parseApplicantProfile(null), emptyApplicantProfile());
});

test("incomplete GPA context survives autosave while review prompts remain advisory", async () => {
  const { storage } = memoryStorage();
  const store = makeStore(storage);
  store.update("guest", { gpa: "3." });
  await store.flush("guest");
  assert.equal(readApplicantProfile("guest", storage).draft.gpa, "3.");
  assert.equal(applicantProfileReviewNotes(store.get("guest").draft).length, 3);
  store.update("guest", { gpa: "3.75", scale: "4.0", weighting: "unweighted" });
  assert.deepEqual(applicantProfileReviewNotes(store.get("guest").draft), []);
  assert.deepEqual(applicantProfileReviewNotes(emptyApplicantProfile()), []);
});

test("completed autosaves restore from the shared browser copy after reload", async () => {
  const { storage } = memoryStorage();
  const first = makeStore(storage);
  first.update("guest", sample);
  await first.flush("guest");
  first.update("guest", { activities: `${sample.activities}\nA just-typed final sentence.` });
  await first.flush("guest");
  const second = makeStore(storage);
  assert.equal(second.get("guest").draft.activities, `${sample.activities}\nA just-typed final sentence.`);
  assert.equal(second.get("guest").persisted, true);
  assert.equal(first.reconcile("guest").draft.activities, second.get("guest").draft.activities);
});

test("a final keystroke is journaled synchronously before autosave and survives immediate reload", async () => {
  const { storage } = memoryStorage();
  const journal = memoryStorage().storage;
  const first = makeStore(storage, journal);
  const staged = first.update("guest", { activities: "Final keystroke before navigation" });
  assert.equal(staged.status, "saving");
  assert.equal(staged.draftPersisted, true);
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "");
  assert.ok(journal.getItem(applicantProfileDraftKey("guest")!)?.includes("Final keystroke before navigation"));
  const reloaded = makeStore(storage, journal);
  assert.equal(reloaded.get("guest").draft.activities, "Final keystroke before navigation");
  assert.equal(reloaded.get(accountA).draft.activities, "");
  await reloaded.flush("guest");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "Final keystroke before navigation");
  assert.equal(journal.getItem(applicantProfileDraftKey("guest")!), null);
});

test("simultaneous tab autosaves serialize: exactly one commits and the other retains its journal", async () => {
  const { storage } = memoryStorage();
  const journalA = memoryStorage().storage;
  const journalB = memoryStorage().storage;
  const tabA = makeStore(storage, journalA);
  const tabB = makeStore(storage, journalB);
  tabA.update("guest", { activities: "Tab A activity" });
  tabB.update("guest", { activities: "Tab B activity" });
  const results = await Promise.all([tabA.flush("guest"), tabB.flush("guest")]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["conflict", "ready"]);
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "Tab A activity");
  assert.equal(tabB.get("guest").draft.activities, "Tab B activity");
  assert.equal(tabB.get("guest").draftPersisted, true);
  assert.equal(makeStore(storage, journalB).get("guest").draft.activities, "Tab B activity");
  assert.equal(makeStore(storage, journalB).get("guest").status, "conflict");
});

test("identity is checked again after lock wait, and stale account drafts remain scoped", async () => {
  const { records, storage } = memoryStorage();
  const sharedLocks = serialLocks();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const holder = sharedLocks.request(`college-search:applicant-profile:${applicantProfileKey(accountA)}`, { mode: "exclusive" }, () => hold);
  const journal = memoryStorage().storage;
  const store = createApplicantProfileSessionStore(() => storage, () => journal, () => sharedLocks);
  store.activate(accountA);
  store.update(accountA, { activities: "Account A pending" });
  const pending = store.flush(accountA);
  store.activate(accountB);
  release();
  await holder;
  assert.equal((await pending).status, "blocked");
  assert.equal(records.size, 0);
  assert.equal(store.get(accountB).draft.activities, "");
  assert.ok(journal.getItem(applicantProfileDraftKey(accountA)!)?.includes("Account A pending"));
  store.activate(accountA);
  store.reconcile(accountA);
  await store.flush(accountA);
  assert.equal(readApplicantProfile(accountA, storage).draft.activities, "Account A pending");
});

test("account-deletion invalidation prevents queued writes and drops the deleted owner's cached draft", async () => {
  const { records, storage } = memoryStorage();
  const journal = memoryStorage().storage;
  const sharedLocks = serialLocks();
  const deleted = new Set<string>();
  const store = createApplicantProfileSessionStore(() => storage, () => journal, () => sharedLocks, (scope) => !deleted.has(scope));
  store.activate(accountA);
  store.update(accountA, { activities: "Deleted account's private notes" });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const holder = sharedLocks.request(`college-search:applicant-profile:${applicantProfileKey(accountA)}`, { mode: "exclusive" }, () => hold);
  const pending = store.flush(accountA);
  deleted.add(accountA);
  store.forget(accountA);
  release(); await holder; await pending;
  assert.equal(records.size, 0);
  assert.equal(store.get(accountA).status, "blocked");
  assert.equal(store.get(accountA).draft.activities, "");
  assert.equal(journal.getItem(applicantProfileDraftKey(accountA)!), null);
  store.activate(accountA);
  assert.equal(store.update(accountA, { activities: "Must not recreate" }).status, "blocked");
  assert.equal(journal.getItem(applicantProfileDraftKey(accountA)!), null);
  store.activate("guest"); store.update("guest", { activities: "Guest is still available" }); await store.flush("guest");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "Guest is still available");
});

test("typing while an autosave waits preserves later edits and rebases their recovery revision", async () => {
  const { storage } = memoryStorage();
  const sharedLocks = serialLocks();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const holder = sharedLocks.request(`college-search:applicant-profile:${applicantProfileKey("guest")}`, { mode: "exclusive" }, () => hold);
  const journal = memoryStorage().storage;
  const store = createApplicantProfileSessionStore(() => storage, () => journal, () => sharedLocks);
  store.activate("guest");
  store.update("guest", { activities: "First edit" });
  const pending = store.flush("guest");
  store.update("guest", { activities: "Later edit typed while waiting" });
  release();
  await holder;
  await pending;
  await store.flush("guest");
  assert.equal(store.get("guest").draft.activities, "Later edit typed while waiting");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "Later edit typed while waiting");
  assert.equal(store.get("guest").persisted, true);
});

test("unsupported locking keeps a reloadable draft and never falls back to unlocked writes", async () => {
  const { records, storage } = memoryStorage();
  const journal = memoryStorage().storage;
  const store = createApplicantProfileSessionStore(() => storage, () => journal, () => null);
  store.activate("guest");
  store.update("guest", sample);
  const result = await store.flush("guest");
  assert.equal(result.status, "unsupported");
  assert.equal(result.draftPersisted, true);
  assert.equal(result.persisted, false);
  assert.equal(records.size, 0);
  assert.equal(makeStore(storage, journal).get("guest").draft.activities, sample.activities);
});

test("clear does not erase a later edit made while it waits for the shared lock", async () => {
  const { storage } = memoryStorage();
  const sharedLocks = serialLocks();
  const journal = memoryStorage().storage;
  const store = createApplicantProfileSessionStore(() => storage, () => journal, () => sharedLocks);
  store.activate("guest");
  store.update("guest", { activities: "Original notes" });
  await store.flush("guest");
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const holder = sharedLocks.request(`college-search:applicant-profile:${applicantProfileKey("guest")}`, { mode: "exclusive" }, () => hold);
  const clearing = store.clear("guest");
  store.update("guest", { activities: "An edit made after clear was requested" });
  release(); await holder; await clearing;
  assert.equal(store.get("guest").draft.activities, "An edit made after clear was requested");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "Original notes");
  assert.ok(journal.getItem(applicantProfileDraftKey("guest")!)?.includes("An edit made after clear was requested"));
});

test("blocked storage retains edits for same-tab route changes and isolates them by owner", async () => {
  const store = makeStore(null);
  store.update("guest", sample);
  assert.equal((await store.flush("guest")).status, "unavailable");
  store.activate(accountA);
  store.update(accountA, { activities: "Private account A draft" });
  await store.flush(accountA);
  assert.equal(store.reconcile("guest").draft.activities, sample.activities);
  assert.equal(store.reconcile(accountA).draft.activities, "Private account A draft");
  assert.equal(store.get(accountB).draft.activities, "");
  assert.equal(store.get("guest").persisted, false);
  assert.equal(makeStore(null).get("guest").draft.activities, "");
});

test("quota and read failures never claim persistence or lose the active draft", async () => {
  const { storage } = memoryStorage();
  const quota: ApplicantProfileStorage = { ...storage, setItem: () => { throw new Error("Quota exceeded"); } };
  const store = makeStore(quota);
  store.update("guest", sample);
  const result = await store.flush("guest");
  assert.equal(result.status, "unavailable");
  assert.equal(result.persisted, false);
  assert.deepEqual(store.get("guest").draft, sample);
  assert.equal(readApplicantProfile("guest", { ...storage, getItem: () => { throw new Error("Denied"); } }).status, "unavailable");
});

test("stale edits keep a recoverable draft and do not silently overwrite a newer browser copy", async () => {
  const { storage } = memoryStorage();
  const first = makeStore(storage);
  const second = makeStore(storage);
  first.get("guest"); second.get("guest");
  first.update("guest", { activities: "First tab saved" });
  await first.flush("guest");
  second.update("guest", { activities: "Second tab draft" });
  const conflict = await second.flush("guest");
  assert.equal(conflict.status, "conflict");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "First tab saved");
  assert.equal(second.reconcile("guest").draft.activities, "Second tab draft");
  second.update("guest", { priorities: "Keep these new notes too" });
  assert.equal(second.get("guest").status, "conflict");
  assert.equal((await second.saveDraft("guest")).status, "conflict");
  assert.equal((await second.saveDraft("guest", true)).status, "ready");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "Second tab draft");
  assert.equal(readApplicantProfile("guest", storage).draft.priorities, "Keep these new notes too");
});

test("retry after storage returns detects a previously unseen copy before offering replacement", async () => {
  const { storage } = memoryStorage();
  await writeApplicantProfile("guest", sample, null, storage, locks);
  let available = false;
  const store = createApplicantProfileSessionStore(() => available ? storage : null, () => memoryStorage().storage, () => locks);
  store.activate("guest");
  store.update("guest", { activities: "Offline draft" });
  available = true;
  assert.equal((await store.saveDraft("guest")).status, "conflict");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, sample.activities);
  assert.equal(store.useSaved("guest").draft.activities, sample.activities);
});

test("unreadable records stay untouched until explicit replacement or clear", async () => {
  const { records, storage } = memoryStorage();
  const key = applicantProfileKey("guest")!;
  records.set(key, "{broken");
  const store = makeStore(storage);
  assert.equal(store.update("guest", { activities: "My recovered notes" }).status, "invalid");
  assert.equal(records.get(key), "{broken");
  assert.equal((await store.saveDraft("guest", true)).status, "ready");
  assert.equal(readApplicantProfile("guest", storage).draft.activities, "My recovered notes");
});

test("clear removes only the selected scope and the in-memory draft; failure retains contents", async () => {
  const { records, storage } = memoryStorage();
  let canRemove = true;
  const store = makeStore({ ...storage, removeItem: (key) => {
    if (!canRemove) throw new Error("Denied");
    storage.removeItem(key);
  } });
  store.update("guest", sample); await store.flush("guest");
  store.activate(accountA);
  store.update(accountA, { activities: "Account A notes" }); await store.flush(accountA);
  store.activate("guest");
  const cleared = await store.clear("guest");
  assert.deepEqual(cleared.draft, emptyApplicantProfile());
  assert.equal(records.has(applicantProfileKey("guest")!), false);
  assert.equal(store.get(accountA).draft.activities, "Account A notes");
  canRemove = false;
  store.activate(accountA);
  const failed = await store.clear(accountA);
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.draft.activities, "Account A notes");
  assert.equal(records.has(applicantProfileKey(accountA)!), true);
});

test("brief exports the current self-reported draft, original grading context, responsibilities, and marked preparation", async () => {
  const brief = buildApplicantBrief(sample, new Date("2026-09-13T12:00:00Z"));
  assert.match(brief, /Prepared 2026-09-13 \(UTC\)/);
  for (const value of [sample.gpa, sample.scale, sample.coursework, sample.opportunities, sample.activities, sample.interests, sample.priorities, sample.nextSteps]) assert.ok(brief.includes(value));
  assert.ok(brief.includes(`[x] ${PREPARATION_CHECKLIST[0].label}`));
  assert.ok(brief.includes(`[ ] ${PREPARATION_CHECKLIST[1].label}`));
  assert.match(brief, /not verified by CollegeSearch/);
  assert.match(brief, /No GPA conversion, admission probability, or automated reach\/target\/safety assessment/);
  assert.match(brief, /does not affect preference scores/);
  assert.match(brief, /student-entered/);
  assert.doesNotMatch(brief, /aaaaaaaa-aaaa|college-search-applicant|admission chance:|converted GPA:/i);
});

test("plain-text export preserves user content as text, handles empty entries honestly, and invents no deadlines", async () => {
  const profile = { ...emptyApplicantProfile(), activities: '<script>alert("hello")</script>\n=1+1, "quoted"', nextSteps: "Confirm the deadline; I do not know it yet." };
  const brief = buildApplicantBrief(profile, new Date("2026-09-13T12:00:00Z"));
  assert.ok(brief.includes(profile.activities));
  assert.ok(brief.includes(profile.nextSteps));
  assert.match(brief, /GPA as entered: Not entered/);
  assert.doesNotMatch(brief, /January 1|November 1|11\/01|01\/01/);
  assert.equal(hasApplicantProfileContent(emptyApplicantProfile()), false);
  assert.equal(hasApplicantProfileContent(profile), true);
  assert.equal(hasApplicantProfileContent({ ...emptyApplicantProfile(), checked: ["dates"] }), true);
});

test("typing every profile field empty retains that clear intent across a competing tab write and reload", async () => {
  const { storage } = memoryStorage();
  const journalA = memoryStorage().storage;
  const journalB = memoryStorage().storage;
  const a = makeStore(storage, journalA);
  a.update("guest", sample); await a.flush("guest");
  const b = makeStore(storage, journalB); b.get("guest");
  a.update("guest", emptyApplicantProfile());
  b.update("guest", { priorities: "New priorities in another tab" }); await b.flush("guest");
  const conflict = a.reconcile("guest");
  assert.equal(conflict.status, "conflict");
  assert.deepEqual(conflict.draft, emptyApplicantProfile());
  const reloaded = makeStore(storage, journalA);
  assert.equal(reloaded.get("guest").status, "conflict");
  assert.deepEqual(reloaded.get("guest").draft, emptyApplicantProfile());
  assert.equal((await a.saveDraft("guest", true)).status, "ready");
  assert.deepEqual(readApplicantProfile("guest", storage).draft, emptyApplicantProfile());
});

