"use client";

import { ArrowRight, KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { AuthDialog } from "@/app/components/auth/AuthDialog";
import { getAuthDisplayName, useAuth } from "@/app/components/auth/AuthProvider";
import styles from "./account.module.css";

export function AccountPageClient() {
  const { refreshUser, signOut, status, user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignOut() {
    const result = await signOut();
    setMessage(result.error ?? "You have been signed out.");
  }

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.page}>
        <header className={styles.masthead}>
          <span className={styles.eyebrow}>Account and session</span>
          <h1>A clear boundary for your account.</h1>
          <p>
            Authentication can identify you, but this release does not claim to
            sync saved colleges or store an academic profile.
          </p>
        </header>

        <section className={styles.card} aria-live="polite">
          {status === "loading" ? (
            <div className={styles.state}>
              <KeyRound size={25} aria-hidden="true" />
              <h2>Checking your session…</h2>
            </div>
          ) : status === "signed-in" && user ? (
            <>
              <div className={styles.identity}>
                <span><UserRound size={22} aria-hidden="true" /></span>
                <div>
                  <small>Signed in</small>
                  <h2>{getAuthDisplayName(user)}</h2>
                  {user.email ? <p>{user.email}</p> : null}
                </div>
              </div>
              <dl className={styles.details}>
                <div>
                  <dt>Authentication</dt>
                  <dd>Verified Supabase session</dd>
                </div>
                <div>
                  <dt>Saved-list sync</dt>
                  <dd>Not active — saves remain on this device</dd>
                </div>
                <div>
                  <dt>Academic profile</dt>
                  <dd>Not collected or stored in this release</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <button type="button" onClick={handleSignOut}>
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
                <Link href="/auth/update-password">
                  Update password
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
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
                  ? "The interface is ready, but this deployment still needs its Supabase project and Google provider configuration."
                  : "Sign in with email or Google when the provider is available. Your local saved list remains usable either way."}
              </p>
              <AuthDialog onSignedIn={refreshUser}>
                <button type="button" className={styles.primaryAction}>
                  <KeyRound size={16} aria-hidden="true" />
                  Open sign in
                </button>
              </AuthDialog>
            </div>
          )}
          {message ? <p className={styles.message} role="status">{message}</p> : null}
        </section>

        <aside className={styles.note}>
          <ShieldCheck size={19} aria-hidden="true" />
          <p>
            College research, comparison, matching, and local saves work
            without an account. Signing in currently manages identity only.
          </p>
          <Link href="/privacy">Read the privacy note</Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
