import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedCollegeRemoteStore } from "../saved-college-sync.ts";
import { normalizeSavedCollegeUserId } from "../saved-college-view-state.ts";
import { createVerifiedSupabaseDataClient } from "./verified-session.ts";

function throwSavedCollegeError(error: { message?: string } | null) {
  if (error) {
    throw new Error(error.message || "Saved-college request failed.");
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

  return {
    async listOwned(userId) {
      requireOwner(userId);
      const { data, error } = await supabase
        .from("saved_colleges")
        .select("unit_id")
        .eq("user_id", userId);
      throwSavedCollegeError(error);
      return (data ?? []).map((row) => row.unit_id);
    },

    async upsertOwned(userId, unitIds) {
      requireOwner(userId);
      if (unitIds.length === 0) return;
      const rows = unitIds.map((unitId) => ({
        unit_id: unitId,
        user_id: userId,
      }));
      const { error } = await supabase.from("saved_colleges").upsert(rows, {
        ignoreDuplicates: true,
        onConflict: "user_id,unit_id",
      });
      throwSavedCollegeError(error);
    },

    async removeOwned(userId, unitIds) {
      requireOwner(userId);
      if (unitIds.length === 0) return;
      const { error } = await supabase
        .from("saved_colleges")
        .delete()
        .eq("user_id", userId)
        .in("unit_id", [...unitIds]);
      throwSavedCollegeError(error);
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
