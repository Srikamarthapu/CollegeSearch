import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthStateCoordinator,
  type AuthClientPort,
  type AuthSnapshot,
} from "../app/components/auth/auth-state-coordinator.ts";

type TestUser = {
  email?: string;
  id: string;
};

type UserResult = Awaited<ReturnType<AuthClientPort<TestUser>["getUser"]>>;
type SignOutResult = Awaited<ReturnType<AuthClientPort<TestUser>["signOut"]>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

class FakeAuthClient implements AuthClientPort<TestUser> {
  getUserCalls = 0;
  signOutCalls: Array<{ scope: "local" }> = [];
  userResults: Array<Promise<UserResult>> = [];
  signOutResults: Array<Promise<SignOutResult>> = [];

  getUser() {
    this.getUserCalls += 1;
    const result = this.userResults.shift();
    if (!result) throw new Error("Missing getUser test response.");
    return result;
  }

  signOut(options: { scope: "local" }) {
    this.signOutCalls.push(options);
    const result = this.signOutResults.shift();
    if (!result) throw new Error("Missing signOut test response.");
    return result;
  }
}

function createHarness(client = new FakeAuthClient(), isUserErased: (id: string) => boolean = () => false) {
  const scheduled: Array<() => void> = [];
  const snapshots: AuthSnapshot<TestUser>[] = [];
  const coordinator = createAuthStateCoordinator<TestUser>({
    auth: client,
    isUserErased,
    onChange(snapshot) {
      snapshots.push(snapshot);
    },
    schedule(callback) {
      scheduled.push(callback);
    },
  });

  return {
    client,
    coordinator,
    flushScheduled() {
      for (const callback of scheduled.splice(0)) callback();
    },
    snapshots,
  };
}

test("a deferred old identity cannot overwrite sign-out followed by another account", async () => {
  const harness = createHarness();
  const responseA = deferred<UserResult>();
  const responseB = deferred<UserResult>();
  harness.client.userResults.push(responseA.promise, responseB.promise);

  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  harness.flushScheduled();
  assert.equal(harness.client.getUserCalls, 1);

  harness.coordinator.handleAuthEvent("SIGNED_OUT", null);
  assert.deepEqual(harness.coordinator.getSnapshot(), {
    status: "signed-out",
    user: null,
    verification: "verified",
    verificationError: null,
  });

  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-b");
  harness.flushScheduled();
  assert.equal(harness.client.getUserCalls, 2);

  responseB.resolve({ data: { user: { id: "user-b" } }, error: null });
  await harness.coordinator.refresh();
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-b");

  responseA.resolve({ data: { user: { id: "user-a" } }, error: null });
  await responseA.promise;
  await Promise.resolve();
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-b");
  assert.equal(harness.coordinator.getSnapshot().status, "signed-in");
});

test("an auth event invalidates a different identity before verification finishes", async () => {
  const harness = createHarness();
  harness.client.userResults.push(
    Promise.resolve({ data: { user: { id: "user-a" } }, error: null }),
  );
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  harness.flushScheduled();
  await harness.coordinator.refresh();
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-a");

  const responseB = deferred<UserResult>();
  harness.client.userResults.push(responseB.promise);
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-b");
  assert.deepEqual(harness.coordinator.getSnapshot(), {
    status: "loading",
    user: null,
    verification: "checking",
    verificationError: null,
  });

  harness.flushScheduled();
  responseB.resolve({ data: { user: { id: "user-b" } }, error: null });
  await harness.coordinator.refresh();
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-b");
});

