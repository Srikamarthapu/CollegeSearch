"use client";

import {
  ArrowRight,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { AuthDialog } from "@/app/components/auth/AuthDialog";
import { resolveAuthConsumerState } from "@/app/components/auth/auth-consumer-state";
import { getAuthDisplayName, useAuth } from "@/app/components/auth/AuthProvider";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import styles from "./account.module.css";
import { DeleteAccountControl } from "./DeleteAccountControl";

export function AccountPageClient() {
  const {
    refreshUser,
    signOut,
    status,
    user,
    verification,
    verificationError,
  } = useAuth();
  const {
    accountCacheAvailable,
    canImportGuestSaves,
    guestImportCount,
    importGuestSaves,
    lastError,
    pendingCount,
    retrySync,
    syncPhase,
  } = useSavedColleges();
  const [signOutError, setSignOutError] = useState<{
    scope: string;
    text: string;
  } | null>(null);
  const decision = resolveAuthConsumerState({
    hasUser: Boolean(user),
    status,
    verification,
  });
  const currentScope = user?.id ?? status;
  const visibleSignOutError =
    signOutError?.scope === currentScope ? signOutError.text : null;

  async function handleSignOut() {
    const requestedScope = currentScope;
    setSignOutError(null);
    const result = await signOut();
    setSignOutError(
      result.error ? { scope: requestedScope, text: result.error } : null,
    );
  }

  function handleRetryVerification() {
    setSignOutError(null);
    void refreshUser();
  }

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.page}>
        <header className={styles.masthead}>
          <span className={styles.eyebrow}>Account and session</span>
          <h1>Your shortlist, wherever you go.</h1>
          <p>
            Keep your shortlist across devices. Research notes, your applicant
            profile, and deadlines stay in this browser.
          </p>
        </header>

        <section className={styles.card} aria-live="polite">
          {decision.state === "checking" ? (
            <div className={styles.state}>
              <KeyRound size={25} aria-hidden="true" />
              <h2>Checking your session…</h2>
            </div>
          ) : decision.state === "unavailable" ? (
            <div className={styles.state}>
              <ShieldCheck size={26} aria-hidden="true" />
              <h2>We couldn’t verify this account session.</h2>
              <p role="alert">
                {verificationError ??
                  "CollegeSearch is not showing account data until verification succeeds."}
              </p>
              <div className={styles.stateActions}>
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={handleRetryVerification}
                >
                  <RefreshCw size={16} aria-hidden="true" />
                  Retry verification
                </button>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={handleSignOut}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Clear this session
                </button>
              </div>
              {visibleSignOutError ? (
                <p className={styles.message} role="alert">
                  {visibleSignOutError}
                </p>
              ) : null}
            </div>
          ) : decision.hasLastVerifiedIdentity && user ? (
            <>
              <div className={styles.identity}>
                <span><UserRound size={22} aria-hidden="true" /></span>
                <div>
                  <small>
                    {decision.canUseAccount
                      ? "Signed in"
                      : "Last verified account"}
                  </small>
                  <h2>{getAuthDisplayName(user)}</h2>
                  {user.email ? <p>{user.email}</p> : null}
                </div>
              </div>
              <dl className={styles.details}>
                <div>
                  <dt>Sign-in status</dt>
                  <dd>
                    {decision.canUseAccount
                      ? "Account verified"
                      : decision.state === "last-verified-unavailable"
                        ? "Last verified identity — current check failed"
                        : "Checking current session"}
                  </dd>
                </div>
                <div>
                  <dt>Saved-list sync</dt>
                  <dd>
                    {!decision.canUseAccount
                      ? decision.state === "last-verified-unavailable"
                        ? "Paused until account verification succeeds"
                        : "Paused while the session is checked"
                      : syncPhase === "synced"
                      ? "Up to date"
                      : syncPhase === "loading-account"
                        ? "Checking account list"
                        : syncPhase === "syncing"
                          ? `Waiting to sync${pendingCount ? ` · ${pendingCount} pending` : ""}`
                          : syncPhase === "error"
                            ? accountCacheAvailable
                              ? "Needs attention — last complete browser copy retained"
                              : "Needs attention — complete list unavailable"
                            : "Browser only"}
                  </dd>
                </div>
                <div>
                  <dt>Academic profile</dt>
                  <dd>Optional and stored only in this browser; not synced to your account</dd>
                </div>
              </dl>
              {decision.canUseAccount && canImportGuestSaves ? <p className={styles.message}>Import moves these college saves into your account after sync succeeds, then removes them from the guest shortlist. Guest notes, your profile, and deadlines stay in this browser and are not imported.</p> : null}
              <div className={styles.actions}>
                {decision.canUseAccount && canImportGuestSaves ? (
                  <button type="button" onClick={() => void importGuestSaves()}>
                    Import {guestImportCount} browser {guestImportCount === 1 ? "save" : "saves"}
                  </button>
                ) : null}
                {decision.canUseAccount && syncPhase === "error" ? (
                  <button type="button" onClick={retrySync}>
                    Retry sync
                  </button>
                ) : null}
                {decision.state === "last-verified-unavailable" ? (
                  <button type="button" onClick={handleRetryVerification}>
                    <RefreshCw size={16} aria-hidden="true" />
                    Retry verification
                  </button>
                ) : null}
                <button type="button" onClick={handleSignOut}>
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
                {decision.canUseAccount ? (
                  <Link href="/auth/update-password">
                    Update password
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              {decision.state === "last-verified-unavailable" ? (
                <p className={styles.message} role="alert">
                  {verificationError ??
                    "Account verification needs another try. Account actions are paused."}
                </p>
              ) : null}
            </>
          ) : (
            <div className={styles.state}>
              <ShieldCheck size={26} aria-hidden="true" />
              <h2>
                {status === "unconfigured"
                  ? "Accounts are not connected in this preview."
                  : "You are not signed in."}
              </h2>
              <p>
                {status === "unconfigured"
                  ? "Accounts are not available here yet. You can still research colleges and keep a shortlist in this browser."
                  : "Sign in to sync your shortlist. Browser-only saves stay separate until you choose to import them."}
              </p>
              <AuthDialog onSignedIn={refreshUser}>
                <button type="button" className={styles.primaryAction}>
                  <KeyRound size={16} aria-hidden="true" />
                  Open sign in
                </button>
              </AuthDialog>
            </div>
          )}
          {decision.canUseAccount && lastError ? (
            <p className={styles.message} role="alert">{lastError}</p>
          ) : null}
          {visibleSignOutError && decision.state !== "unavailable" ? (
            <p className={styles.message} role="alert">{visibleSignOutError}</p>
          ) : null}
        </section>

        <DeleteAccountControl />
        <aside className={styles.note}>
          <ShieldCheck size={19} aria-hidden="true" />
          <p>
            College research, comparison, matching, and browser saves work
            without an account. On shared devices, sign out when you finish.
          </p>
          <Link href="/privacy">Read the privacy note</Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
