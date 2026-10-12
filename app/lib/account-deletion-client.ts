export const DELETE_REQUEST_TIMEOUT_MS = 30_000;
export const DELETE_CLEANUP_WAIT_MS = 10_000;

/** A failed acquisition has no right to release another operation's freeze. */
export function acquireDeletionFreeze(
  scope: string,
  freeze: (scope: string) => boolean,
  unfreeze: (scope: string) => void,
): (() => void) | null {
  if (!freeze(scope)) return null;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unfreeze(scope);
  };
}

/** Stops waiting in the UI; the already-confirmed erasure continues safely. */
export async function waitForAccountCleanup<T>(
  cleanup: Promise<T>,
  timeoutMs = DELETE_CLEANUP_WAIT_MS,
): Promise<{ status: "finished"; result: T } | { status: "waiting" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ status: "waiting" }>((resolve) => {
    timer = setTimeout(() => resolve({ status: "waiting" }), timeoutMs);
  });
  try {
    return await Promise.race([
      cleanup.then((result) => ({ status: "finished" as const, result })),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
