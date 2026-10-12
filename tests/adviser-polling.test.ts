import assert from "node:assert/strict";
import test from "node:test";
import { createPollLoop } from "../app/lib/adviser/polling.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("visibility changes cannot start a second status read while one is in flight", async () => {
  const visible = true;
  let nextTimer = 0;
  let polls = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const pending = deferred<boolean>();
  const loop = createPollLoop(async () => { polls += 1; return await pending.promise; }, {
    isVisible: () => visible,
    setTimer: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (timer) => { timers.delete(timer as unknown as number); },
  });

  loop.start();
  assert.equal(timers.size, 1);
  const firstTimer = timers.values().next().value!;
  timers.clear();
  firstTimer.callback();
  await Promise.resolve();
  assert.equal(polls, 1);

  loop.visibilityChanged();
  loop.visibilityChanged();
  assert.equal(timers.size, 0);
  assert.equal(polls, 1);

  pending.resolve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.size, 1);
  assert.equal(timers.values().next().value?.delay, 1800);
  loop.stop();
  assert.equal(timers.size, 0);
});

test("hidden pages pause scheduled reads and resume with a single timer", () => {
  let visible = true;
  let nextTimer = 0;
  const timers = new Map<number, () => void>();
  const loop = createPollLoop(async () => true, {
    isVisible: () => visible,
    setTimer: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimer: (timer) => { timers.delete(timer as unknown as number); },
  });
  loop.start();
  visible = false;
  loop.visibilityChanged();
  assert.equal(timers.size, 0);
  visible = true;
  loop.visibilityChanged();
  assert.equal(timers.size, 1);
  loop.stop();
});
