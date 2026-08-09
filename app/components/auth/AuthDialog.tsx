"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import Image from "next/image";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { getSupabasePublicConfig } from "@/app/lib/supabase/config";
import styles from "./auth.module.css";

type AuthMode = "forgot" | "sign-in" | "sign-up";

type Notice = {
  kind: "error" | "success";
  text: string;
} | null;

export function AuthDialog({
  children,
  onSignedIn,
}: {
  children: ReactNode;
  onSignedIn?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [showPassword, setShowPassword] = useState(false);
  const formId = useId();
  const config = getSupabasePublicConfig();

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice(null);
    setShowPassword(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setBusy(false);
      setNotice(null);
      setShowPassword(false);
    }
  }

  async function handleGoogleSignIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice({ kind: "error", text: "Supabase setup is not complete yet." });
      return;
    }

    setBusy(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setBusy(false);
      setNotice({ kind: "error", text: error.message });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice({ kind: "error", text: "Supabase setup is not complete yet." });
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const fullName = String(formData.get("fullName") ?? "").trim();

    setBusy(true);
    setNotice(null);

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/recovery-callback`,
      });
      setBusy(false);
      if (error) {
        setNotice({ kind: "error", text: error.message });
      } else {
        setNotice({
          kind: "success",
          text: "If that address has an account, a reset link is on its way.",
        });
      }
      return;
    }

    if (mode === "sign-up") {
      if (password.length < 8) {
        setBusy(false);
        setNotice({
          kind: "error",
          text: "Use at least 8 characters for your password.",
        });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: fullName ? { full_name: fullName } : undefined,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setBusy(false);
      if (error) {
        setNotice({ kind: "error", text: error.message });
      } else if (data.session) {
        onSignedIn?.();
        setOpen(false);
      } else {
        setNotice({
          kind: "success",
          text: "Check your inbox to confirm your email and finish creating your account.",
        });
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setNotice({
        kind: "error",
        text: "That email and password combination did not work.",
      });
      return;
    }

    onSignedIn?.();
    setOpen(false);
  }

  const title =
    mode === "sign-up"
      ? "Create your account"
      : mode === "forgot"
        ? "Reset your password"
        : "Welcome back";
  const description =
    mode === "sign-up"
      ? "Create an account for sign-in. Saved colleges stay in this browser and are not synced."
      : mode === "forgot"
        ? "We’ll email you a secure link to choose a new password."
        : "Sign in to your account. Saved colleges stay in this browser and are not synced.";

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-lenis-prevent>
          <div className={styles.dialogTopline} aria-hidden="true" />
          <Dialog.Close className={styles.closeButton} aria-label="Close sign in">
            <X size={18} />
          </Dialog.Close>

          <div className={styles.dialogHeader}>
            <span className={styles.eyebrow}>CollegeSearch account</span>
            <Dialog.Title className={styles.title}>{title}</Dialog.Title>
            <Dialog.Description className={styles.description}>
              {description}
            </Dialog.Description>
          </div>

          {!config.configured ? (
            <div className={styles.setupPanel} role="status">
              <LockKeyhole size={22} aria-hidden="true" />
              <div>
                <strong>Accounts are not available in this preview yet.</strong>
                <p>
                  You can still search, compare, and save colleges on this
                  device.
                </p>
              </div>
            </div>
          ) : (
            <>
              {mode !== "forgot" ? (
                <>
                  <button
                    className={styles.googleButton}
                    type="button"
                    disabled={busy}
                    onClick={handleGoogleSignIn}
                  >
                    {busy ? (
                      <LoaderCircle className={styles.spinner} size={18} />
                    ) : (
                      <Image
                        className={styles.googleLogo}
                        src="/google-g.png"
                        alt=""
                        aria-hidden="true"
                        width={18}
                        height={18}
                        unoptimized
                      />
                    )}
                    Continue with Google
                  </button>
                  <div className={styles.divider}>
                    <span>or use email</span>
                  </div>
                </>
              ) : null}

              <form
                id={formId}
                className={styles.form}
                onSubmit={handleSubmit}
              >
                {mode === "sign-up" ? (
                  <label className={styles.field}>
                    <span>Name</span>
                    <span className={styles.inputWrap}>
                      <UserRound size={17} aria-hidden="true" />
                      <input
                        name="fullName"
                        type="text"
                        autoComplete="name"
                        placeholder="Your name"
                      />
                    </span>
                  </label>
                ) : null}

                <label className={styles.field}>
                  <span>Email</span>
                  <span className={styles.inputWrap}>
                    <Mail size={17} aria-hidden="true" />
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      required
                    />
                  </span>
                </label>

                {mode !== "forgot" ? (
                  <label className={styles.field}>
                    <span>Password</span>
                    <span className={styles.inputWrap}>
                      <LockKeyhole size={17} aria-hidden="true" />
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "sign-up" ? "new-password" : "current-password"
                        }
                        minLength={mode === "sign-up" ? 8 : undefined}
                        placeholder={mode === "sign-up" ? "8+ characters" : "Your password"}
                        required
                      />
                      <button
                        className={styles.revealButton}
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </span>
                  </label>
                ) : null}

                {mode === "sign-in" ? (
                  <button
                    className={styles.textButtonRight}
                    type="button"
                    onClick={() => switchMode("forgot")}
                  >
                    Forgot password?
                  </button>
                ) : null}

                {notice ? (
                  <p
                    className={
                      notice.kind === "error" ? styles.errorNotice : styles.successNotice
                    }
                    role={notice.kind === "error" ? "alert" : "status"}
                  >
                    {notice.text}
                  </p>
                ) : null}

                <button className={styles.submitButton} type="submit" disabled={busy}>
                  {busy ? <LoaderCircle className={styles.spinner} size={18} /> : null}
                  {mode === "sign-up"
                    ? "Create account"
                    : mode === "forgot"
                      ? "Send reset link"
                      : "Sign in"}
                </button>
              </form>

              <div className={styles.switchRow}>
                {mode === "sign-in" ? (
                  <>
                    <span>New to CollegeSearch?</span>
                    <button type="button" onClick={() => switchMode("sign-up")}>
                      Create an account
                    </button>
                  </>
                ) : mode === "sign-up" ? (
                  <>
                    <span>Already have an account?</span>
                    <button type="button" onClick={() => switchMode("sign-in")}>
                      Sign in
                    </button>
                  </>
                ) : (
                  <button
                    className={styles.backButton}
                    type="button"
                    onClick={() => switchMode("sign-in")}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back to sign in
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
