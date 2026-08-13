"use client";

import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { resolveAuthConsumerState } from "@/app/components/auth/auth-consumer-state";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { createVerifiedSupabaseMutationClient } from "@/app/lib/supabase/verified-session";
import styles from "./auth-page.module.css";

export function UpdatePasswordForm() {
  const router = useRouter();
  const {
    refreshUser,
    status,
    user,
    verification,
    verificationError,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const decision = resolveAuthConsumerState({
    hasUser: Boolean(user),
    status,
    verification,
  });
  const currentAuthRef = useRef({
    canUseAccount: decision.canUseAccount,
    userId: user?.id ?? null,
  });

  useEffect(() => {
    currentAuthRef.current = {
      canUseAccount: decision.canUseAccount,
      userId: user?.id ?? null,
    };
  }, [decision.canUseAccount, user?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activeAuth = currentAuthRef.current;
    if (!activeAuth.canUseAccount || !activeAuth.userId) {
      setMessage(
        "Password changes are paused until CollegeSearch verifies this account.",
      );
      return;
    }

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");

    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The two passwords do not match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase setup is not complete yet.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const passwordClient = await createVerifiedSupabaseMutationClient(
        supabase,
        activeAuth.userId,
      );
      if (
        !currentAuthRef.current.canUseAccount ||
        currentAuthRef.current.userId !== activeAuth.userId
      ) {
        return;
      }

      const { data, error } = await passwordClient.auth.updateUser({ password });
      if (currentAuthRef.current.userId !== activeAuth.userId) return;

      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.user?.id !== activeAuth.userId) {
        setMessage(
          "CollegeSearch could not confirm which account received the password update.",
        );
        return;
      }

      setSuccess(true);
      window.setTimeout(() => router.replace("/"), 1000);
    } catch {
      if (currentAuthRef.current.userId === activeAuth.userId) {
        setMessage(
          "CollegeSearch could not update the password. Check your connection and try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (
    decision.state === "checking" ||
    decision.state === "checking-last-verified"
  ) {
    return (
      <main id="main-content" className={styles.page}>
        <section className={styles.card} aria-live="polite">
          <LoaderCircle className={styles.spinner} size={25} />
          <h1>Checking your account session…</h1>
          <p>Password changes stay paused until this check finishes.</p>
        </section>
      </main>
    );
  }

  if (
    decision.state === "unavailable" ||
    decision.state === "last-verified-unavailable"
  ) {
    return (
      <main id="main-content" className={styles.page}>
        <section className={styles.card} aria-live="polite">
          <span className={styles.icon} aria-hidden="true">
            <ShieldAlert size={24} />
          </span>
          <span className={styles.eyebrow}>Account verification</span>
          <h1>Password changes are paused.</h1>
          <p role="alert">
            {verificationError ??
              "CollegeSearch could not verify this account session."}
          </p>
          <div className={styles.stateActions}>
            <button
              className={styles.primaryLink}
              type="button"
              onClick={() => void refreshUser()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Retry verification
            </button>
            <Link className={styles.secondaryLink} href="/account">
              Return to account
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (decision.state === "unconfigured") {
    return (
      <main id="main-content" className={styles.page}>
        <section className={styles.card}>
          <span className={styles.icon} aria-hidden="true">
            <KeyRound size={24} />
          </span>
          <span className={styles.eyebrow}>Password update</span>
          <h1>Accounts are not connected yet.</h1>
          <p>
            This deployment still needs its Supabase project configuration
            before it can update an account password.
          </p>
          <Link className={styles.primaryLink} href="/">
            Return to CollegeSearch
          </Link>
        </section>
      </main>
    );
  }

  if (decision.state === "verified-signed-out") {
    return (
      <main id="main-content" className={styles.page}>
        <section className={styles.card}>
          <span className={styles.icon} aria-hidden="true">
            <KeyRound size={24} />
          </span>
          <span className={styles.eyebrow}>Password reset</span>
          <h1>Open a current reset link first.</h1>
          <p>
            Request a new password reset from the sign-in window, then open the
            email link in this browser.
          </p>
          <Link className={styles.primaryLink} href="/">
            Return to CollegeSearch
          </Link>
        </section>
      </main>
    );
  }

  if (!decision.canUseAccount || !user) return null;

  return (
    <main id="main-content" className={styles.page}>
      <section className={styles.card} aria-labelledby="update-password-title">
        <span className={styles.icon} aria-hidden="true">
          {success ? <Check size={24} /> : <KeyRound size={24} />}
        </span>
        <span className={styles.eyebrow}>Secure your account</span>
        <h1 id="update-password-title">
          {success ? "Password updated." : "Choose a new password."}
        </h1>
        <p>
          {success
            ? "You’re all set. Returning to CollegeSearch…"
            : "Use a unique password with at least 8 characters."}
        </p>

        {!success ? (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label>
              <span>New password</span>
              <span className={styles.passwordInput}>
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            <label>
              <span>Confirm new password</span>
              <span className={styles.passwordInput}>
                <input
                  name="confirmation"
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </span>
            </label>
            {message ? <p className={styles.error} role="alert">{message}</p> : null}
            <button
              className={styles.submit}
              type="submit"
              disabled={busy || !decision.canUseAccount}
            >
              {busy ? <LoaderCircle className={styles.spinner} size={18} /> : null}
              Update password
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
