import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/app/lib/supabase/config";
import { adviserResponse } from "@/app/lib/adviser/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return adviserResponse({ message: "Retention is not configured." }, 503);
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return adviserResponse({ message: "Unauthorized." }, 401);
  const config = getSupabasePublicConfig();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config.configured || !key) return adviserResponse({ message: "Retention storage is unavailable." }, 503);
  try {
    const admin = createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.rpc("purge_expired_adviser_history").abortSignal(AbortSignal.timeout(20_000));
    if (error) throw new Error("Retention failed");
    return adviserResponse({ deletedConversations: data });
  } catch { return adviserResponse({ message: "Retention did not complete." }, 503); }
}