test("transient getUser failures never claim a confirmed sign-out", async () => {
  const initial = createHarness();
  initial.client.userResults.push(
    Promise.resolve({
      data: { user: null },
      error: { message: "Auth service is temporarily unreachable." },
    }),
  );
  initial.coordinator.handleAuthEvent("INITIAL_SESSION", null);
  initial.flushScheduled();
  await initial.coordinator.refresh();
  assert.deepEqual(initial.coordinator.getSnapshot(), {
    status: "verification-error",
    user: null,
    verification: "failed",
    verificationError: "Auth service is temporarily unreachable.",
  });

  initial.client.userResults.push(
    Promise.resolve({ data: { user: null }, error: null }),
  );
  await initial.coordinator.refresh();
  assert.deepEqual(initial.coordinator.getSnapshot(), {
    status: "signed-out",
    user: null,
    verification: "verified",
    verificationError: null,
  });

  const signedIn = createHarness();
  signedIn.client.userResults.push(
    Promise.resolve({ data: { user: { id: "user-a" } }, error: null }),
  );
  signedIn.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  signedIn.flushScheduled();
  await signedIn.coordinator.refresh();

  signedIn.client.userResults.push(
    Promise.resolve({
      data: { user: null },
      error: { message: "Network request failed." },
    }),
  );
  await signedIn.coordinator.refresh();
  assert.equal(signedIn.coordinator.getSnapshot().status, "signed-in");
  assert.equal(signedIn.coordinator.getSnapshot().user?.id, "user-a");
  assert.equal(signedIn.coordinator.getSnapshot().verification, "failed");
});

test("terminal getUser failures clear a previously verified identity", async () => {
  const harness = createHarness();
  harness.client.userResults.push(
    Promise.resolve({ data: { user: { id: "user-a" } }, error: null }),
  );
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  harness.flushScheduled();
  await harness.coordinator.refresh();

  harness.client.userResults.push(
    Promise.resolve({
      data: { user: null },
      error: {
        code: "bad_jwt",
        message: "The session is no longer valid.",
        name: "AuthApiError",
        status: 401,
      },
    }),
  );
  await harness.coordinator.refresh();

  assert.deepEqual(harness.coordinator.getSnapshot(), {
    status: "verification-error",
    user: null,
    verification: "failed",
    verificationError: "The session is no longer valid.",
  });
});

test("initial, event, and manual refreshes share one in-flight verification", async () => {
  const harness = createHarness();
  const response = deferred<UserResult>();
  harness.client.userResults.push(response.promise);

  harness.coordinator.handleAuthEvent("INITIAL_SESSION", "user-a");
  const first = harness.coordinator.refresh();
  const second = harness.coordinator.refresh();
  harness.flushScheduled();
  assert.equal(harness.client.getUserCalls, 1);

  response.resolve({ data: { user: { id: "user-a" } }, error: null });
  await Promise.all([first, second]);
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-a");
});

test("local sign-out invalidates old refreshes and restores a verified identity only on a safe failure", async () => {
  const harness = createHarness();
  harness.client.userResults.push(
    Promise.resolve({ data: { user: { id: "user-a" } }, error: null }),
  );
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  harness.flushScheduled();
  await harness.coordinator.refresh();

  const staleRefresh = deferred<UserResult>();
  const failedSignOut = deferred<SignOutResult>();
  harness.client.userResults.push(staleRefresh.promise);
  harness.client.signOutResults.push(failedSignOut.promise);
  const refreshPromise = harness.coordinator.refresh();
  const signOutPromise = harness.coordinator.signOut();
  assert.deepEqual(
    harness.coordinator.getSnapshot(),
    {
      status: "loading",
      user: null,
      verification: "checking",
      verificationError: null,
    },
    "the verified identity is hidden before the sign-out request settles",
  );

  staleRefresh.resolve({ data: { user: { id: "user-a" } }, error: null });
  await refreshPromise;
  failedSignOut.resolve({ error: { message: "Could not sign out." } });
  assert.deepEqual(await signOutPromise, { error: "Could not sign out." });
  assert.deepEqual(harness.client.signOutCalls, [{ scope: "local" }]);
  assert.equal(harness.coordinator.getSnapshot().status, "signed-in");
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-a");
  assert.equal(harness.coordinator.getSnapshot().verification, "failed");

  const successfulSignOut = deferred<SignOutResult>();
  harness.client.signOutResults.push(successfulSignOut.promise);
  const successPromise = harness.coordinator.signOut();
  successfulSignOut.resolve({ error: null });
  assert.deepEqual(await successPromise, { error: null });
  assert.deepEqual(harness.coordinator.getSnapshot(), {
    status: "signed-out",
    user: null,
    verification: "verified",
    verificationError: null,
  });
});

