export type QueueJobLease = { userId: string; requestId: string; leaseId: string };

export class AdviserQueueGateClosedError extends Error {
  constructor() {
    super("Adviser worker gate is closed.");
    this.name = "AdviserQueueGateClosedError";
  }
}

type QueueStatus = "disabled" | "busy" | "idle" | "completed" | "retried" | "failed";

/** Runs one job through injected storage/provider operations so lease behavior can be tested without a live provider. */
export async function processOneQueuedAdviserJob<Job extends QueueJobLease, Generated>(services: {
  enabled(): boolean;
  pause(): Promise<unknown>;
  acquire(): Promise<string | null>;
  claim(workerLeaseId: string): Promise<Job | null>;
  generate(job: Job): Promise<Generated>;
  complete(job: Job, generated: Generated): Promise<boolean>;
  retry(job: Job): Promise<unknown>;
  release(workerLeaseId: string): Promise<unknown>;
}): Promise<{ status: QueueStatus }> {
  const pause = async () => { try { await services.pause(); } catch { /* The closed provider gate is authoritative if pause storage is unavailable. */ } };
  if (!services.enabled()) {
    await pause();
    return { status: "disabled" };
  }

  const workerLeaseId = await services.acquire();
  if (!workerLeaseId) return { status: "busy" };
  try {
    const job = await services.claim(workerLeaseId);
    if (!job) return { status: "idle" };
    if (!services.enabled()) {
      await pause();
      return { status: "disabled" };
    }
    try {
      const generated = await services.generate(job);
      if (!await services.complete(job, generated)) throw new Error("The adviser job became stale before persistence.");
      return { status: "completed" };
    } catch (cause) {
      if (cause instanceof AdviserQueueGateClosedError) {
        await pause();
        return { status: "disabled" };
      }
      try {
        const retry = await services.retry(job);
        return (retry as { status?: unknown })?.status === "failed" ? { status: "failed" } : { status: "retried" };
      } catch {
        // The database lease expires and recovers the job when retry storage is unavailable.
        return { status: "retried" };
      }
    }
  } finally {
    try { await services.release(workerLeaseId); } catch { /* The global worker lease expires if storage is unavailable. */ }
  }
}
