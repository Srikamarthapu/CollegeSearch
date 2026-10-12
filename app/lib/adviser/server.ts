import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "../supabase/config";
import { adviserUuidPattern, type AdviserReservation, type AdviserTurnServices, type AdviserUsage } from "./service";

import { configuredLimit, getAdviserPublicStatus } from "./public-status";
export { getAdviserPublicStatus } from "./public-status";
export type { AdviserPublicStatus } from "./public-status";

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
    enqueue: async ({ requestId, conversationId, bodyHash, message }) => await serverRpc("enqueue_adviser_request", {
      p_user_id: account.userId, p_session_id: account.sessionId, p_request_id: requestId,
      p_conversation_id: conversationId, p_body_hash: bodyHash, p_message: message, p_free_limit: status.monthlyAllowance,
      p_global_limit: configuredLimit(process.env.ADVISER_GLOBAL_MONTHLY_ATTEMPTS, 100000),
    }) as AdviserReservation,
    usage: () => readAdviserUsage(account),
  };
}

export function createAdviserAdmin() {
  const config = getSupabasePublicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config.configured || !secret) throw new Error("Adviser storage is unavailable.");
  return createClient(config.url, secret, {
    global: { fetch: boundedFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