test("a failed sign-out never promotes a degraded identity back to verified", async () => {
  const harness = createHarness();
  harness.client.userResults.push(
    Promise.resolve({ data: { user: { id: "user-a" } }, error: null }),
  );
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  harness.flushScheduled();
  await harness.coordinator.refresh();

  harness.client.userResults.push(
    Promise.resolve({
      data: { user: null },
      error: { message: "Auth service is temporarily unreachable." },
    }),
  );
  await harness.coordinator.refresh();
  assert.equal(harness.coordinator.getSnapshot().verification, "failed");

  harness.client.signOutResults.push(
    Promise.resolve({ error: { message: "Could not sign out." } }),
  );
  await harness.coordinator.signOut();

  assert.equal(harness.coordinator.getSnapshot().status, "signed-in");
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-a");
  assert.equal(harness.coordinator.getSnapshot().verification, "failed");
  assert.equal(
    harness.coordinator.getSnapshot().verificationError,
    "Could not sign out.",
  );
});

test("a failed sign-out cannot restore the old identity over a newer auth event", async () => {
  const harness = createHarness();
  harness.client.userResults.push(
    Promise.resolve({ data: { user: { id: "user-a" } }, error: null }),
  );
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  harness.flushScheduled();
  await harness.coordinator.refresh();

  const failedSignOut = deferred<SignOutResult>();
  const responseB = deferred<UserResult>();
  harness.client.signOutResults.push(failedSignOut.promise);
  harness.client.userResults.push(responseB.promise);
  const signOutPromise = harness.coordinator.signOut();

  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-b");
  harness.flushScheduled();
  responseB.resolve({ data: { user: { id: "user-b" } }, error: null });
  await harness.coordinator.refresh();
  failedSignOut.resolve({ error: { message: "Old sign-out failed." } });
  await signOutPromise;

  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-b");
  assert.equal(harness.coordinator.getSnapshot().status, "signed-in");
});

test("a failed sign-out during a new identity boundary never restores the prior account", async () => {
  const harness = createHarness();
  harness.client.userResults.push(
    Promise.resolve({ data: { user: { id: "user-a" } }, error: null }),
  );
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a");
  harness.flushScheduled();
  await harness.coordinator.refresh();

  const responseB = deferred<UserResult>();
  harness.client.userResults.push(responseB.promise);
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-b");
  assert.equal(harness.coordinator.getSnapshot().user, null);

  harness.client.signOutResults.push(
    Promise.resolve({ error: { message: "Could not sign out." } }),
  );
  assert.deepEqual(await harness.coordinator.signOut(), {
    error: "Could not sign out.",
  });

  assert.equal(harness.coordinator.getSnapshot().user, null);
  assert.equal(harness.coordinator.getSnapshot().status, "verification-error");
});

test("the installed Supabase client reports a fresh empty session without a network call, and guest saves remain enabled", async () => {
  const { createClient, AuthSessionMissingError } = await import("@supabase/supabase-js");
  const { deriveSavedCollegeViewState } = await import("../app/lib/saved-college-view-state.ts");
  let networkCalls = 0;
  const client = createClient("https://guest-regression.invalid", "sb_publishable_fresh_guest_fixture_not_a_real_key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => { networkCalls += 1; throw new Error("Unexpected network call in an empty-session regression test"); } },
  });
  const missing = await client.auth.getUser();
  assert.ok(missing.error instanceof AuthSessionMissingError);
  assert.equal(missing.error.status, 400);
  assert.equal(missing.data.user, null);
  const coordinator = createAuthStateCoordinator({ auth: client.auth, onChange() {}, schedule: (callback) => callback() });
  coordinator.handleAuthEvent("INITIAL_SESSION", null);
  await coordinator.refresh();
  assert.deepEqual(coordinator.getSnapshot(), { status: "signed-out", user: null, verification: "verified", verificationError: null });
  assert.equal(networkCalls, 0);
  const view = deriveSavedCollegeViewState({ authStatus: coordinator.getSnapshot().status, baseSource: "guest", guestImportCount: 0, hasPendingOutbox: false, knownIds: new Set([101]), remoteRead: "idle", renderedIds: [101], renderedScope: "guest", syncConfirmed: false });
  assert.equal(view.scopeKind, "guest");
  assert.equal(view.canMutate, true);
  assert.deepEqual(view.visibleIds, [101]);
  coordinator.dispose();
});

