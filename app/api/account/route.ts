import { createClient } from "@supabase/supabase-js";
import { deleteCurrentAccount, type AccountDeletionServices } from "@/app/lib/account-deletion";
import { getSupabasePublicConfig } from "@/app/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  const config = getSupabasePublicConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  let services: AccountDeletionServices | null = null;
  try {
  if (config.configured && secret) {
    const admin = createClient(config.url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    services = {
      async verify(token) {
        const { data, error } = await admin.auth.getUser(token);
        if (error && error.status !== 401 && error.status !== 403) throw new Error("Account verification service unavailable");
        if (error || !data.user || data.user.is_anonymous) return null;
        const caller = createClient(config.url, config.publishableKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const session = await caller.rpc("account_session_active");
        if (session.error) throw new Error("Session verification service unavailable");
        return { id: data.user.id, active: session.data === true };
      },
      async revokeSessions(token) {
        const { error } = await admin.auth.admin.signOut(token, "global");
        return !error;
      },
      async deleteUser(id) {
        const { error } = await admin.auth.admin.deleteUser(id);
        return !error;
      },
    };
  }
  } catch {
    services = null;
  }
  return deleteCurrentAccount(request, services);
}
