"use client";

import type { User } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { getSupabasePublicConfig } from "@/app/lib/supabase/config";

export type AuthStatus =
  | "loading"
  | "signed-in"
  | "signed-out"
  | "unconfigured";

type AuthContextValue = {
  refreshUser(): Promise<void>;
  signOut(): Promise<{ error: string | null }>;
  status: AuthStatus;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = getSupabasePublicConfig().configured;
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "unconfigured",
  );
  const [user, setUser] = useState<User | null>(null);

  const refreshUser = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setUser(null);
      setStatus("unconfigured");
      return;
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setUser(null);
      setStatus("signed-out");
      return;
    }

    setUser(data.user);
    setStatus("signed-in");
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;

    const initialRefresh = window.setTimeout(() => {
      if (active) void refreshUser();
    }, 0);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;

      if (event === "SIGNED_OUT") {
        setUser(null);
        setStatus("signed-out");
        return;
      }

      // Supabase advises against awaiting another auth call directly inside
      // onAuthStateChange. Queue the server-verified user refresh instead.
      window.setTimeout(() => {
        if (active) void refreshUser();
      }, 0);
    });

    return () => {
      active = false;
      window.clearTimeout(initialRefresh);
      subscription.unsubscribe();
    };
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: "Supabase is not configured." };

    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setStatus("signed-out");
    }
    return { error: error?.message ?? null };
  }, []);

  const value = useMemo(
    () => ({ refreshUser, signOut, status, user }),
    [refreshUser, signOut, status, user],
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
