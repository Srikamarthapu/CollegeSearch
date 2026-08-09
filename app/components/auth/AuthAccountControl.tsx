"use client";

import { LogIn, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { AuthDialog } from "./AuthDialog";
import { getAuthDisplayName, useAuth } from "./AuthProvider";
import styles from "./auth.module.css";

export function AuthAccountControl() {
  const { refreshUser, signOut, status, user } = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (status === "loading") {
    return <span className={styles.accountSkeleton} aria-label="Checking account" />;
  }

  if (status !== "signed-in" || !user) {
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

  const displayName = getAuthDisplayName(user);
  const initial = displayName.charAt(0).toUpperCase();

  async function handleSignOut() {
    setSignOutError(null);
    const result = await signOut();
    setSignOutError(result.error);
  }

  return (
    <details className={styles.accountMenu}>
      <summary className={styles.accountSummary}>
        <span className={styles.avatar} aria-hidden="true">
          {initial || <UserRound size={16} />}
        </span>
        <span>{displayName}</span>
      </summary>
      <div className={styles.accountPopover}>
        <span className={styles.accountKicker}>Signed in as</span>
        <strong>{displayName}</strong>
        {user.email ? <small>{user.email}</small> : null}
        <button type="button" onClick={handleSignOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
        {signOutError ? <p role="alert">{signOutError}</p> : null}
      </div>
    </details>
  );
}
