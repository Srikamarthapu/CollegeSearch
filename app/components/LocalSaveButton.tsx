"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useEffect, useState } from "react";

import {
  readSavedCollegeIds,
  subscribeToSavedCollegeChanges,
  writeSavedCollegeIds,
} from "@/app/lib/local-saves";

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
  const [isSaved, setIsSaved] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const syncFromStorage = () => {
      const result = readSavedCollegeIds();
      if (cancelled) return;
      setIsSaved(result.ids.includes(unitId));
      setStorageAvailable(result.storageAvailable);
    };

    queueMicrotask(syncFromStorage);
    const unsubscribe = subscribeToSavedCollegeChanges(syncFromStorage);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [unitId]);

  const toggleSaved = () => {
    const current = readSavedCollegeIds();
    if (!current.storageAvailable) {
      setStorageAvailable(false);
      return;
    }

    const next = current.ids.includes(unitId)
      ? current.ids.filter((id) => id !== unitId)
      : [...current.ids, unitId];
    const result = writeSavedCollegeIds(next);

    setStorageAvailable(result.storageAvailable);
    if (result.persisted) setIsSaved(result.ids.includes(unitId));
  };

  const unavailable = storageAvailable === false;
  const label = unavailable
    ? "Save unavailable"
    : isSaved
      ? "Saved locally"
      : "Save locally";

  return (
    <button
      type="button"
      className={["save-button", isSaved ? "is-active" : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        unavailable
          ? `Browser-local saves are unavailable for ${collegeName}`
          : isSaved
            ? `Remove ${collegeName} from colleges saved on this device`
            : `Save ${collegeName} on this device`
      }
      aria-pressed={isSaved}
      disabled={unavailable}
      title="Saved colleges stay in this browser; account sync is not active."
      onClick={toggleSaved}
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
