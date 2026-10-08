import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { normalizeSavedCollegeUserId } from "../saved-college-view-state.ts";
import { getSupabasePublicConfig } from "./config.ts";

export type CapturedVerifiedSupabaseSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

function verifiedSessionError() {
  return new Error("The active Supabase account could not be bound safely.");
}

/**
 * Captures one server-verified identity and the matching local session. Both
 * reads must agree with the caller's expected UUID; a concurrent account
 * switch therefore fails closed instead of returning another user's token.
 */
export async function captureVerifiedSupabaseSession(
  source: SupabaseClient,
  expectedUserId: string,
): Promise<CapturedVerifiedSupabaseSession> {
  const normalizedExpected = normalizeSavedCollegeUserId(expectedUserId);
  if (!normalizedExpected) throw verifiedSessionError();

  const verified = await source.auth.getUser();
  if (
    verified.error ||
    normalizeSavedCollegeUserId(verified.data.user?.id) !== normalizedExpected
  ) {
    throw verifiedSessionError();
  }

  const local = await source.auth.getSession();
  const session = local.data.session;
  if (
    local.error ||
    !session ||
    normalizeSavedCollegeUserId(session.user.id) !== normalizedExpected ||
    typeof session.access_token !== "string" ||
    session.access_token.length === 0 ||
    typeof session.refresh_token !== "string" ||
    session.refresh_token.length === 0
  ) {
    throw verifiedSessionError();
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    userId: normalizedExpected,
  };
}

function requirePublicConfig() {
  const config = getSupabasePublicConfig();
  if (!config.configured) throw verifiedSessionError();
  return config;
}

/** Creates a PostgREST client whose JWT cannot change with the shared Auth client. */
export async function createVerifiedSupabaseDataClient(
  source: SupabaseClient,
  expectedUserId: string,
) {
  const session = await captureVerifiedSupabaseSession(source, expectedUserId);
  const config = requirePublicConfig();
  return createClient(config.url, config.publishableKey, {
    accessToken: async () => session.accessToken,
    db: { timeout: 15_000 },
  });
}

/**
 * Creates a non-persisted Auth client bound to the captured account. Password
 * mutation then uses this isolated session rather than whichever account the
 * shared browser client happens to hold after an auth race.
 */
export async function createVerifiedSupabaseMutationClient(
  source: SupabaseClient,
  expectedUserId: string,
) {
  const session = await captureVerifiedSupabaseSession(source, expectedUserId);
  const config = requirePublicConfig();
  const isolated = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: `college-search-transient-${session.userId}`,
    },
  });
  const established = await isolated.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (
    established.error ||
    normalizeSavedCollegeUserId(established.data.user?.id) !== session.userId
  ) {
    throw verifiedSessionError();
  }
  return isolated;
}
