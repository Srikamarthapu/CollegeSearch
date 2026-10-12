import { createHash } from "node:crypto";
import type { AdviserPreferences } from "./contracts.ts";
import type { AdviserAnswer } from "./engine.ts";

export const adviserConsentVersion = "2026-10-04";
export const adviserUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AdviserUsage = { limit: number; used: number; remaining: number; resetsAt: string };
export type AdviserReservation = {
  status: "queued" | "completed" | "unauthorized" | "conflict" | "deleted" | "pending" | "expired" | "busy" | "quota" | "retry-limit" | "capacity" | "failed";
  conversationId?: string; answer?: AdviserAnswer;
};
export type AdviserTurnServices = {
  enabled: boolean;
  enqueue(input: { requestId: string; conversationId: string | null; bodyHash: string; message: string }): Promise<AdviserReservation>;
  usage(): Promise<AdviserUsage>;
};
export type AdviserWorkerServices = {
  enabled: boolean;
  preferences(conversationId: string): Promise<AdviserPreferences>;
  previousRecommendationIds(conversationId: string): Promise<number[]>;
  generate(message: string, preferences: AdviserPreferences, signal: AbortSignal, previousRecommendationIds: number[]): Promise<{ answer: AdviserAnswer; inputTokens: number; outputTokens: number }>;
  complete(input: { requestId: string; leaseId: string; message: string; answer: AdviserAnswer; inputTokens: number; outputTokens: number }): Promise<boolean>;
  retry(input: { userId: string; requestId: string; leaseId: string; failureCode: "worker_failed" | "session" | "conversation" }): Promise<unknown>;
};
export function adviserResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
function error(status: number, message: string, code: string) { return adviserResponse({ message, code }, status); }

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("Invalid content type");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0; let text = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > 16000) { await reader.cancel(); throw new Error("Request too large"); }
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally { reader.releaseLock(); }
}

/** Identity and quota services are bound to the verified caller, never a posted user ID. */
export async function handleAdviserTurn(request: Request, services: AdviserTurnServices | null): Promise<Response> {
  if (request.method !== "POST") return error(405, "Use the adviser message form.", "method");
  if (request.headers.get("origin") !== new URL(request.url).origin) return error(403, "Open CollegeSearch to send a message.", "origin");
  if (!services) return error(401, "Sign in again to use your adviser history.", "auth");
  if (!services.enabled) return error(503, "The adviser is not available yet. Your college search and saved list still work.", "disabled");
  let body: { requestId: string; conversationId: string | null; message: string };
  try {
    const value = await readBoundedJson(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid message");
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["requestId", "conversationId", "message", "consentVersion"].includes(key)) ||
        typeof input.requestId !== "string" || !adviserUuidPattern.test(input.requestId) ||
        (input.conversationId !== null && (typeof input.conversationId !== "string" || !adviserUuidPattern.test(input.conversationId))) ||
        typeof input.message !== "string" || !input.message.trim() || input.message.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.message) ||
        input.consentVersion !== adviserConsentVersion) throw new Error("Invalid message");
    body = { requestId: input.requestId, conversationId: input.conversationId as string | null, message: input.message.trim() };
  } catch { return error(400, "Check your message and the privacy consent, then try again.", "invalid"); }
  try {
    const bodyHash = createHash("sha256").update(JSON.stringify([body.conversationId, body.message])).digest("hex");
    const reservation = await services.enqueue({ ...body, bodyHash });
    if (reservation.status === "completed" && reservation.answer && reservation.conversationId) {
      return adviserResponse({ requestId: body.requestId, conversationId: reservation.conversationId, answer: reservation.answer, usage: await services.usage() });
    }
    if (reservation.status === "queued" && reservation.conversationId) {
      return adviserResponse({ requestId: body.requestId, conversationId: reservation.conversationId, status: "queued" }, 202);
    }
    const messages: Partial<Record<AdviserReservation["status"], [number, string]>> = {
      unauthorized: [401, "Sign in again before sending a message."],
      conflict: [409, "This request changed while sending. Start a new message."],
      deleted: [410, "That conversation was deleted or expired. Start a new conversation."],
      expired: [409, "This request is from an earlier allowance period. Start a new message."],
      pending: [409, "That message is still being processed. Wait a moment before retrying."],
      busy: [409, "Another message is being processed for your account. Wait for it to finish."],
      quota: [429, "You've used this month's adviser allowance. Your history and free college tools remain available."],
      "retry-limit": [429, "There have been too many attempts this month. Your history and free college tools remain available."],
      capacity: [503, "The adviser has reached its current service limit. Your draft and free college tools remain available."],
      failed: [503, "The adviser couldn't process that message. Your draft and free college tools remain available."],
    };
    const [status, message] = messages[reservation.status] ?? [503, "The adviser could not start this request."];
    return error(status, message, reservation.status);
  } catch {
    return error(503, "The adviser couldn't queue that message. Your draft is preserved; retry shortly.", "unavailable");
  }
}
