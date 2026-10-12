"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";

type LocalSaveButtonProps = {
  unitId: number;
  collegeName: string;
  className?: string;
};

export function LocalSaveButton({
  unitId,
  collegeName,
  className,
}: LocalSaveButtonProps) {
  const {
    canMutate,
    ids,
    storageAvailable,
    syncPhase,
    toggleSaved,
  } = useSavedColleges();
  const isSaved = ids.includes(unitId);
  const accountSyncActive = syncPhase !== "local-only";
  const label = isSaved
    ? "Saved"
    : accountSyncActive
      ? "Save"
      : "Save locally";
  const locationLabel = accountSyncActive
    ? "this browser and your account when sync completes"
    : "this browser";

  return (
    <button
      type="button"
      className={["save-button", isSaved ? "is-active" : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        isSaved
          ? `Remove ${collegeName} from colleges saved in ${locationLabel}`
          : `Save ${collegeName} in ${locationLabel}`
      }
      aria-pressed={isSaved}
      disabled={!canMutate}
      title={
        !canMutate
          ? accountSyncActive
            ? "Checking which account saved list is active."
            : "Saved colleges stay in this browser; account sync is not active."
          : accountSyncActive
          ? syncPhase === "error"
            ? "Saved on this browser. Account sync needs attention."
            : "Saved on this browser and synchronized when your account is connected."
          : storageAvailable
            ? "Saved colleges stay in this browser until you explicitly import them after signing in."
            : "Browser storage is unavailable; this save lasts for this tab."
      }
      onClick={() => toggleSaved(unitId)}
    >
      {isSaved ? (
        <BookmarkCheck size={15} aria-hidden="true" />
      ) : (
        <Bookmark size={15} aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
