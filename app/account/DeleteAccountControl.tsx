"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import { acquireDeletionFreeze, DELETE_REQUEST_TIMEOUT_MS, waitForAccountCleanup } from "@/app/lib/account-deletion-client";
import { eraseAccountBrowserData } from "@/app/lib/account-browser-erasure";
import { useForgetAccountData } from "@/app/components/AccountErasureCoordinator";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { captureVerifiedSupabaseSession } from "@/app/lib/supabase/verified-session";
import styles from "./account.module.css";

export function DeleteAccountControl() {
  const { user, verification } = useAuth();
  const { freezeAccountScope, unfreezeAccountScope } = useSavedColleges();
  const forgetScope = useForgetAccountData();
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState({ scope: "", value: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = useRef(user?.id ?? null);
  useLayoutEffect(() => { current.current = user?.id ?? null; }, [user?.id]);

  async function remove() {
    const target = user?.id;
    const client = getSupabaseBrowserClient();
    if (!target || !client || verification !== "verified" || (confirmation.scope !== target || confirmation.value !== "DELETE") || busy) return;
    setBusy(true);
    setMessage("");
    let deleted = false;
    let releaseFreeze: (() => void) | null = null;
    try {
      const session = await captureVerifiedSupabaseSession(client, target);
      if (current.current !== target || !(releaseFreeze = acquireDeletionFreeze(target, freezeAccountScope, unfreezeAccountScope))) {
        setMessage("Your account changed while we checked it. Open this control again for the account you want to delete.");
        return;
      }
      const response = await fetch("/api/account", {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
        signal: AbortSignal.timeout(DELETE_REQUEST_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${session.accessToken}`, "X-CollegeSearch-Confirm-Delete": "delete-my-account" },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        setMessage(result?.message || "We could not confirm deletion. Your browser research is retained. Sign in again to check your account before retrying.");
        return;
      }
      deleted = true;
      setMessage("The selected account and synced shortlist were deleted. Clearing this browser’s local copies…");
      const outcome = await waitForAccountCleanup(eraseAccountBrowserData(target, { forgetScope }));
      setConfirmation({ scope: "", value: "" });
      setExpanded(false);
      if (outcome.status === "waiting") {
        setMessage("The selected account and synced shortlist were deleted. Browser cleanup has not finished yet. Close other CollegeSearch tabs and clear this site’s browser data to remove remaining local copies. Downloaded copies need separate cleanup.");
        return;
      }
      setMessage(outcome.result.status === "complete"
        ? "Your account and synced shortlist were deleted. This account’s research in this browser was cleared. Guest research and other accounts were kept. Remove downloaded copies separately."
        : "Your account and synced shortlist were deleted. Some browser storage could not be cleared. Close other CollegeSearch tabs and clear this site’s browser data to remove any remaining local copies. Downloaded copies and other devices need separate cleanup.");
    } catch {
      setMessage(deleted ? "Your account and synced shortlist were deleted. Browser cleanup did not finish; close other CollegeSearch tabs and clear this site’s browser data to remove remaining local copies." : "We could not confirm the result. Your browser research is retained. Sign in again to check the account before retrying.");
    } finally {
      if (!deleted) releaseFreeze?.();
      setBusy(false);
    }
  }

  return (
    <section className={styles.deleteAccount} aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">Delete your account</h2>
      <p>This permanently removes your login and synced shortlist, and revokes all account sessions. It clears this account’s notes, profile, and deadlines from this browser when storage is accessible. Other tabs clear their local drafts when they resume. Download anything you want to keep first.</p>
      {user && verification === "verified" ? expanded ? (
        <form onSubmit={(event) => { event.preventDefault(); void remove(); }}>
          <label htmlFor="delete-account-confirmation">Type DELETE to confirm</label>
          <input id="delete-account-confirmation" value={confirmation.scope === user.id ? confirmation.value : ""} onChange={(event) => setConfirmation({ scope: user.id, value: event.target.value })} autoComplete="off" disabled={busy} />
          <div className={styles.stateActions}>
            <button type="submit" className={styles.dangerAction} disabled={confirmation.scope !== user.id || confirmation.value !== "DELETE" || busy}>{busy ? "Deleting account…" : "Permanently delete my account"}</button>
            <button type="button" className={styles.secondaryAction} disabled={busy} onClick={() => { setExpanded(false); setConfirmation({ scope: "", value: "" }); }}>Cancel</button>
          </div>
        </form>
      ) : <button type="button" className={styles.secondaryAction} onClick={() => setExpanded(true)}>Review account deletion</button> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
