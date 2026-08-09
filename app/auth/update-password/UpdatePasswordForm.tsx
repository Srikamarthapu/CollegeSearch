"use client";

import { Check, Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import styles from "./auth-page.module.css";

export function UpdatePasswordForm() {
  const router = useRouter();
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess(true);
    window.setTimeout(() => router.replace("/"), 1000);
  }

  if (status === "loading") {
    return (
      <main id="main-content" className={styles.page}>
        <section className={styles.card} aria-live="polite">
          <LoaderCircle className={styles.spinner} size={25} />
          <h1>Checking your reset link…</h1>
        </section>
      </main>
    );
  }

  if (status !== "signed-in") {
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
            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? <LoaderCircle className={styles.spinner} size={18} /> : null}
              Update password
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
