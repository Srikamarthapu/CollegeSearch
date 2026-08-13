"use client";

import type { User } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { getSupabasePublicConfig } from "@/app/lib/supabase/config";
import {
  createAuthStateCoordinator,
  type AuthSnapshot,
  type AuthStateCoordinator,
  type AuthStatus,
  type AuthVerification,
  UNCONFIGURED_AUTH_SNAPSHOT,
} from "./auth-state-coordinator";

export type { AuthStatus, AuthVerification } from "./auth-state-coordinator";

type AuthContextValue = {
  refreshUser(): Promise<void>;
  signOut(): Promise<{ error: string | null }>;
  status: AuthStatus;
  user: User | null;
  verification: AuthVerification;
  verificationError: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = getSupabasePublicConfig().configured;
  const [snapshot, setSnapshot] = useState<AuthSnapshot<User>>(
    configured
      ? {
          status: "loading",
          user: null,
          verification: "checking",
          verificationError: null,
        }
      : (UNCONFIGURED_AUTH_SNAPSHOT as AuthSnapshot<User>),
  );
  const coordinatorRef = useRef<AuthStateCoordinator<User> | null>(null);

  const refreshUser = useCallback(async () => {
    await coordinatorRef.current?.refresh();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      coordinatorRef.current = null;
      return;
    }

    const coordinator = createAuthStateCoordinator<User>({
      auth: supabase.auth,
      onChange: setSnapshot,
      schedule(callback) {
        window.setTimeout(callback, 0);
      },
    });
    coordinatorRef.current = coordinator;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      coordinator.handleAuthEvent(event, session?.user.id ?? null);
    });

    return () => {
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) {
      return {
        error: configured
          ? "Authentication is still initializing."
          : "Supabase is not configured.",
      };
    }
    return coordinator.signOut();
  }, [configured]);

  const value = useMemo(
    () => ({ refreshUser, signOut, ...snapshot }),
    [refreshUser, signOut, snapshot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}

export function getAuthDisplayName(user: User): string {
  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  // user_metadata is presentation-only. Never use it for authorization.
  return metadataName || user.email || "Student";
}
