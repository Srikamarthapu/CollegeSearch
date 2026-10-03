import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedCollegeRemoteStore } from "../saved-college-sync.ts";
import { normalizeSavedCollegeUserId } from "../saved-college-view-state.ts";
import { createVerifiedSupabaseDataClient } from "./verified-session.ts";

function throwSavedCollegeError(error: { message?: string } | null) {
  if (error) {
    throw new Error(error.message || "Saved-college request failed.");
  }
}

export class SavedCollegeSessionUnavailableError extends Error {
  constructor() {
    super("The saved-college session is no longer active or could not be verified.");
    this.name = "SavedCollegeSessionUnavailableError";
  }
}

export function createSupabaseSavedCollegeStore(
  supabase: SupabaseClient,
  boundUserId: string,
): SavedCollegeRemoteStore {
  const owner = normalizeSavedCollegeUserId(boundUserId);
  if (!owner) throw new Error("A verified saved-college owner is required.");

  function requireOwner(userId: string) {
    if (normalizeSavedCollegeUserId(userId) !== owner) {
      throw new Error("The saved-college account scope changed.");
    }
  }

  async function requireActiveSession() {
    // This RPC uses the same captured JWT as the query. RLS denies revoked
    // sessions with empty reads/zero-row deletes, not necessarily an error.
    try {
      const { data, error } = await supabase.rpc("account_session_active");
      if (error || data !== true) throw new SavedCollegeSessionUnavailableError();
    } catch {
      throw new SavedCollegeSessionUnavailableError();
    }
  }

  return {
    async listOwned(userId) {
      requireOwner(userId);
      await requireActiveSession();
      const { data, error } = await supabase
        .from("saved_colleges")
        .select("unit_id")
        .eq("user_id", userId);
      throwSavedCollegeError(error);
      // Also catch revocation during the query before publishing its snapshot.
      await requireActiveSession();
      return (data ?? []).map((row) => row.unit_id);
    },

    async upsertOwned(userId, unitIds) {
      requireOwner(userId);
      if (unitIds.length === 0) return;
      await requireActiveSession();
      const rows = unitIds.map((unitId) => ({
        unit_id: unitId,
        user_id: userId,
      }));
      const { error } = await supabase.from("saved_colleges").upsert(rows, {
        ignoreDuplicates: true,
        onConflict: "user_id,unit_id",
      });
      throwSavedCollegeError(error);
      await requireActiveSession();
    },

    async removeOwned(userId, unitIds) {
      requireOwner(userId);
      if (unitIds.length === 0) return;
      await requireActiveSession();
      const { error } = await supabase
        .from("saved_colleges")
        .delete()
        .eq("user_id", userId)
        .in("unit_id", [...unitIds]);
      throwSavedCollegeError(error);
      await requireActiveSession();
    },
  };
}

export async function createVerifiedSupabaseSavedCollegeStore(
  source: SupabaseClient,
  expectedUserId: string,
) {
  const dataClient = await createVerifiedSupabaseDataClient(
    source,
    expectedUserId,
  );
  return createSupabaseSavedCollegeStore(dataClient, expectedUserId);
}
