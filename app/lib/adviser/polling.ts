type PollLoopOptions = {
  isVisible(): boolean;
  setTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
};

export class AdviserApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    status: number,
    message: string,
    code?: string,
  ) {
    super(message);
    this.name = "AdviserApiError";
    this.status = status;
    this.code = code;
  }
}

export class AdviserSessionVerificationError extends Error {
  constructor(message = "Your adviser sign-in could not be verified.") {
    super(message);
    this.name = "AdviserSessionVerificationError";
  }
}

export type PollErrorDisposition = "unauthorized" | "verify-session" | "missing" | "retry" | "rejected";
export type AdviserAuthIssue = { userId: string; kind: "unauthorized" | "verification"; message: string };
export type PendingJobIdentity = { requestId: string };

export function isAdviserAuthIssueForUser(issue: AdviserAuthIssue | null, userId: string): issue is AdviserAuthIssue {
  return issue?.userId === userId;
}

export function canRetryAdviserVerification(issue: AdviserAuthIssue | null, userId: string): boolean {
  return isAdviserAuthIssueForUser(issue, userId) && issue.kind === "verification";
}

export function copyPendingJobForRetry<T extends PendingJobIdentity>(current: T | null): T | null {
  return current ? { ...current } : null;
}

export function classifyPollError(error: unknown): PollErrorDisposition {
  if (error instanceof AdviserSessionVerificationError) return "verify-session";
  if (!(error instanceof AdviserApiError)) return "retry";
  if (error.status === 401) return "unauthorized";
  if (error.status === 404) return "missing";
  if (error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500) return "retry";
  if (error.status >= 400 && error.status < 500) return "rejected";
  return "retry";
}

export function isCurrentPendingRequest({ requestId, revisionAtStart, currentRequestId, currentRevision }: {
  requestId: string;
  revisionAtStart: number;
  currentRequestId: string | null;
  currentRevision: number;
}): boolean {
  return requestId === currentRequestId && revisionAtStart === currentRevision;
}

/** Restore a 404'd draft only when this history response cleared exactly the request it observed. */
export function shouldRestoreMissingRequest({
  requestId,
  responseRequestId,
  requestIdAtStart,
  requestIdAfterResponse,
  revisionAtStart,
  revisionAfterResponse,
  currentRequestId,
  currentRevision,
  applied,
}: {
  requestId: string;
  responseRequestId: string | null;
  requestIdAtStart: string | null;
  requestIdAfterResponse: string | null;
  revisionAtStart: number;
  revisionAfterResponse: number;
  currentRequestId: string | null;
  currentRevision: number;
  applied: boolean;
}): boolean {
  return applied && responseRequestId === null && requestIdAtStart === requestId &&
    requestIdAfterResponse === null && currentRequestId === null &&
    revisionAfterResponse === revisionAtStart + 1 && currentRevision === revisionAfterResponse;
}

/** Apply a history result only if the pending state read at request start is still current. */
export function reconcilePendingHistory<T extends PendingJobIdentity>({
  current,
  incoming,
  revisionAtStart,
  currentRevision,
  requestIdAtStart,
  clearMissingRequest = false,
  isSuppressed = () => false,
}: {
  current: T | null;
  incoming: T | null;
  revisionAtStart: number;
  currentRevision: number;
  requestIdAtStart: string | null;
  clearMissingRequest?: boolean;
  isSuppressed?: (requestId: string) => boolean;
}): { value: T | null; applied: boolean } {
  if (revisionAtStart !== currentRevision || (current?.requestId ?? null) !== requestIdAtStart) {
    return { value: current, applied: false };
  }
  if (incoming && isSuppressed(incoming.requestId)) return { value: current, applied: false };
  if (!incoming && current && !clearMissingRequest) return { value: current, applied: false };
  return { value: incoming, applied: true };
}

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
