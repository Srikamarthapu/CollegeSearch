import { after } from "next/server";
import { adviserResponse, adviserUuidPattern, handleAdviserTurn } from "@/app/lib/adviser/service";
import { createAdviserTurnServices, getAdviserPublicStatus, readAdviserUsage, verifyAdviserAccount } from "@/app/lib/adviser/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const account = await verifyAdviserAccount(request);
    const response = await handleAdviserTurn(request, account ? createAdviserTurnServices(account) : null);
    if (response.status === 202) {
      after(async () => { try { const { processOneAdviserJob } = await import("@/app/lib/adviser/worker"); await processOneAdviserJob(); } catch { /* The database scheduler is the durable recovery path. */ } });
    }
    return response;
  } catch { return adviserResponse({ message: "Account verification is temporarily unavailable. Your draft has not changed.", code: "unavailable" }, 503); }
}

export async function GET(request: Request) {
  try {
    const account = await verifyAdviserAccount(request);
    if (!account) return adviserResponse({ message: "Sign in to view your adviser history.", code: "auth" }, 401);
    const url = new URL(request.url);
    const requestId = url.searchParams.get("requestId");
    if (requestId) {
      if (!adviserUuidPattern.test(requestId)) return adviserResponse({ message: "Invalid adviser request.", code: "invalid" }, 400);
      const { data, error } = await account.admin.from("adviser_requests")
        .select("request_id,conversation_id,status,worker_started_at,response")
        .eq("user_id", account.userId).eq("request_id", requestId).maybeSingle();
      if (error) throw new Error("Adviser status unavailable");
      if (!data) return adviserResponse({ message: "That adviser request is unavailable.", code: "not-found" }, 404);
      const status = data.status === "completed" ? "completed" : data.status === "deleted" ? "deleted" :
        data.status === "failed" ? "failed" : data.worker_started_at ? "running" : "queued";
      if (status === "completed") {
        const conversation = await account.caller.from("adviser_conversations").select("id")
          .eq("id", data.conversation_id).eq("user_id", account.userId).gt("expires_at", new Date().toISOString()).maybeSingle();
        if (conversation.error) throw new Error("Adviser status unavailable");
        if (!conversation.data) return adviserResponse({ requestId, conversationId: null, status: "deleted" });
      }
      return adviserResponse({ requestId, conversationId: data.conversation_id, status,
        ...(status === "completed" ? { answer: data.response } : {}) });
    }
    const conversationId = url.searchParams.get("conversationId");
    if (conversationId && !adviserUuidPattern.test(conversationId)) return adviserResponse({ message: "Invalid conversation.", code: "invalid" }, 400);
    const offsetText = url.searchParams.get("offset") ?? "0";
    if (!/^\d+$/.test(offsetText) || Number(offsetText) > 10000) return adviserResponse({ message: "Invalid history page." }, 400);
    const offset = Number(offsetText);
    if (conversationId) {
      const { data: conversation, error } = await account.caller.from("adviser_conversations").select("id,title,updated_at,expires_at").eq("id", conversationId).maybeSingle();
      if (error) throw new Error("History unavailable");
      if (!conversation) return adviserResponse({ message: "That conversation is unavailable or expired.", code: "deleted" }, 404);
      const messages = await account.caller.from("adviser_messages").select("id,role,payload,created_at,request_id").eq("conversation_id", conversationId).order("created_at", { ascending: false }).order("role", { ascending: true }).range(offset, offset + 99);
      if (messages.error) throw new Error("History unavailable");
      return adviserResponse({ conversation, messages: [...messages.data].reverse(), nextOffset: messages.data.length === 100 ? offset + 100 : null });
    }
    const [history, pending, usage] = await Promise.all([
      account.caller.from("adviser_conversations").select("id,title,updated_at,expires_at").order("updated_at", { ascending: false }).range(offset, offset + 49),
      account.admin.from("adviser_requests").select("request_id,conversation_id,prompt,worker_started_at")
        .eq("user_id", account.userId).eq("status", "pending").not("prompt", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      readAdviserUsage(account),
    ]);
    if (history.error) throw new Error("History unavailable");
    if (pending.error) throw new Error("Adviser status unavailable");
    let pendingJob = null;
    if (pending.data) {
      const validConversation = await account.caller.from("adviser_conversations").select("id")
        .eq("id", pending.data.conversation_id).eq("user_id", account.userId)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (validConversation.error) throw new Error("Adviser status unavailable");
      if (validConversation.data) pendingJob = { requestId: pending.data.request_id, conversationId: pending.data.conversation_id,
        message: pending.data.prompt, status: pending.data.worker_started_at ? "running" as const : "queued" as const };
    }
    return adviserResponse({ conversations: history.data, nextOffset: history.data.length === 50 ? offset + 50 : null,
      pendingJob, usage, status: getAdviserPublicStatus() });
  } catch { return adviserResponse({ message: "Your adviser history is temporarily unavailable. Try again shortly.", code: "unavailable" }, 503); }
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return adviserResponse({ message: "Open CollegeSearch to delete history." }, 403);
  if (request.headers.get("x-collegesearch-delete-history") !== "delete-history") return adviserResponse({ message: "Confirm history deletion in the adviser." }, 400);
  try {
    const account = await verifyAdviserAccount(request);
    if (!account) return adviserResponse({ message: "Sign in again to delete history.", code: "auth" }, 401);
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (conversationId && !adviserUuidPattern.test(conversationId)) return adviserResponse({ message: "Invalid conversation." }, 400);
    let query = account.caller.from("adviser_conversations").delete().eq("user_id", account.userId);
    if (conversationId) query = query.eq("id", conversationId);
    const { error } = await query;
    if (error) throw new Error("Deletion unavailable");
    return adviserResponse({ message: conversationId ? "Conversation deleted." : "Adviser history deleted." });
  } catch { return adviserResponse({ message: "History could not be deleted. Try again shortly." }, 503); }
}
