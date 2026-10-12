import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVED_COLLEGE_ACCOUNT_LOCK_PREFIX,
  SavedCollegeCoordinationUnavailableError,
  savedCollegeUserLockName,
  withSavedCollegeAccountLock,
  type SavedCollegeLockManager,
} from "../app/lib/saved-college-lock.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

class SerialLockManager implements SavedCollegeLockManager {
  names: string[] = [];
  #tails = new Map<string, Promise<unknown>>();

  request<T>(
    name: string,
    _options: { mode: "exclusive" },
    callback: () => Promise<T> | T,
  ) {
    this.names.push(name);
    const prior = this.#tails.get(name) ?? Promise.resolve();
    const next = prior.then(callback, callback);
    this.#tails.set(name, next.catch(() => undefined));
    return next;
  }
}

test("account lock names are canonical and reject unverified identifiers", () => {
  assert.equal(
    savedCollegeUserLockName(USER_ID.toUpperCase()),
    `${SAVED_COLLEGE_ACCOUNT_LOCK_PREFIX}${USER_ID}`,
  );
  assert.throws(
    () => savedCollegeUserLockName("not-a-user"),
    /valid verified user ID/i,
  );
});

test("same-account work is serialized across concurrent callers", async () => {
  const manager = new SerialLockManager();
  const firstMayFinish = deferred<void>();
  const events: string[] = [];

  const first = withSavedCollegeAccountLock(
    USER_ID,
    async () => {
      events.push("first:start");
      await firstMayFinish.promise;
      events.push("first:end");
      return 1;
    },
    manager,
  );
  const second = withSavedCollegeAccountLock(
    USER_ID,
    async () => {
      events.push("second:start");
      events.push("second:end");
      return 2;
    },
    manager,
  );

  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  firstMayFinish.resolve();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
  ]);
});

test("remote mutation is rejected when the browser has no lock manager", async () => {
  let called = false;
  await assert.rejects(
    withSavedCollegeAccountLock(
      USER_ID,
      () => {
        called = true;
      },
      null,
    ),
    SavedCollegeCoordinationUnavailableError,
  );
  assert.equal(called, false);
});
