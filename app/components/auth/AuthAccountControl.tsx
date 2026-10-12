"use client";

import { LogIn, LogOut, RefreshCw, ShieldAlert, UserRound } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { resolveAuthConsumerState } from "./auth-consumer-state";
import { AuthDialog } from "./AuthDialog";
import { getAuthDisplayName, useAuth } from "./AuthProvider";
import styles from "./auth.module.css";

export function AuthAccountControl() {
  const {
    refreshUser,
    signOut,
    status,
    user,
    verification,
    verificationError,
  } = useAuth();
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

  if (decision.state === "checking") {
    return <span className={styles.accountSkeleton} aria-label="Checking account" />;
  }

  if (decision.state === "unavailable") {
    return (
      <details className={styles.accountMenu}>
        <summary
          className={styles.accountSummary}
          aria-label="Account verification unavailable. Open account details."
        >
          <span className={styles.avatar} aria-hidden="true">
            <ShieldAlert size={16} />
          </span>
          <span>Account unavailable</span>
        </summary>
        <div className={styles.accountPopover}>
          <span className={styles.accountKicker}>Account verification</span>
          <strong>We couldn’t verify this session.</strong>
          <Link href="/account">Account settings</Link>
          <p role="alert">
            {verificationError ??
              "CollegeSearch is not showing account data until verification succeeds."}
          </p>
          <button type="button" onClick={handleRetryVerification}>
            <RefreshCw size={16} aria-hidden="true" />
            Retry verification
          </button>
          <button type="button" onClick={handleSignOut}>
            <LogOut size={16} aria-hidden="true" />
            Clear this session
          </button>
          {visibleSignOutError ? <p role="alert">{visibleSignOutError}</p> : null}
        </div>
      </details>
    );
  }

  if (
    decision.state === "unconfigured" ||
    decision.state === "verified-signed-out"
  ) {
    return (
      <AuthDialog onSignedIn={refreshUser}>
        <button
          className={styles.accountTrigger}
          type="button"
          aria-label="Sign in to CollegeSearch"
        >
          <LogIn size={16} aria-hidden="true" />
          <span className={styles.accountTriggerLabel}>Sign in</span>
        </button>
      </AuthDialog>
    );
  }

  if (!user) {
    return <span className={styles.accountSkeleton} aria-label="Account unavailable" />;
  }

  const displayName = getAuthDisplayName(user);
  const initial = displayName.charAt(0).toUpperCase();
  const isVerified = decision.state === "verified-signed-in";
  const isDegraded = decision.state === "last-verified-unavailable";

  return (
    <details className={styles.accountMenu}>
      <summary className={styles.accountSummary} aria-label={`Account menu for ${displayName}`}>
        <span className={styles.avatar} aria-hidden="true">
          {initial || <UserRound size={16} />}
        </span>
        <span>{displayName}</span>
      </summary>
      <div className={styles.accountPopover}>
        <span className={styles.accountKicker}>
          {verification === "verified"
            ? "Signed in as"
            : "Last verified account"}
        </span>
        <strong>{displayName}</strong>
        <Link href="/account">Account settings</Link>
        {user.email ? <small>{user.email}</small> : null}
        {!isVerified ? (
          <>
            <p role={isDegraded ? "alert" : "status"}>
              {isDegraded
                ? verificationError ?? "Account verification needs another try."
                : "Checking this session…"}
            </p>
            {isDegraded ? (
              <button type="button" onClick={handleRetryVerification}>
                <RefreshCw size={16} aria-hidden="true" />
                Retry verification
              </button>
            ) : null}
          </>
        ) : null}
        <button type="button" onClick={handleSignOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
        {visibleSignOutError ? <p role="alert">{visibleSignOutError}</p> : null}
      </div>
    </details>
  );
}
