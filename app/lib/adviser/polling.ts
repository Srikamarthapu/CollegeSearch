type PollLoopOptions = {
  isVisible(): boolean;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
};

/** A visibility-aware single-flight poll loop. Return false from poll to stop after the current request. */
export function createPollLoop(poll: () => Promise<boolean>, options: PollLoopOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let stopped = false;
  let keepPolling = true;
  let delay = options.initialDelayMs ?? 1200;
  const maxDelay = options.maxDelayMs ?? 5000;
  const factor = options.factor ?? 1.5;

  function schedule() {
    if (stopped || !keepPolling || !options.isVisible() || timer || inFlight) return;
    timer = options.setTimer(() => {
      timer = undefined;
      void run();
    }, delay);
  }

  async function run() {
    if (stopped || !keepPolling || inFlight || !options.isVisible()) return;
    inFlight = true;
    try {
      keepPolling = await poll();
      delay = Math.min(maxDelay, Math.round(delay * factor));
    } catch {
      // A status read failure is transient; retain the durable job and continue with backoff.
      delay = Math.min(maxDelay, Math.round(delay * factor));
    } finally {
      inFlight = false;
      schedule();
    }
  }

  return {
    start: schedule,
    visibilityChanged() {
      if (!options.isVisible() && timer) {
        options.clearTimer(timer);
        timer = undefined;
      } else schedule();
    },
    stop() {
      stopped = true;
      if (timer) options.clearTimer(timer);
      timer = undefined;
    },
  };
}
