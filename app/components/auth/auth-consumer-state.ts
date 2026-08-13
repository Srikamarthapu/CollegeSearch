import type {
  AuthStatus,
  AuthVerification,
} from "./auth-state-coordinator";

export type AuthConsumerState =
  | "checking"
  | "checking-last-verified"
  | "last-verified-unavailable"
  | "unavailable"
  | "unconfigured"
  | "verified-signed-in"
  | "verified-signed-out";

export type AuthConsumerDecision = {
  canUseAccount: boolean;
  hasLastVerifiedIdentity: boolean;
  state: AuthConsumerState;
};

/**
 * Converts the coordinator's detailed snapshot into one shared UI trust
 * decision. Account-scoped reads and writes are allowed only while the
 * identity is currently server verified; a previously verified identity may
 * remain visible during a transient check, but never authorizes an action.
 */
export function resolveAuthConsumerState({
  hasUser,
  status,
  verification,
}: {
  hasUser: boolean;
  status: AuthStatus;
  verification: AuthVerification;
}): AuthConsumerDecision {
  if (status === "unconfigured" || verification === "unconfigured") {
    return {
      canUseAccount: false,
      hasLastVerifiedIdentity: false,
      state: "unconfigured",
    };
  }

  if (status === "verification-error") {
    return {
      canUseAccount: false,
      hasLastVerifiedIdentity: false,
      state: "unavailable",
    };
  }

  if (verification === "checking") {
    const hasLastVerifiedIdentity = status === "signed-in" && hasUser;
    return {
      canUseAccount: false,
      hasLastVerifiedIdentity,
      state: hasLastVerifiedIdentity
        ? "checking-last-verified"
        : "checking",
    };
  }

  if (verification === "failed") {
    const hasLastVerifiedIdentity = status === "signed-in" && hasUser;
    return {
      canUseAccount: false,
      hasLastVerifiedIdentity,
      state: hasLastVerifiedIdentity
        ? "last-verified-unavailable"
        : "unavailable",
    };
  }

  if (status === "signed-in" && hasUser) {
    return {
      canUseAccount: true,
      hasLastVerifiedIdentity: true,
      state: "verified-signed-in",
    };
  }

  if (status === "signed-out") {
    return {
      canUseAccount: false,
      hasLastVerifiedIdentity: false,
      state: "verified-signed-out",
    };
  }

  // Fail closed for an impossible or partially initialized combination.
  return {
    canUseAccount: false,
    hasLastVerifiedIdentity: false,
    state: "unavailable",
  };
}
