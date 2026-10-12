import { collegeDataset } from "../college-data";
import releaseMarker from "@/data/college-knowledge-release.json";
import { nvidiaConfigFromEnv, createNvidiaProvider, createNvidiaRequestBudget } from "./nvidia";
import { createKnowledgeRetriever } from "./retrieval";
import { runAdviserTurn, type AdviserAnswer } from "./engine";
import { emptyAdviserPreferences, parseAdviserPreferences, type AdviserPreferences } from "./contracts";
import { adviserUuidPattern, type AdviserWorkerServices } from "./service";
import { AdviserQueueGateClosedError, processOneQueuedAdviserJob } from "./queue-orchestrator";
import { getAdviserPublicStatus } from "./public-status";
import { createAdviserAdmin, type VerifiedAdviserAccount } from "./server";

export type AdviserQueueJob = {
  userId: string;
  sessionId: string;
  requestId: string;
  conversationId: string;
  leaseId: string;
  message: string;
  preferences: unknown;
  previousRecommendations: unknown;
};

export function createAdviserWorkerServices(account: VerifiedAdviserAccount, job: AdviserQueueJob): AdviserWorkerServices {
  const status = getAdviserPublicStatus();
  async function serverRpc(name: string, parameters: Record<string, unknown>) {
    const { data, error } = await account.admin.rpc(name, parameters).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw new Error("Adviser storage is unavailable.");
    return data;
  }
  const storedPreferences = job.preferences;
  const preferences = storedPreferences && typeof storedPreferences === "object" && !Array.isArray(storedPreferences) && Object.keys(storedPreferences).length
    ? parseAdviserPreferences(storedPreferences) : emptyAdviserPreferences;
  const previousRecommendationIds = Array.isArray(job.previousRecommendations)
    ? job.previousRecommendations.slice(0, 4).flatMap((recommendation) => {
      if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) return [];
      const unitId = (recommendation as Record<string, unknown>).unitId;
      return Number.isSafeInteger(unitId) && Number(unitId) > 0 ? [Number(unitId)] : [];
    }) : [];
  return {
    enabled: status.available,
    preferences: async () => preferences,
    previousRecommendationIds: async () => previousRecommendationIds,
    async generate(message: string, preferences: AdviserPreferences, signal: AbortSignal, previousRecommendationIds: number[]) {
      const config = nvidiaConfigFromEnv();
      const provider = createNvidiaProvider(config, fetch, { requestBudget: createNvidiaRequestBudget(6) });
      let inputTokens = 0; let outputTokens = 0;
      const retrieve = createKnowledgeRetriever(collegeDataset, releaseMarker.releaseId, async (name, parameters, abort) => {
        const call = account.caller.rpc(name, parameters);
        const { data, error } = await (abort ? call.abortSignal(abort) : call);
        if (error) throw new Error("Verified college evidence is unavailable.");
        return data;
      }, { model: config.embeddingModel, modelVersion: config.embeddingModelVersion, query: async (text, abort) => {
        const result = await provider.embed(text, "query", abort);
        inputTokens += result.usage.promptTokens ?? result.usage.totalTokens ?? 0;
        return result;
      } });
      const answer = await runAdviserTurn(message, preferences, { dataset: collegeDataset, retrieve, previousRecommendationIds, generate: async (system, input, abort) => {
        const result = await provider.generateWithUsage(system, input, abort);
        inputTokens += result.usage.promptTokens ?? 0; outputTokens += result.usage.completionTokens ?? 0;
        return result.value;
      } }, signal);
      return { answer, inputTokens, outputTokens };
    },
    async complete({ requestId, leaseId, message, answer, inputTokens, outputTokens }) {
      return await serverRpc("complete_adviser_request", { p_user_id: account.userId, p_session_id: account.sessionId,
        p_request_id: requestId, p_lease_id: leaseId, p_message: message, p_answer: answer,
        p_preferences: answer.preferences, p_input_tokens: inputTokens, p_output_tokens: outputTokens }) === true;
    },
    async retry({ userId, requestId, leaseId, failureCode }) {
      return await serverRpc("retry_adviser_request", { p_user_id: userId, p_request_id: requestId, p_lease_id: leaseId, p_failure_code: failureCode });
    },
  };
}

