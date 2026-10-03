import type { AuthChangeEvent } from "@supabase/supabase-js";

export type AuthStatus =
  | "loading"
  | "signed-in"
  | "signed-out"
  | "unconfigured"
  | "verification-error";

export type AuthVerification =
  | "checking"
  | "failed"
  | "unconfigured"
  | "verified";

type AuthErrorLike = {
  code?: string;
  message: string;
  name?: string;
  status?: number;
};

export type AuthClientPort<TUser extends { id: string }> = {
  getUser(): Promise<{
    data: { user: TUser | null };
    error: AuthErrorLike | null;
  }>;
  signOut(options: { scope: "local" }): Promise<{
    error: AuthErrorLike | null;
  }>;
};

export type AuthSnapshot<TUser extends { id: string }> = {
  status: AuthStatus;
  user: TUser | null;
  verification: AuthVerification;
  verificationError: string | null;
};

type AuthStateCoordinatorOptions<TUser extends { id: string }> = {
  auth: AuthClientPort<TUser>;
  onChange(snapshot: AuthSnapshot<TUser>): void;
  schedule(callback: () => void): void;
  isUserErased?(userId: string): boolean;
};

export type AuthStateCoordinator<TUser extends { id: string }> = {
  dispose(): void;
  getSnapshot(): AuthSnapshot<TUser>;
  invalidateDeletedAccount(userId: string): boolean;
  handleAuthEvent(event: AuthChangeEvent, sessionUserId: string | null): void;
  refresh(): Promise<void>;
  signOut(): Promise<{ error: string | null }>;
};

const INITIAL_AUTH_SNAPSHOT: AuthSnapshot<never> = {
  status: "loading",
  user: null,
  verification: "checking",
  verificationError: null,
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message).trim();
    if (message) return message;
  }
  return "CollegeSearch could not verify the current session.";
}

/** Supabase returns this exact error for an absent browser session and maps
 * server session_not_found to it. This is signed-out, not a transport failure. */
function isMissingBrowserSession(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as Partial<AuthErrorLike>;
  return candidate.name === "AuthSessionMissingError" && candidate.status === 400 && !candidate.code;
}