test("returned and thrown genuine missing-session errors classify as signed out while arbitrary 400 errors do not", async () => {
  const missing = { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" };
  for (const result of [Promise.resolve({ data: { user: null }, error: missing }), Promise.reject(missing)]) {
    const harness = createHarness(); harness.client.userResults.push(result);
    await harness.coordinator.refresh();
    assert.equal(harness.coordinator.getSnapshot().status, "signed-out");
    assert.equal(harness.coordinator.getSnapshot().verification, "verified");
  }
  for (const error of [{ name: "AuthApiError", status: 400, code: "bad_jwt", message: "Bad token" }, { name: "AuthRetryableFetchError", status: 503, message: "Offline" }, { name: "AuthSessionMissingError", status: 503, message: "Contradictory transport failure" }]) {
    const harness = createHarness(); harness.client.userResults.push(Promise.resolve({ data: { user: null }, error }));
    await harness.coordinator.refresh();
    assert.equal(harness.coordinator.getSnapshot().status, "verification-error");
  }
});

test("an old missing-session response cannot sign out a newer verified account", async () => {
  const harness = createHarness(); const old = deferred<UserResult>();
  harness.client.userResults.push(old.promise);
  const initial = harness.coordinator.refresh();
  harness.client.userResults.push(Promise.resolve({ data: { user: { id: "user-b" } }, error: null }));
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-b");
  harness.flushScheduled(); await harness.coordinator.refresh();
  old.resolve({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400, message: "Missing" } });
  await initial;
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-b");
});

test("exact deletion invalidation cancels pending work and cached future Auth events cannot revive the account", async () => {
  const harness = createHarness();
  harness.client.userResults.push(Promise.resolve({ data: { user: { id: "user-a" } }, error: null }));
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a"); harness.flushScheduled(); await harness.coordinator.refresh();
  const stale = deferred<UserResult>(); harness.client.userResults.push(stale.promise); const pending = harness.coordinator.refresh();
  assert.equal(harness.coordinator.invalidateDeletedAccount("user-a"), true);
  stale.resolve({ data: { user: { id: "user-a" } }, error: null }); await pending;
  for (const event of ["INITIAL_SESSION", "TOKEN_REFRESHED", "SIGNED_IN"] as const) {
    harness.coordinator.handleAuthEvent(event, "user-a"); harness.flushScheduled(); await harness.coordinator.refresh();
    assert.equal(harness.coordinator.getSnapshot().status, "signed-out");
    assert.equal(harness.coordinator.getSnapshot().user, null);
  }
  assert.equal(harness.client.getUserCalls, 2);
  assert.equal(harness.client.signOutCalls.length, 0, "exact local invalidation must not sign out whichever SDK session is current");
});

test("deletion of the old account preserves a newer pending account boundary", async () => {
  const harness = createHarness();
  harness.client.userResults.push(Promise.resolve({ data: { user: { id: "user-a" } }, error: null }));
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-a"); harness.flushScheduled(); await harness.coordinator.refresh();
  const next = deferred<UserResult>(); harness.client.userResults.push(next.promise);
  harness.coordinator.handleAuthEvent("SIGNED_IN", "user-b"); harness.flushScheduled();
  assert.equal(harness.coordinator.invalidateDeletedAccount("user-a"), false);
  next.resolve({ data: { user: { id: "user-b" } }, error: null }); await harness.coordinator.refresh();
  assert.equal(harness.coordinator.getSnapshot().user?.id, "user-b");
});

test("a persisted deletion receipt rejects both initial event identities and unseen getUser identities", async () => {
  const harness = createHarness(undefined, (id) => id === "deleted-user");
  harness.coordinator.handleAuthEvent("INITIAL_SESSION", "deleted-user"); harness.flushScheduled(); await harness.coordinator.refresh();
  assert.equal(harness.client.getUserCalls, 0);
  assert.equal(harness.coordinator.getSnapshot().status, "signed-out");
  harness.coordinator.handleAuthEvent("INITIAL_SESSION", null);
  harness.client.userResults.push(Promise.resolve({ data: { user: { id: "deleted-user" } }, error: null }));
  harness.flushScheduled(); await harness.coordinator.refresh();
  assert.equal(harness.coordinator.getSnapshot().status, "signed-out");
  assert.equal(harness.coordinator.getSnapshot().user, null);
});