/** Processes at most one durable job. Called after enqueue and by the authenticated worker route. */
export async function processOneAdviserJob(): Promise<{ status: "disabled" | "busy" | "idle" | "completed" | "retried" | "failed" }> {
  const admin = createAdviserAdmin();
  return await processOneQueuedAdviserJob<AdviserQueueJob, { answer: AdviserAnswer; inputTokens: number; outputTokens: number; services: AdviserWorkerServices }>({
    enabled: () => getAdviserPublicStatus().available,
    pause: async () => await admin.rpc("pause_adviser_queue_dispatch", { p_seconds: 300 }).abortSignal(AbortSignal.timeout(10_000)),
    acquire: async () => {
      const acquired = await admin.rpc("acquire_adviser_queue_worker").abortSignal(AbortSignal.timeout(10_000));
      if (acquired.error) throw new Error("Adviser queue is unavailable.");
      return typeof acquired.data === "string" && adviserUuidPattern.test(acquired.data) ? acquired.data : null;
    },
    claim: async (workerLeaseId) => {
      const claimed = await admin.rpc("claim_adviser_request", { p_worker_lease_id: workerLeaseId }).abortSignal(AbortSignal.timeout(10_000));
      if (claimed.error) throw new Error("Adviser queue is unavailable.");
      if (!claimed.data || typeof claimed.data !== "object" || Array.isArray(claimed.data)) return null;
      const raw = claimed.data as Record<string, unknown>;
      if (typeof raw.userId !== "string" || typeof raw.sessionId !== "string" || typeof raw.requestId !== "string" ||
        typeof raw.conversationId !== "string" || typeof raw.leaseId !== "string" || typeof raw.message !== "string" ||
        !adviserUuidPattern.test(raw.userId) || !adviserUuidPattern.test(raw.sessionId) || !adviserUuidPattern.test(raw.requestId) ||
        !adviserUuidPattern.test(raw.conversationId) || !adviserUuidPattern.test(raw.leaseId)) {
        throw new Error("Adviser queue returned an invalid job.");
      }
      return { ...raw, userId: raw.userId, sessionId: raw.sessionId, requestId: raw.requestId,
        conversationId: raw.conversationId, leaseId: raw.leaseId, message: raw.message } as AdviserQueueJob;
    },
    generate: async (job) => {
      const account: VerifiedAdviserAccount = { userId: job.userId, sessionId: job.sessionId, caller: admin, admin };
      const services = createAdviserWorkerServices(account, job);
      if (!services.enabled) throw new AdviserQueueGateClosedError();
      const signal = AbortSignal.timeout(95_000);
      const preferences = await services.preferences(job.conversationId);
      const previousRecommendationIds = await services.previousRecommendationIds(job.conversationId);
      const generated = await services.generate(job.message, preferences, signal, previousRecommendationIds);
      signal.throwIfAborted();
      return { ...generated, services };
    },
    complete: async (job, generated) => await generated.services.complete({ requestId: job.requestId, leaseId: job.leaseId, message: job.message,
      answer: generated.answer, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens }),
    retry: async (job) => {
      const { data, error } = await admin.rpc("retry_adviser_request", { p_user_id: job.userId, p_request_id: job.requestId,
        p_lease_id: job.leaseId, p_failure_code: "worker_failed" }).abortSignal(AbortSignal.timeout(10_000));
      if (error) throw new Error("Adviser retry is unavailable.");
      return data;
    },
    release: async (workerLeaseId) => await admin.rpc("release_adviser_queue_worker", { p_worker_lease_id: workerLeaseId }).abortSignal(AbortSignal.timeout(10_000)),
  });
}
