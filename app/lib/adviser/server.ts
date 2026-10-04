import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { collegeDataset } from "../college-data";
import releaseMarker from "@/data/college-knowledge-release.json";
import { getSupabasePublicConfig } from "../supabase/config";
import { nvidiaConfigFromEnv, createNvidiaProvider } from "./nvidia";
import { createKnowledgeRetriever } from "./retrieval";
import { runAdviserTurn } from "./engine";
import { adviserUuidPattern, type AdviserReservation, type AdviserTurnServices, type AdviserUsage } from "./service";

export type AdviserPublicStatus = { available: boolean; monthlyAllowance: number | null; catalogCount: number };
function configuredLimit(value: string | undefined, max: number) {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= max ? number : null;
}
export function getAdviserPublicStatus(): AdviserPublicStatus {
  try {
    const provider = nvidiaConfigFromEnv();
    const allowance = configuredLimit(process.env.ADVISER_MONTHLY_ALLOWANCE, 1000);
    const global = configuredLimit(process.env.ADVISER_GLOBAL_MONTHLY_ATTEMPTS, 100000);
    const available = provider.mode === "production" && provider.productionAuthorized && !!provider.apiKey?.trim() &&
      process.env.ADVISER_EVALUATION_PASSED === "true" && !!allowance && !!global &&
      !!process.env.SUPABASE_SECRET_KEY?.trim() && getSupabasePublicConfig().configured &&
      (process.env.CRON_SECRET?.length ?? 0) >= 32;
    return { available, monthlyAllowance: available ? allowance : null, catalogCount: collegeDataset.colleges.length };
  } catch { return { available: false, monthlyAllowance: null, catalogCount: collegeDataset.colleges.length }; }
}
const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init,
  signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000),
});
export type VerifiedAdviserAccount = { userId: string; sessionId: string; caller: SupabaseClient; admin: SupabaseClient };

export async function verifyAdviserAccount(request: Request): Promise<VerifiedAdviserAccount | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  const config = getSupabasePublicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!token || token.length > 10000 || !config.configured || !secret) return null;
  const caller = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: boundedFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const verified = await caller.auth.getUser(token);
  if (verified.error || !verified.data.user || verified.data.user.is_anonymous) return null;
  // Decode only after server verification; the database also binds this session to the verified user.
  let claims: { sub?: unknown; session_id?: unknown };
  try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); } catch { return null; }
  if (claims.sub !== verified.data.user.id || typeof claims.session_id !== "string" || !adviserUuidPattern.test(claims.session_id)) return null;
  const active = await caller.rpc("account_session_active");
  if (active.error || active.data !== true) return null;
  const admin = createClient(config.url, secret, {
    global: { fetch: boundedFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { userId: verified.data.user.id, sessionId: claims.session_id, caller, admin };
}

export function adviserPeriod(now = new Date()) {
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    reset: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString() };
}

export async function readAdviserUsage(account: VerifiedAdviserAccount): Promise<AdviserUsage> {
  const limit = getAdviserPublicStatus().monthlyAllowance ?? 0;
  const period = adviserPeriod();
  const { data, error } = await account.caller.from("adviser_usage_periods").select("successful_count").eq("user_id", account.userId).eq("period_start", period.start).maybeSingle();
  if (error) throw new Error("Allowance unavailable.");
  const used = typeof data?.successful_count === "number" ? data.successful_count : 0;
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: period.reset };
}

export function createAdviserTurnServices(account: VerifiedAdviserAccount): AdviserTurnServices {
  const status = getAdviserPublicStatus();
  async function serverRpc(name: string, parameters: Record<string, unknown>) {
    const { data, error } = await account.admin.rpc(name, parameters);
    if (error) throw new Error("Adviser storage is unavailable.");
    return data;
  }
  return {
    enabled: status.available,
    reserve: async ({ requestId, conversationId, bodyHash }) => await serverRpc("reserve_adviser_request", {
      p_user_id: account.userId, p_session_id: account.sessionId, p_request_id: requestId,
      p_conversation_id: conversationId, p_body_hash: bodyHash, p_free_limit: status.monthlyAllowance,
      p_global_limit: configuredLimit(process.env.ADVISER_GLOBAL_MONTHLY_ATTEMPTS, 100000),
    }) as AdviserReservation,
    async preferences(conversationId) {
      const { data, error } = await account.caller.from("adviser_conversations").select("preferences").eq("id", conversationId).single();
      if (error || !data) throw new Error("Conversation unavailable.");
      return data.preferences;
    },
    async generate(message, preferences, signal) {
      const config = nvidiaConfigFromEnv();
      const provider = createNvidiaProvider(config);
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
      const answer = await runAdviserTurn(message, preferences, { dataset: collegeDataset, retrieve, generate: async (system, input, abort) => {
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
    async release(requestId, leaseId) { await serverRpc("release_adviser_request", { p_user_id: account.userId, p_request_id: requestId, p_lease_id: leaseId }); },
    usage: () => readAdviserUsage(account),
  };
}
