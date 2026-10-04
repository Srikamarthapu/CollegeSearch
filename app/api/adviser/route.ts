import { adviserResponse, adviserUuidPattern, handleAdviserTurn } from "@/app/lib/adviser/service";
import { createAdviserTurnServices, getAdviserPublicStatus, readAdviserUsage, verifyAdviserAccount } from "@/app/lib/adviser/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const account = await verifyAdviserAccount(request);
    return handleAdviserTurn(request, account ? createAdviserTurnServices(account) : null);
  } catch { return adviserResponse({ message: "Account verification is temporarily unavailable. Your draft has not changed.", code: "unavailable" }, 503); }
}

export async function GET(request: Request) {
  try {
    const account = await verifyAdviserAccount(request);
    if (!account) return adviserResponse({ message: "Sign in to view your adviser history.", code: "auth" }, 401);
    const url = new URL(request.url);
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
    const { data, error } = await account.caller.from("adviser_conversations").select("id,title,updated_at,expires_at").order("updated_at", { ascending: false }).range(offset, offset + 49);
    if (error) throw new Error("History unavailable");
    return adviserResponse({ conversations: data, nextOffset: data.length === 50 ? offset + 50 : null, usage: await readAdviserUsage(account), status: getAdviserPublicStatus() });
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
