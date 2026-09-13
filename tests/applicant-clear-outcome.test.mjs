import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicantProfileSessionStore, emptyApplicantProfile, applicantProfileKey, applicantProfileDraftKey } from '../app/lib/applicant-profile.ts';
const scope = 'guest';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function setup() {
  const key = applicantProfileKey(scope);
  const draftKey = applicantProfileDraftKey(scope);
  const original = { ...emptyApplicantProfile(), activities: 'Original saved profile' };
  const canonical = new Map([[key, JSON.stringify(original)]]);
  const journals = new Map();
  const flags = { storage: true, locks: true, canonicalRemove: true, journalRemove: true };
  const local = {
    getItem: (name) => canonical.get(name) ?? null,
    setItem: (name, value) => canonical.set(name, value),
    removeItem: (name) => { if (!flags.canonicalRemove) throw new Error('Synthetic canonical removal denied'); canonical.delete(name); },
  };
  const journal = {
    getItem: (name) => journals.get(name) ?? null,
    setItem: (name, value) => journals.set(name, value),
    removeItem: (name) => { if (!flags.journalRemove) throw new Error('Synthetic journal removal denied'); journals.delete(name); },
  };
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const locks = { request: async (_name, _options, callback) => { await hold; return callback(); } };
  const store = createApplicantProfileSessionStore(() => flags.storage ? local : null, () => journal, () => flags.locks ? locks : null);
  store.activate(scope);
  assert.equal(store.get(scope).status, 'ready');
  journals.set(draftKey, JSON.stringify({ version: 1, baseRevision: JSON.stringify(original), draft: original }));
  return { store, release, flags, canonical, journals, key, draftKey, original };
}

for (const scenario of ['successful-clear', 'newer-local-edit', 'newer-shared-copy', 'auth-boundary', 'canonical-removal-failure', 'journal-removal-failure', 'missing-locks', 'missing-storage', 'unseen-shared-revision']) {
  test(`explicit applicant clear outcome: ${scenario}`, async () => {
    const f = setup();
    if (scenario === 'canonical-removal-failure') f.flags.canonicalRemove = false;
    if (scenario === 'journal-removal-failure') f.flags.journalRemove = false;
    if (scenario === 'missing-locks') f.flags.locks = false;
    if (scenario === 'missing-storage') f.flags.storage = false;
    const pending = f.store.clear(scope);
    const newer = { ...emptyApplicantProfile(), activities: 'Newer profile that must not be cleared' };
    if (scenario === 'newer-local-edit') f.store.update(scope, newer);
    if (scenario === 'newer-shared-copy') { f.canonical.set(f.key, JSON.stringify(newer)); f.store.reconcile(scope); }
    if (scenario === 'unseen-shared-revision') f.canonical.set(f.key, JSON.stringify(newer));
    if (scenario === 'auth-boundary') { f.store.activate(other); f.store.update(other, { activities: 'Other account draft' }); }
    f.release();
    const result = await pending;
    const statuses = { 'successful-clear': 'ready', 'newer-local-edit': 'saving', 'newer-shared-copy': 'ready', 'auth-boundary': 'blocked', 'canonical-removal-failure': 'unavailable', 'journal-removal-failure': 'unavailable', 'missing-locks': 'unsupported', 'missing-storage': 'unavailable', 'unseen-shared-revision': 'conflict' };
    const shouldClear = scenario === 'successful-clear';
    assert.equal(result.cleared, shouldClear);
    assert.equal(result.status, statuses[scenario]);
    assert.equal(Object.hasOwn(f.store.get(scope), 'cleared'), false, 'Action metadata must not change cached snapshot shape');
    if (shouldClear) {
      assert.deepEqual(result.draft, emptyApplicantProfile());
      assert.equal(f.canonical.has(f.key), false);
      assert.equal(f.journals.has(f.draftKey), false);
    } else {
      assert.equal(f.journals.has(f.draftKey), true);
      assert.equal(f.canonical.has(f.key), scenario !== 'journal-removal-failure');
      assert.deepEqual(result.draft, ['newer-local-edit', 'newer-shared-copy'].includes(scenario) ? newer : f.original);
    }
    if (scenario === 'auth-boundary') assert.equal(f.store.get(other).draft.activities, 'Other account draft');
  });
}
