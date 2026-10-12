import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSavedCollegeViewState,
  normalizeSavedCollegeUserId,
  type SavedCollegeViewInput,
} from "../app/lib/saved-college-view-state.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const knownIds = new Set([101, 202, 303]);

function view(
  overrides: Partial<SavedCollegeViewInput> = {},
): ReturnType<typeof deriveSavedCollegeViewState> {
  return deriveSavedCollegeViewState({
    authStatus: "signed-in",
    baseSource: "remote",
    guestImportCount: 0,
    hasPendingOutbox: false,
    knownIds,
    remoteRead: "succeeded",
    renderedIds: [101],
    renderedScope: USER_A,
    syncConfirmed: true,
    userId: USER_A,
    ...overrides,
  });
}

test("account A is hidden through every loading and account-B transition frame", () => {
  assert.deepEqual(view().visibleIds, [101], "account A starts visible");

  const transitionFrames: SavedCollegeViewInput[] = [
    {
      authStatus: "loading",
      baseSource: "remote",
      guestImportCount: 0,
      hasPendingOutbox: false,
      knownIds,
      remoteRead: "succeeded",
      renderedIds: [101],
      renderedScope: USER_A,
      syncConfirmed: true,
      userId: null,
    },
    {
      authStatus: "loading",
      baseSource: "remote",
      guestImportCount: 0,
      hasPendingOutbox: false,
      knownIds,
      remoteRead: "succeeded",
      renderedIds: [101],
      renderedScope: "loading",
      syncConfirmed: true,
      userId: null,
    },
    {
      authStatus: "signed-in",
      baseSource: "remote",
      guestImportCount: 0,
      hasPendingOutbox: false,
      knownIds,
      remoteRead: "loading",
      renderedIds: [101],
      renderedScope: "loading",
      syncConfirmed: false,
      userId: USER_B,
    },
    {
      authStatus: "signed-in",
      baseSource: "remote",
      guestImportCount: 0,
      hasPendingOutbox: false,
      knownIds,
      remoteRead: "loading",
      renderedIds: [101],
      renderedScope: USER_A,
      syncConfirmed: false,
      userId: USER_B,
    },
  ];

  for (const frame of transitionFrames) {
    const state = deriveSavedCollegeViewState(frame);
    assert.deepEqual(state.visibleIds, []);
    assert.equal(state.hydrated, false);
    assert.equal(state.canMutate, false);
    assert.equal(state.canImportGuestSaves, false);
  }

  const accountB = view({
    renderedIds: [202],
    renderedScope: USER_B,
    userId: USER_B,
  });
  assert.deepEqual(accountB.visibleIds, [202]);
  assert.equal(accountB.canMutate, true);
});

test("a valid account cache is complete but an outbox by itself is not", () => {
  const cached = view({
    baseSource: "cache",
    hasPendingOutbox: true,
    remoteRead: "loading",
    renderedIds: [101, 303],
    syncConfirmed: false,
  });
  assert.deepEqual(cached.visibleIds, [101, 303]);
  assert.equal(cached.accountBaseAvailable, true);
  assert.equal(cached.hydrated, true);
  assert.equal(cached.listState, "cached");
  assert.equal(cached.hasPendingIntent, true);
  assert.equal(cached.canMutate, true);
  assert.equal(cached.canImportGuestSaves, false);

  const outboxOnly = view({
    baseSource: "none",
    hasPendingOutbox: true,
    remoteRead: "loading",
    renderedIds: [303],
    syncConfirmed: false,
  });
  assert.deepEqual(outboxOnly.visibleIds, []);
  assert.equal(outboxOnly.accountBaseAvailable, false);
  assert.equal(outboxOnly.hydrated, false);
  assert.equal(outboxOnly.listState, "loading");
  assert.equal(outboxOnly.hasPendingIntent, true);
  assert.equal(outboxOnly.canMutate, false);
});

test("a failed remote read without a complete base is unavailable, not empty", () => {
  const state = view({
    baseSource: "none",
    hasPendingOutbox: true,
    remoteRead: "failed",
    renderedIds: [],
    syncConfirmed: false,
  });

  assert.equal(state.listState, "unavailable");
  assert.equal(state.hydrated, false);
  assert.deepEqual(state.visibleIds, []);
  assert.equal(state.canMutate, false);
  assert.equal(state.canImportGuestSaves, false);
  assert.equal(state.hasPendingIntent, true);
});

test("cached offline data remains labeled cached rather than synced", () => {
  const state = view({
    baseSource: "cache",
    remoteRead: "failed",
    renderedIds: [101],
    syncConfirmed: false,
  });

  assert.equal(state.listState, "cached-offline");
  assert.deepEqual(state.visibleIds, [101]);
  assert.equal(state.canMutate, true);
  assert.equal(state.canImportGuestSaves, false);
});

test("a previously confirmed remote base stays visible during a retry", () => {
  const state = view({
    baseSource: "remote",
    remoteRead: "loading",
    renderedIds: [101, 202],
    syncConfirmed: false,
  });

  assert.equal(state.listState, "cached");
  assert.equal(state.hydrated, true);
  assert.deepEqual(state.visibleIds, [101, 202]);
  assert.equal(state.canMutate, true);
  assert.equal(state.canImportGuestSaves, false);
});

test("guest import is enabled only for a current, confirmed remote account view", () => {
  const ready = view({ guestImportCount: 2 });
  assert.equal(ready.canImportGuestSaves, true);

  for (const overrides of [
    { baseSource: "cache" as const },
    { hasPendingOutbox: true },
    { remoteRead: "failed" as const },
    { renderedScope: USER_B },
    { syncConfirmed: false },
    { guestImportCount: 0 },
  ]) {
    assert.equal(view(overrides).canImportGuestSaves, false);
  }

  const guest = view({
    authStatus: "signed-out",
    baseSource: "guest",
    guestImportCount: 2,
    remoteRead: "idle",
    renderedScope: "guest",
    userId: null,
  });
  assert.equal(guest.canMutate, true);
  assert.equal(guest.canImportGuestSaves, false);
});

test("only canonical verified UUIDs can define an account storage scope", () => {
  assert.equal(normalizeSavedCollegeUserId(`  ${USER_A.toUpperCase()}  `), USER_A);
  assert.equal(normalizeSavedCollegeUserId("not-a-verified-user"), null);

  const malformed = view({ userId: "not-a-verified-user" });
  assert.equal(malformed.scopeKind, "blocked");
  assert.equal(malformed.expectedScope, "loading");
  assert.deepEqual(malformed.visibleIds, []);
  assert.equal(malformed.canMutate, false);
  assert.equal(malformed.canImportGuestSaves, false);
});