function isRetryableVerificationError(error: AuthErrorLike) {
  if (error.name === "AuthRetryableFetchError") return true;
  if (typeof error.status === "number") {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  // Fetch/transport failures produced before an HTTP response generally do
  // not carry an Auth API status. Preserve the last verified identity while
  // offline, but fail closed for explicit API/session errors below.
  return !error.code && error.name !== "AuthSessionMissingError";
}

/**
 * Coordinates server-verified Supabase identity reads without allowing an old
 * request to cross a newer auth boundary. Session payloads from auth events are
 * used only to invalidate stale identity; getUser remains the source of truth.
 */
export function createAuthStateCoordinator<TUser extends { id: string }>({
  auth,
  onChange,
  schedule,
  isUserErased = () => false,
}: AuthStateCoordinatorOptions<TUser>): AuthStateCoordinator<TUser> {
  let active = true;
  let epoch = 0;
  let snapshot = INITIAL_AUTH_SNAPSHOT as AuthSnapshot<TUser>;
  let lastVerifiedSnapshot: AuthSnapshot<TUser> | null = null;
  let inFlight: { epoch: number; promise: Promise<void> } | null = null;
  let pendingSignOutEpoch: number | null = null;
  let boundaryUserId: string | null = null;
  const deletedUserIds = new Set<string>();
  const erased = (id: string) => deletedUserIds.has(id) || isUserErased(id);
  const guestSnapshot = (): AuthSnapshot<TUser> => ({ status: "signed-out", user: null, verification: "verified", verificationError: null });

  function publish(next: AuthSnapshot<TUser>) {
    if (!active) return;
    if (next.user && erased(next.user.id)) next = guestSnapshot();
    snapshot = next;
    if (
      next.verification === "verified" &&
      (next.status === "signed-in" || next.status === "signed-out")
    ) {
      lastVerifiedSnapshot = next;
    }
    onChange(next);
  }

  function invalidatePendingWork() {
    epoch += 1;
    inFlight = null;
    return epoch;
  }

  function checkingSnapshot(): AuthSnapshot<TUser> {
    if (snapshot.status === "signed-in" && snapshot.user) {
      return {
        status: "signed-in",
        user: snapshot.user,
        verification: "checking",
        verificationError: null,
      };
    }

    if (snapshot.status === "signed-out") {
      return {
        status: "signed-out",
        user: null,
        verification: "checking",
        verificationError: null,
      };
    }

    return {
      status: "loading",
      user: null,
      verification: "checking",
      verificationError: null,
    };
  }

  function failedVerification(message: string): AuthSnapshot<TUser> {
    if (snapshot.status === "signed-in" && snapshot.user) {
      return {
        status: "signed-in",
        user: snapshot.user,
        verification: "failed",
        verificationError: message,
      };
    }

    if (snapshot.status === "signed-out") {
      return {
        status: "signed-out",
        user: null,
        verification: "failed",
        verificationError: message,
      };
    }

    return {
      status: "verification-error",
      user: null,
      verification: "failed",
      verificationError: message,
    };
  }

  function refreshForEpoch(requestEpoch: number): Promise<void> {
    if (!active || requestEpoch !== epoch) return Promise.resolve();
    if (pendingSignOutEpoch === requestEpoch) return Promise.resolve();
    if (boundaryUserId && erased(boundaryUserId)) { publish(guestSnapshot()); return Promise.resolve(); }
    if (inFlight?.epoch === requestEpoch) return inFlight.promise;

    publish(checkingSnapshot());

    const entry: { epoch: number; promise: Promise<void> } = {
      epoch: requestEpoch,
      promise: Promise.resolve(),
    };

    entry.promise = (async () => {
      try {
        const { data, error } = await auth.getUser();
        if (!active || epoch !== requestEpoch) return;

        if (error) {
          if (isMissingBrowserSession(error)) {
            boundaryUserId = null;
            publish(guestSnapshot());
          } else if (isRetryableVerificationError(error)) {
            publish(failedVerification(errorMessage(error)));
          } else {
            lastVerifiedSnapshot = null;
            publish({
              status: "verification-error",
              user: null,
              verification: "failed",
              verificationError: errorMessage(error),
            });
          }
          return;
        }

        if (!data.user || erased(data.user.id)) {
          boundaryUserId = data.user?.id ?? null;
          publish(
            {
              status: "signed-out",
              user: null,
              verification: "verified",
              verificationError: null,
            },
          );
          return;
        }

        boundaryUserId = data.user.id;
        publish(
          {
            status: "signed-in",
            user: data.user,
            verification: "verified",
            verificationError: null,
          },
        );
      } catch (error) {
        if (!active || epoch !== requestEpoch) return;
        if (isMissingBrowserSession(error)) {
          boundaryUserId = null;
          publish(guestSnapshot());
        } else publish(failedVerification(errorMessage(error)));
      } finally {
        if (inFlight === entry) inFlight = null;
      }
    })();

    inFlight = entry;
    return entry.promise;
  }

  return {
    dispose() {
      if (!active) return;
      active = false;
      invalidatePendingWork();
      pendingSignOutEpoch = null;
    },

    getSnapshot() {
      return snapshot;
    },

    invalidateDeletedAccount(userId) {
      if (!active || !userId) return false;
      deletedUserIds.add(userId);
      const currentId = boundaryUserId ?? snapshot.user?.id ?? null;
      if (currentId !== userId) return false;
      invalidatePendingWork();
      pendingSignOutEpoch = null;
      // Keep the erased boundary until a new Auth event supplies a new owner.
      boundaryUserId = userId;
      lastVerifiedSnapshot = null;
      publish(guestSnapshot());
      return true;
    },

    handleAuthEvent(event, sessionUserId) {
      if (!active) return;
      const eventEpoch = invalidatePendingWork();
      boundaryUserId = sessionUserId;
      if (sessionUserId && erased(sessionUserId)) {
        pendingSignOutEpoch = null;
        lastVerifiedSnapshot = null;
        publish(guestSnapshot());
        return;
      }

      if (event === "SIGNED_OUT") {
        publish(
          {
            status: "signed-out",
            user: null,
            verification: "verified",
            verificationError: null,
          },
        );
        return;
      }

      const verifiedUserId = snapshot.user?.id ?? null;
      if (verifiedUserId !== sessionUserId) {
        lastVerifiedSnapshot = null;
        publish({
          status: "loading",
          user: null,
          verification: "checking",
          verificationError: null,
        });
      } else {
        publish(checkingSnapshot());
      }

      // Supabase auth callbacks must stay synchronous. The scheduled refresh
      // will also self-cancel if another event advances the epoch first.
      schedule(() => {
        if (active && epoch === eventEpoch) {
          void refreshForEpoch(eventEpoch);
        }
      });
    },

    refresh() {
      return refreshForEpoch(epoch);
    },

    async signOut() {
      if (!active) return { error: "Authentication is no longer available." };

      const invocationSnapshot = snapshot;
      const verifiedRestoreSnapshot =
        invocationSnapshot.verification === "verified" &&
        (invocationSnapshot.status === "signed-in" ||
          invocationSnapshot.status === "signed-out")
          ? invocationSnapshot
          : null;
      const lastVerifiedIdentity =
        lastVerifiedSnapshot?.status === "signed-in"
          ? lastVerifiedSnapshot.user?.id
          : null;
      const degradedRestoreSnapshot =
        invocationSnapshot.status === "signed-in" &&
        invocationSnapshot.user &&
        invocationSnapshot.user.id === lastVerifiedIdentity
          ? invocationSnapshot
          : null;
      const signOutEpoch = invalidatePendingWork();
      pendingSignOutEpoch = signOutEpoch;
      publish({
        status: "loading",
        user: null,
        verification: "checking",
        verificationError: null,
      });

      let failure: string | null = null;
      try {
        const { error } = await auth.signOut({ scope: "local" });
        failure = error ? errorMessage(error) : null;
      } catch (error) {
        failure = errorMessage(error);
      }

      if (!active) return { error: failure };

      if (epoch === signOutEpoch) {
        pendingSignOutEpoch = null;
        if (failure) {
          if (verifiedRestoreSnapshot) {
            publish(verifiedRestoreSnapshot);
          } else if (degradedRestoreSnapshot) {
            publish({
              status: "signed-in",
              user: degradedRestoreSnapshot.user,
              verification: "failed",
              verificationError: failure,
            });
          } else {
            publish(failedVerification(failure));
          }
        } else {
          publish(
            {
              status: "signed-out",
              user: null,
              verification: "verified",
              verificationError: null,
            },
            );
        }
      } else if (pendingSignOutEpoch === signOutEpoch) {
        pendingSignOutEpoch = null;
      }

      return { error: failure };
    },
  };
}

export const UNCONFIGURED_AUTH_SNAPSHOT: AuthSnapshot<never> = {
  status: "unconfigured",
  user: null,
  verification: "unconfigured",
  verificationError: null,
};
