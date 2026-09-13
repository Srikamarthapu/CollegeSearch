import { sanitizeSavedCollegeIds } from "./local-saves.ts";

export type SavedCollegeAuthStatus =
  | "loading"
  | "signed-in"
  | "signed-out"
  | "unconfigured"
  | "verification-error";

export type SavedCollegeBaseSource = "cache" | "guest" | "none" | "remote";
export type SavedCollegeRemoteRead =
  | "failed"
  | "idle"
  | "loading"
  | "succeeded";
export type SavedCollegeListState =
  | "cached"
  | "cached-offline"
  | "loading"
  | "ready"
  | "unavailable";

export type SavedCollegeViewInput = {
  authStatus: SavedCollegeAuthStatus;
  baseSource: SavedCollegeBaseSource;
  guestImportCount: number;
  hasPendingOutbox: boolean;
  knownIds: ReadonlySet<number>;
  remoteRead: SavedCollegeRemoteRead;
  renderedIds: unknown;
  renderedScope: string | null;
  syncConfirmed: boolean;
  userId?: string | null;
};

export type SavedCollegeViewState = {
  accountBaseAvailable: boolean;
  canImportGuestSaves: boolean;
  canMutate: boolean;
  expectedScope: "guest" | "loading" | string;
  hasPendingIntent: boolean;
  hydrated: boolean;
  listState: SavedCollegeListState;
  normalizedUserId: string | null;
  scopeKind: "account" | "blocked" | "guest";
  scopeMatches: boolean;
  visibleIds: number[];
};

const VERIFIED_USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeSavedCollegeUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return VERIFIED_USER_ID_PATTERN.test(normalized) ? normalized : null;
}

function expectedScopeForAuth(
  authStatus: SavedCollegeAuthStatus,
  userId: string | null | undefined,
): Pick<
  SavedCollegeViewState,
  "expectedScope" | "normalizedUserId" | "scopeKind"
> {
  if (authStatus === "signed-in") {
    const normalizedUserId = normalizeSavedCollegeUserId(userId);
    if (normalizedUserId) {
      return {
        expectedScope: normalizedUserId,
        normalizedUserId,
        scopeKind: "account",
      };
    }

    // A malformed or not-yet-verified account identifier must never fall back
    // to the guest scope, because doing so could briefly expose another list.
    return {
      expectedScope: "loading",
      normalizedUserId: null,
      scopeKind: "blocked",
    };
  }

  if (authStatus === "loading" || authStatus === "verification-error") {
    return {
      expectedScope: "loading",
      normalizedUserId: null,
      scopeKind: "blocked",
    };
  }

  return {
    expectedScope: "guest",
    normalizedUserId: null,
    scopeKind: "guest",
  };
}

/**
 * Derives the only saved-list state that consumers may render for the current
 * verified auth scope. An outbox is a delta, not a complete account snapshot,
 * so it never makes an account list hydrated by itself.
 */
export function deriveSavedCollegeViewState(
  input: SavedCollegeViewInput,
): SavedCollegeViewState {
  const scope = expectedScopeForAuth(input.authStatus, input.userId);
  const scopeMatches = input.renderedScope === scope.expectedScope;
  const accountBaseAvailable =
    scope.scopeKind === "account" &&
    (input.baseSource === "cache" || input.baseSource === "remote");

  let listState: SavedCollegeListState = "loading";
  let completeBaseAvailable = false;

  if (scope.scopeKind === "guest") {
    completeBaseAvailable = scopeMatches && input.baseSource === "guest";
    listState = completeBaseAvailable ? "ready" : "loading";
  } else if (scope.scopeKind === "account" && scopeMatches) {
    if (input.baseSource === "remote") {
      completeBaseAvailable = true;
      listState =
        input.remoteRead === "succeeded"
          ? "ready"
          : input.remoteRead === "failed"
            ? "cached-offline"
            : "cached";
    } else if (input.baseSource === "cache") {
      completeBaseAvailable = true;
      listState =
        input.remoteRead === "failed" ? "cached-offline" : "cached";
    } else if (input.remoteRead === "failed") {
      // `hasPendingOutbox` is deliberately ignored here: pending intent cannot
      // prove which untouched rows still exist in the remote account list.
      listState = "unavailable";
    }
  }

  const hydrated = scopeMatches && completeBaseAvailable;
  const visibleIds =
    scope.scopeKind !== "blocked" && hydrated
      ? sanitizeSavedCollegeIds(input.renderedIds, input.knownIds)
      : [];
  const hasPendingIntent =
    scope.scopeKind === "account" && input.hasPendingOutbox;
  const canMutate =
    scope.scopeKind !== "blocked" && scopeMatches && hydrated;
  const canImportGuestSaves =
    scope.scopeKind === "account" &&
    scopeMatches &&
    hydrated &&
    input.baseSource === "remote" &&
    input.remoteRead === "succeeded" &&
    input.syncConfirmed &&
    !hasPendingIntent &&
    Number.isSafeInteger(input.guestImportCount) &&
    input.guestImportCount > 0;

  return {
    accountBaseAvailable,
    canImportGuestSaves,
    canMutate,
    expectedScope: scope.expectedScope,
    hasPendingIntent,
    hydrated,
    listState,
    normalizedUserId: scope.normalizedUserId,
    scopeKind: scope.scopeKind,
    scopeMatches,
    visibleIds,
  };
}
