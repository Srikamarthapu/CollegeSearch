import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import * as profile from '../app/lib/applicant-profile.ts';
import * as planner from '../app/lib/deadline-plan.ts';
import * as deadline from '../app/lib/deadline-data.ts';

const scope = 'guest';
const locks = { request: async (_name, _options, task) => task() };
const known = new Set([101]);
const components = [
  {
    name: 'applicant profile',
    key: profile.applicantProfileKey(scope),
    draftKey: profile.applicantProfileDraftKey(scope),
    value: (marker) => ({ ...profile.emptyApplicantProfile(), activities: marker }),
    empty: profile.emptyApplicantProfile(),
    create: (local, journal) => profile.createApplicantProfileSessionStore(() => local, () => journal, () => locks),
  },
  {
    name: 'deadline planner',
    key: deadline.deadlinePlanKey(scope),
    draftKey: planner.deadlinePlanDraftKey(scope),
    value: (marker) => ({ version: 1, entries: [{ id: '11111111-1111-4111-8111-111111111111', collegeId: 101, task: 'application', title: 'Synthetic task', date: '2027-01-03', sourceUrl: '', sourceChecked: false, checkedOn: '', notes: marker, completed: false }] }),
    empty: deadline.emptyDeadlinePlan(),
    create: (local, journal) => planner.createDeadlinePlanStore(known, () => local, () => journal, () => locks),
  },
];

for (const component of components) {
  for (const fault of ['read-failure', 'malformed-shared-copy', 'journal-removal-failure', 'valid-shared-copy', 'absent-shared-copy']) {
    test(`${component.name}: recovery ${fault}`, () => {
      const canonical = new Map();
      const journals = new Map();
      const operations = [];
      let failRead = false;
      let failRemove = false;
      const local = {
        getItem(key) { operations.push('read-canonical'); if (failRead) throw new Error('Synthetic canonical read denied'); return canonical.get(key) ?? null; },
        setItem(key, value) { canonical.set(key, value); },
        removeItem(key) { canonical.delete(key); },
      };
      const journal = {
        getItem(key) { return journals.get(key) ?? null; },
        setItem(key, value) { journals.set(key, value); },
        removeItem(key) { operations.push('remove-draft'); if (failRemove) throw new Error('Synthetic journal removal denied'); journals.delete(key); },
      };
      canonical.set(component.key, JSON.stringify(component.value('Original shared copy')));
      const store = component.create(local, journal);
      store.activate(scope);
      store.get(scope);
      const retainedDraft = component.value('Unsaved draft that must survive a failed recovery');
      store.update(scope, retainedDraft);
      const remoteDraft = component.value('Newer shared copy from another synthetic tab');
      canonical.set(component.key, JSON.stringify(remoteDraft));
      assert.equal(store.reconcile(scope).status, 'conflict');
      const journalBefore = journals.get(component.draftKey);
      assert.ok(journalBefore);

      if (fault === 'read-failure') failRead = true;
      if (fault === 'malformed-shared-copy') canonical.set(component.key, '{broken');
      if (fault === 'journal-removal-failure') failRemove = true;
      if (fault === 'absent-shared-copy') canonical.delete(component.key);
      const canonicalBefore = canonical.get(component.key);
      operations.length = 0;
      const result = store.useSaved(scope);
      const failedRecovery = ['read-failure', 'malformed-shared-copy', 'journal-removal-failure'].includes(fault);
      const outcome = {
        status: result.status,
        retainedDraft: isDeepStrictEqual(result.draft, retainedDraft),
        retainedJournal: journals.get(component.draftKey) === journalBefore,
        canonicalUntouched: canonical.get(component.key) === canonicalBefore,
        operations: [...operations],
      };
      console.log(JSON.stringify({ component: component.name, fault, ...outcome }));
      if (failedRecovery) {
        assert.deepEqual({ status: outcome.status, retainedDraft: outcome.retainedDraft, retainedJournal: outcome.retainedJournal, canonicalUntouched: outcome.canonicalUntouched }, {
          status: fault === 'malformed-shared-copy' ? 'invalid' : 'unavailable', retainedDraft: true, retainedJournal: true, canonicalUntouched: true,
        });
        if (fault !== 'journal-removal-failure') assert.deepEqual(operations, ['read-canonical'], 'Do not remove recovery journal until the canonical read succeeds and validates');
      } else {
        assert.equal(result.status, 'ready');
        assert.deepEqual(result.draft, fault === 'absent-shared-copy' ? component.empty : remoteDraft);
        assert.equal(journals.has(component.draftKey), false);
        assert.equal(outcome.canonicalUntouched, true);
      }
    });
  }
}
