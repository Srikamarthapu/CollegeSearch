"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createAccountMutationFence, guardAccountStorage } from "@/app/lib/account-mutation-fence";
import { normalizeAccountErasureId } from "@/app/lib/account-browser-erasure";
import { useAuth } from "@/app/components/auth/AuthProvider";
import {
  SavedCollegeAccountCycleError,
  syncSavedCollegeAccountCycle,
} from "@/app/lib/saved-college-account-cycle";
import {
  getSavedCollegeBrowserLockManager,
  type SavedCollegeLockManager,
} from "@/app/lib/saved-college-lock";
import {
  savedCollegeIdsEqual,
  type SavedCollegeRemoteStore,
} from "@/app/lib/saved-college-sync";
import {
  applySavedCollegeOutbox,
  getSavedCollegeBrowserStorage,
  readGuestSavedCollegeIds,
  readSavedCollegeIdsAtKey,
  readSavedCollegeOutbox,
  savedCollegeUserCacheKey,
  savedCollegeUserOutboxKey,
  type SavedCollegePendingMutation,
  writeSavedCollegeIdsAtKey,
  writeSavedCollegeMutation,
} from "@/app/lib/saved-college-storage";
import {
  deriveSavedCollegeViewState,
  type SavedCollegeBaseSource,
  type SavedCollegeRemoteRead,
} from "@/app/lib/saved-college-view-state";
import {
  LEGACY_SAVED_COLLEGES_STORAGE_KEY,
  SAVED_COLLEGES_STORAGE_KEY,
  sanitizeSavedCollegeIds,
  type SavedCollegeStorage,
  writeSavedCollegeIds,
} from "@/app/lib/local-saves";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { createVerifiedSupabaseSavedCollegeStore } from "@/app/lib/supabase/saved-colleges";

export type SavedCollegeSyncPhase =
  | "local-only"
  | "loading-account"
  | "syncing"
  | "synced"
  | "error";

type SavedCollegeContextValue = {
  accountCacheAvailable: boolean;
  canImportGuestSaves: boolean;
  canMutate: boolean;
  freezeAccountScope(scope: string): boolean;
  unfreezeAccountScope(scope: string): void;
  forgetAccountScope(scope: string): boolean;
  guestImportCount: number;
  hydrated: boolean;
  ids: number[];
  importGuestSaves(): Promise<void>;
  lastError: string | null;
  pendingCount: number;
  replaceSavedIds(value: unknown): void;
  retrySync(): void;
  scopeKey: string;
  storageAvailable: boolean;
  syncPhase: SavedCollegeSyncPhase;
  toggleSaved(unitId: number): void;
};

type SyncSession = {
  cacheKey: string;
  epoch: number;
  lockManager: SavedCollegeLockManager;
  remote: SavedCollegeRemoteStore;
  requested: boolean;
  running: Promise<boolean> | null;
  storage: SavedCollegeStorage;
  userId: string;
};

const SavedCollegeContext = createContext<SavedCollegeContextValue | null>(
  null,
);

function genericSyncError() {
  return "Account sync needs another try. Any complete browser copy remains available, and pending changes are kept for retry.";
}

function coordinationError() {
  return "This browser cannot safely coordinate account saves across tabs. Use a current browser or keep a browser-only list while signed out.";
}

function accountCycleErrorMessage(error: SavedCollegeAccountCycleError) {
  switch (error.stage) {
    case "lock":
      return coordinationError();
    case "outbox-read":
      return "Pending browser changes are damaged or unavailable. CollegeSearch will not send account writes until they can be read safely.";
    case "cache-write":
      return "Account data was read, but this browser could not update its complete offline copy. Pending changes remain available for a safe retry.";
    case "outbox-ack":
      return "The account change was applied, but this browser could not mark its pending copy complete. It remains available for a safe retry.";
    case "outbox-reread":
      return "Account sync finished, but this browser could not confirm which pending changes remain. Nothing was discarded.";
    case "scope":
      return "The verified account identifier could not be scoped safely.";
    default:
      return genericSyncError();
  }
}

export function SavedCollegesProvider({
  children,
  knownCollegeIds,
}: {
  children: ReactNode;
  knownCollegeIds: readonly number[];
}) {
  const {
    refreshUser,
    status: authStatus,
    user,
    verification,
    verificationError,
  } = useAuth();
  const knownIds = useMemo(
    () => new Set(knownCollegeIds),
    [knownCollegeIds],
  );

  const [ids, setIds] = useState<number[]>([]);
  const [renderedScope, setRenderedScope] = useState<string>("loading");
  const [baseSource, setBaseSource] =
    useState<SavedCollegeBaseSource>("none");
  const [remoteRead, setRemoteRead] =
    useState<SavedCollegeRemoteRead>("idle");
  const [syncConfirmed, setSyncConfirmed] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [coordinationAvailable, setCoordinationAvailable] = useState(true);
  const [syncPhase, setSyncPhase] =
    useState<SavedCollegeSyncPhase>("local-only");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [guestImportCount, setGuestImportCount] = useState(0);
  const [retryToken, setRetryToken] = useState(0);

  const idsRef = useRef<number[]>([]);
  // Only mutations that could not be written to the per-unit outbox live
  // here. Durable mutations are always re-read from browser storage, keeping
  // one cross-tab source of truth instead of a second in-memory queue.
  const volatilePendingRef = useRef<Map<number, "remove" | "save">>(
    new Map(),
  );
  const sessionRef = useRef<SyncSession | null>(null);
  const epochRef = useRef(0);
  const authScopeRef = useRef<"guest" | "loading" | string>("loading");
  const [mutationFence] = useState(() => createAccountMutationFence());
  const [, setFenceVersion] = useState(0);

  const effectiveAuthStatus =
    authStatus === "unconfigured" || verification === "verified"
      ? authStatus
      : authStatus === "verification-error"
        ? "verification-error"
        : "loading";

  const viewState = deriveSavedCollegeViewState({
    authStatus: effectiveAuthStatus,
    baseSource,
    guestImportCount,
    hasPendingOutbox: pendingCount > 0,
    knownIds,
    remoteRead,
    renderedIds: ids,
    renderedScope,
    syncConfirmed,
    userId: user?.id,
  });

  useLayoutEffect(() => {
    authScopeRef.current = viewState.expectedScope;
    mutationFence.activate(viewState.expectedScope);
  }, [mutationFence, viewState.expectedScope]);

  const publishIds = useCallback((next: number[]) => {
    idsRef.current = next;
    setIds(next);
  }, []);

  const recordStorageResult = useCallback((available: boolean) => {
    setStorageAvailable((current) => current && available);
  }, []);

  const sessionIsCurrent = useCallback(
    (session: Pick<SyncSession, "epoch" | "userId">) =>
      sessionRef.current?.epoch === session.epoch &&
      sessionRef.current.userId === session.userId &&
      epochRef.current === session.epoch &&
      authScopeRef.current === session.userId &&
      mutationFence.canWrite(session.userId),
    [mutationFence],
  );

  const persistMutations = useCallback(
    (
      userId: string,
      mutations: readonly SavedCollegePendingMutation[],
      storage: SavedCollegeStorage,
    ) => {
      if (!mutationFence.canWrite(userId)) return {
        failedMutations: mutationFence.isForgotten(userId) ? [] : [...mutations],
        persisted: false,
        storageAvailable: true,
        succeededMutations: [] as SavedCollegePendingMutation[],
      };
      let persisted = true;
      let available = true;
      const failedMutations: SavedCollegePendingMutation[] = [];
      const succeededMutations: SavedCollegePendingMutation[] = [];
      for (const mutation of mutations) {
        if (!mutationFence.canWrite(userId)) { persisted = false; break; }
        const result = writeSavedCollegeMutation(
          userId,
          mutation,
          knownIds,
          storage,
        );
        persisted &&= result.persisted;
        available &&= result.storageAvailable;
        if (result.persisted) succeededMutations.push(mutation);
        else failedMutations.push(mutation);
      }
      recordStorageResult(available);
      return {
        failedMutations,
        persisted,
        storageAvailable: available,
        succeededMutations,
      };
    },
    [knownIds, recordStorageResult, mutationFence],
  );

  const runAccountCycle = useCallback(
    async (session: SyncSession) => {
      if (!sessionIsCurrent(session)) return false;

      setRemoteRead("loading");
      setSyncConfirmed(false);
      setSyncPhase("syncing");
      setLastError(null);

      try {
        // The shared Supabase client can change identities while an older
        // request is in flight. Guard both sides of every remote operation so
        // an account-boundary change can never turn another user's RLS-filtered
        // empty response into a new cache snapshot or acknowledgement.
        const guardedRemote: SavedCollegeRemoteStore = {
          async listOwned(userId) {
            if (!sessionIsCurrent(session)) throw new Error("Stale account scope.");
            const remoteIds = await session.remote.listOwned(userId);
            if (!sessionIsCurrent(session)) throw new Error("Stale account scope.");
            return remoteIds;
          },
          async removeOwned(userId, unitIds) {
            if (!sessionIsCurrent(session)) throw new Error("Stale account scope.");
            await session.remote.removeOwned(userId, unitIds);
            if (!sessionIsCurrent(session)) throw new Error("Stale account scope.");
          },
          async upsertOwned(userId, unitIds) {
            if (!sessionIsCurrent(session)) throw new Error("Stale account scope.");
            await session.remote.upsertOwned(userId, unitIds);
            if (!sessionIsCurrent(session)) throw new Error("Stale account scope.");
          },
        };
        const result = await syncSavedCollegeAccountCycle({
          knownIds,
          lockManager: session.lockManager,
          onRemoteSnapshot(snapshot) {
            if (!sessionIsCurrent(session)) return;

            setRemoteRead("succeeded");
            setBaseSource("remote");

            // A newer same-tab or cross-tab intent can replace a per-unit
            // record while the authoritative read is in flight. Render the
            // latest durable record, not the snapshot that began this cycle.
            const latest = readSavedCollegeOutbox(
              session.userId,
              knownIds,
              session.storage,
            );
            recordStorageResult(latest.storageAvailable);
            const durableMutations =
              latest.storageAvailable && latest.valid
                ? latest.mutations
                : snapshot.pendingMutations;
            const pendingForDisplay = new Map(
              durableMutations.map((mutation) => [
                mutation.unitId,
                mutation.action,
              ]),
            );
            for (const [unitId, action] of volatilePendingRef.current) {
              pendingForDisplay.set(unitId, action);
            }
            setPendingCount(pendingForDisplay.size);
            publishIds(
              applySavedCollegeOutbox(
                snapshot.syncedIds,
                Array.from(pendingForDisplay, ([unitId, action]) => ({
                  action,
                  unitId,
                })),
                knownIds,
              ),
            );
          },
          remote: guardedRemote,
          storage: guardAccountStorage(session.storage, () => sessionIsCurrent(session)),
          userId: session.userId,
        });

        if (!sessionIsCurrent(session)) return false;

        setRemoteRead("succeeded");
        setBaseSource("remote");
        const remainingForDisplay = new Map(
          result.remainingMutations.map((mutation) => [
            mutation.unitId,
            mutation.action,
          ]),
        );
        for (const [unitId, action] of volatilePendingRef.current) {
          remainingForDisplay.set(unitId, action);
        }
        publishIds(
          applySavedCollegeOutbox(
            result.syncedIds,
            Array.from(remainingForDisplay, ([unitId, action]) => ({
              action,
              unitId,
            })),
            knownIds,
          ),
        );
        setPendingCount(remainingForDisplay.size);

        if (result.remainingMutations.length > 0) {
          session.requested = true;
          setSyncPhase("syncing");
          return true;
        }

        if (volatilePendingRef.current.size > 0) {
          setLastError(
            "A change remains in this tab but could not be preserved for a safe account retry.",
          );
          setSyncPhase("error");
          return false;
        }

        setSyncConfirmed(true);
        setSyncPhase("synced");
        return true;
      } catch (error) {
        if (!sessionIsCurrent(session)) return false;
        if (error instanceof SavedCollegeAccountCycleError) {
          setRemoteRead(
            error.remoteReadSucceeded ? "succeeded" : "failed",
          );
          if (error.remoteReadSucceeded) setBaseSource("remote");
          if (error.storageAvailable !== null) {
            recordStorageResult(error.storageAvailable);
          }
        } else {
          setRemoteRead("failed");
        }
        setSyncConfirmed(false);
        const durable = readSavedCollegeOutbox(
          session.userId,
          knownIds,
          session.storage,
        );
        recordStorageResult(durable.storageAvailable);
        const pendingUnitIds = new Set(
          durable.mutations.map((mutation) => mutation.unitId),
        );
        for (const unitId of volatilePendingRef.current.keys()) {
          pendingUnitIds.add(unitId);
        }
        setPendingCount(pendingUnitIds.size);
        setLastError(
          error instanceof SavedCollegeAccountCycleError
            ? accountCycleErrorMessage(error)
            : genericSyncError(),
        );
        setSyncPhase("error");
        return false;
      }
    },
    [
      knownIds,
      publishIds,
      recordStorageResult,
      sessionIsCurrent,
    ],
  );

  const flushSession = useCallback(
    (session: SyncSession) => {
      if (!sessionIsCurrent(session)) return Promise.resolve(false);
      session.requested = true;
      if (session.running) return session.running;

      session.running = (async () => {
        let succeeded = true;
        while (session.requested && sessionIsCurrent(session)) {
          session.requested = false;
          succeeded = await runAccountCycle(session);
          if (!succeeded) break;
        }
        return succeeded;
      })().finally(() => {
        session.running = null;
      });
      return session.running;
    },
    [runAccountCycle, sessionIsCurrent],
  );

  const freezeAccountScope = useCallback((scope: string) => {
    const paused = mutationFence.freeze(scope);
    if (paused) setFenceVersion((version) => version + 1);
    return paused;
  }, [mutationFence]);

  const unfreezeAccountScope = useCallback((scope: string) => {
    if (!mutationFence.unfreeze(scope)) return;
    setFenceVersion((version) => version + 1);
    const userId = normalizeAccountErasureId(scope);
    if (!userId || !mutationFence.canWrite(userId)) return;
    const session = sessionRef.current;
    if (session && session.userId === userId) {
      const resume = () => { if (sessionIsCurrent(session)) void flushSession(session); };
      if (session.running) void session.running.then(resume, resume);
      else resume();
    } else {
      // No account mutations were possible before initial binding completed.
      setRetryToken((version) => version + 1);
    }
  }, [flushSession, mutationFence, sessionIsCurrent]);

  const forgetAccountScope = useCallback((scope: string) => {
    const matches = mutationFence.forget(scope);
    setFenceVersion((version) => version + 1);
    if (!matches) return false;
    epochRef.current += 1;
    const session = sessionRef.current;
    if (session) session.requested = false;
    sessionRef.current = null;
    volatilePendingRef.current.clear();
    publishIds([]);
    setRenderedScope("loading");
    setBaseSource("none");
    setRemoteRead("idle");
    setSyncConfirmed(false);
    setPendingCount(0);
    setCoordinationAvailable(false);
    setLastError(null);
    setSyncPhase("loading-account");
    // Persisted copies are erased by eraseAccountBrowserData under product locks.
    return true;
  }, [mutationFence, publishIds]);

  useEffect(() => {
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    sessionRef.current = null;
    volatilePendingRef.current.clear();
    let cancelled = false;

    // Scope initialization reads browser storage and may start remote work, so
    // schedule it after this effect's synchronous auth-boundary invalidation.
    // This avoids a cascading render while still masking the prior scope in
    // the render that triggered this effect.
    window.queueMicrotask(() => {
      if (cancelled || epochRef.current !== epoch) return;

      if (viewState.scopeKind === "blocked") {
        setRenderedScope("loading");
        setBaseSource("none");
        setRemoteRead("idle");
        setSyncConfirmed(false);
        setPendingCount(0);
        if (authStatus === "verification-error" || verification === "failed") {
          setLastError(
            verificationError ??
              "CollegeSearch could not verify which account is active.",
          );
          setSyncPhase("error");
        } else {
          setLastError(null);
          setSyncPhase("loading-account");
        }
        return;
      }

      setLastError(null);
      setPendingCount(0);
      setRemoteRead("idle");
      setSyncConfirmed(false);

      const storage = getSavedCollegeBrowserStorage();
      const guest = readGuestSavedCollegeIds(knownIds, storage);
      setGuestImportCount(guest.ids.length);
      setStorageAvailable(guest.storageAvailable);

      if (viewState.scopeKind === "guest") {
        setCoordinationAvailable(true);
        setRenderedScope("guest");
        setBaseSource("guest");
        publishIds(guest.ids);
        setSyncPhase("local-only");
        return;
      }

      const verifiedUserId = viewState.normalizedUserId;
      if (!verifiedUserId) return;
      if (!mutationFence.canWrite(verifiedUserId)) {
        setRenderedScope("loading");
        setBaseSource("none");
        setCoordinationAvailable(false);
        setLastError(mutationFence.isForgotten(verifiedUserId) ? "This account was deleted." : "Account changes are paused.");
        setSyncPhase("error");
        return;
      }

      // Account mutations stay disabled until this exact verified scope has
      // both durable storage and a cross-tab lock-backed sync session.
      setCoordinationAvailable(false);

      let cacheKey: string;
      try {
        cacheKey = savedCollegeUserCacheKey(verifiedUserId);
      } catch {
        setRenderedScope(verifiedUserId);
        setBaseSource("none");
        publishIds([]);
        setRemoteRead("failed");
        setLastError(
          "The verified account identifier could not be scoped safely.",
        );
        setSyncPhase("error");
        return;
      }

      const cached = readSavedCollegeIdsAtKey(cacheKey, knownIds, storage);
      const persisted = readSavedCollegeOutbox(
        verifiedUserId,
        knownIds,
        storage,
      );
      const hasValidCache = cached.present && cached.valid;
      setRenderedScope(verifiedUserId);
      setBaseSource(hasValidCache ? "cache" : "none");
      publishIds(
        hasValidCache
          ? applySavedCollegeOutbox(cached.ids, persisted.mutations, knownIds)
          : [],
      );
      setStorageAvailable(
        guest.storageAvailable &&
          cached.storageAvailable &&
          persisted.storageAvailable,
      );
      setPendingCount(persisted.mutations.length);
      setRemoteRead("loading");
      setSyncPhase("loading-account");

      if (!storage || !persisted.storageAvailable || !persisted.valid) {
        setRemoteRead("failed");
        setLastError(
          "Pending browser changes are damaged or unavailable. CollegeSearch will not send account writes until they can be read safely.",
        );
        setSyncPhase("error");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setRemoteRead("failed");
        setLastError("Account sync is not configured in this deployment.");
        setSyncPhase("error");
        return;
      }

      const lockManager = getSavedCollegeBrowserLockManager();
      if (!lockManager) {
        setRemoteRead("failed");
        setLastError(coordinationError());
        setSyncPhase("error");
        return;
      }

      void (async () => {
        try {
          const remote = await createVerifiedSupabaseSavedCollegeStore(
            supabase,
            verifiedUserId,
          );
          if (
            cancelled ||
            epochRef.current !== epoch ||
            authScopeRef.current !== verifiedUserId ||
            !mutationFence.canWrite(verifiedUserId)
          ) {
            return;
          }

          const session: SyncSession = {
            cacheKey,
            epoch,
            lockManager,
            remote,
            requested: false,
            running: null,
            storage,
            userId: verifiedUserId,
          };
          sessionRef.current = session;
          setCoordinationAvailable(true);
          void flushSession(session);
        } catch {
          if (
            cancelled ||
            epochRef.current !== epoch ||
            authScopeRef.current !== verifiedUserId ||
            !mutationFence.canWrite(verifiedUserId)
          ) {
            return;
          }
          setCoordinationAvailable(false);
          setRemoteRead("failed");
          setLastError(
            "Account sync is paused because the active session could not be bound safely. Retry account verification before syncing saves.",
          );
          setSyncPhase("error");
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [
    authStatus,
    flushSession,
    knownIds,
    publishIds,
    retryToken,
    user?.id,
    verification,
    verificationError,
    viewState.normalizedUserId,
    viewState.scopeKind,
    mutationFence,
  ]);

  const accountErased = viewState.scopeKind === "account" && mutationFence.isForgotten(viewState.expectedScope);
  const canMutate =
    viewState.canMutate &&
    (viewState.scopeKind === "guest" || (coordinationAvailable && mutationFence.canWrite(viewState.expectedScope)));
  const canImportGuestSaves =
    viewState.canImportGuestSaves &&
    coordinationAvailable &&
    storageAvailable &&
    mutationFence.canWrite(viewState.expectedScope);

  const replaceSavedIds = useCallback(
    (value: unknown) => {
      if (!canMutate) return;

      const nextIds = sanitizeSavedCollegeIds(value, knownIds);
      const currentIds = idsRef.current;
      if (savedCollegeIdsEqual(nextIds, currentIds)) return;

      const session = sessionRef.current;
      if (
        viewState.scopeKind === "account" &&
        (!session || !sessionIsCurrent(session))
      ) {
        return;
      }
      publishIds(nextIds);

      if (viewState.scopeKind === "guest") {
        const local = writeSavedCollegeIds(
          nextIds,
          knownIds,
          getSavedCollegeBrowserStorage(),
        );
        recordStorageResult(local.storageAvailable);
        return;
      }
      if (!session) return;

      const currentSet = new Set(currentIds);
      const nextSet = new Set(nextIds);
      const changed: SavedCollegePendingMutation[] = [];
      for (const unitId of knownIds) {
        if (!currentSet.has(unitId) && nextSet.has(unitId)) {
          changed.push({ action: "save", unitId });
        } else if (currentSet.has(unitId) && !nextSet.has(unitId)) {
          changed.push({ action: "remove", unitId });
        }
      }
      setSyncConfirmed(false);

      // The exact operation must be durable before a cloud request can start.
      // A cache is only a display snapshot; the per-unit outbox is the retry
      // source of truth.
      const pendingWrite = persistMutations(
        session.userId,
        changed,
        session.storage,
      );
      for (const mutation of pendingWrite.succeededMutations) {
        volatilePendingRef.current.delete(mutation.unitId);
      }
      for (const mutation of pendingWrite.failedMutations) {
        volatilePendingRef.current.set(mutation.unitId, mutation.action);
      }
      const durable = readSavedCollegeOutbox(
        session.userId,
        knownIds,
        session.storage,
      );
      const pendingUnitIds = new Set(
        durable.mutations.map((mutation) => mutation.unitId),
      );
      for (const unitId of volatilePendingRef.current.keys()) {
        pendingUnitIds.add(unitId);
      }
      setPendingCount(pendingUnitIds.size);
      if (!pendingWrite.persisted) {
        setLastError(
          "This change remains in this tab only because the browser could not preserve it for a safe account retry.",
        );
        setSyncPhase("error");
        return;
      }

      if (!sessionIsCurrent(session)) return;
      const cacheWrite = writeSavedCollegeIdsAtKey(
        session.cacheKey,
        nextIds,
        knownIds,
        session.storage,
      );
      recordStorageResult(cacheWrite.storageAvailable);
      setSyncPhase("syncing");
      void flushSession(session);
    },
    [
      canMutate,
      flushSession,
      knownIds,
      persistMutations,
      publishIds,
      recordStorageResult,
      sessionIsCurrent,
      viewState.scopeKind,
    ],
  );

  const toggleSaved = useCallback(
    (unitId: number) => {
      if (!knownIds.has(unitId)) return;
      const current = idsRef.current;
      replaceSavedIds(
        current.includes(unitId)
          ? current.filter((id) => id !== unitId)
          : [...current, unitId],
      );
    },
    [knownIds, replaceSavedIds],
  );

  const retrySync = useCallback(() => {
    if (
      authStatus === "verification-error" ||
      (authStatus !== "unconfigured" && verification !== "verified")
    ) {
      void refreshUser();
      return;
    }

    const session = sessionRef.current;
    if (session && sessionIsCurrent(session)) {
      const pending = Array.from(
        volatilePendingRef.current,
        ([unitId, action]) => ({ action, unitId }),
      );
      const persisted = persistMutations(
        session.userId,
        pending,
        session.storage,
      );
      for (const mutation of persisted.succeededMutations) {
        volatilePendingRef.current.delete(mutation.unitId);
      }
      for (const mutation of persisted.failedMutations) {
        volatilePendingRef.current.set(mutation.unitId, mutation.action);
      }
      if (!persisted.persisted) {
        setLastError(
          "This browser still cannot preserve the pending changes for a safe retry.",
        );
        setSyncPhase("error");
        return;
      }
      void flushSession(session);
      return;
    }

    setCoordinationAvailable(false);
    setRetryToken((current) => current + 1);
  }, [
    authStatus,
    flushSession,
    persistMutations,
    refreshUser,
    sessionIsCurrent,
    verification,
  ]);

  const importGuestSaves = useCallback(async () => {
    const session = sessionRef.current;
    if (
      !canImportGuestSaves ||
      !session ||
      !sessionIsCurrent(session)
    ) {
      setLastError("Connect and verify your account before importing browser saves.");
      setSyncPhase("error");
      return;
    }

    const guest = readGuestSavedCollegeIds(knownIds, session.storage);
    recordStorageResult(guest.storageAvailable);
    if (guest.ids.length === 0) {
      setGuestImportCount(0);
      return;
    }

    const importedSnapshot = [...guest.ids];
    const mutations = importedSnapshot.map((unitId) => ({
      action: "save" as const,
      unitId,
    }));
    publishIds(applySavedCollegeOutbox(idsRef.current, mutations, knownIds));
    setSyncConfirmed(false);

    const pendingWrite = persistMutations(
      session.userId,
      mutations,
      session.storage,
    );
    for (const mutation of pendingWrite.succeededMutations) {
      volatilePendingRef.current.delete(mutation.unitId);
    }
    for (const mutation of pendingWrite.failedMutations) {
      volatilePendingRef.current.set(mutation.unitId, mutation.action);
    }
    const durable = readSavedCollegeOutbox(
      session.userId,
      knownIds,
      session.storage,
    );
    const pendingUnitIds = new Set(
      durable.mutations.map((mutation) => mutation.unitId),
    );
    for (const unitId of volatilePendingRef.current.keys()) {
      pendingUnitIds.add(unitId);
    }
    setPendingCount(pendingUnitIds.size);
    if (!pendingWrite.persisted) {
      setLastError(
        "This browser could not preserve the import for a safe retry. No browser-only saves were removed.",
      );
      setSyncPhase("error");
      return;
    }

    if (!sessionIsCurrent(session)) return;
    const cacheWrite = writeSavedCollegeIdsAtKey(
      session.cacheKey,
      idsRef.current,
      knownIds,
      session.storage,
    );
    recordStorageResult(cacheWrite.storageAvailable);
    const flushed = await flushSession(session);
    if (!flushed || !sessionIsCurrent(session)) return;

    const remainingAccountMutations = readSavedCollegeOutbox(
      session.userId,
      knownIds,
      session.storage,
    );
    if (
      !remainingAccountMutations.storageAvailable ||
      !remainingAccountMutations.valid ||
      remainingAccountMutations.mutations.some(
        (mutation) =>
          importedSnapshot.includes(mutation.unitId) &&
          mutation.action === "save",
      )
    ) {
      setLastError(
        "The account import has not been fully confirmed, so no browser-only saves were removed.",
      );
      setSyncPhase("error");
      return;
    }

    const latestGuest = readGuestSavedCollegeIds(
      knownIds,
      session.storage,
    );
    const importedIds = new Set(importedSnapshot);
    const remainingGuestIds = latestGuest.ids.filter(
      (unitId) => !importedIds.has(unitId),
    );
    if (!sessionIsCurrent(session)) return;
    const guestWrite = writeSavedCollegeIds(
      remainingGuestIds,
      knownIds,
      session.storage,
    );
    recordStorageResult(guestWrite.storageAvailable);
    setGuestImportCount(
      guestWrite.persisted ? remainingGuestIds.length : latestGuest.ids.length,
    );
    if (!guestWrite.persisted) {
      setLastError(
        "The account import succeeded, but this browser would not update its separate guest copy.",
      );
      setSyncPhase("error");
    }
  }, [
    canImportGuestSaves,
    flushSession,
    knownIds,
    persistMutations,
    publishIds,
    recordStorageResult,
    sessionIsCurrent,
  ]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === SAVED_COLLEGES_STORAGE_KEY ||
        event.key === LEGACY_SAVED_COLLEGES_STORAGE_KEY
      ) {
        const guest = readGuestSavedCollegeIds(knownIds);
        setGuestImportCount(guest.ids.length);
        if (authScopeRef.current === "guest") publishIds(guest.ids);
        return;
      }

      const session = sessionRef.current;
      if (
        session &&
        sessionIsCurrent(session) &&
        event.key?.startsWith(`${savedCollegeUserOutboxKey(session.userId)}:`)
      ) {
        void flushSession(session);
      }
    };
    const handleOnline = () => {
      const session = sessionRef.current;
      if (session && sessionIsCurrent(session)) void flushSession(session);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("online", handleOnline);
    };
  }, [flushSession, knownIds, publishIds, sessionIsCurrent]);

  const value = useMemo<SavedCollegeContextValue>(
    () => ({
      accountCacheAvailable: !accountErased && viewState.accountBaseAvailable,
      freezeAccountScope,
      unfreezeAccountScope,
      forgetAccountScope,
      canImportGuestSaves,
      canMutate,
      guestImportCount,
      hydrated: !accountErased && viewState.hydrated,
      ids: accountErased ? [] : viewState.visibleIds,
      importGuestSaves,
      lastError,
      pendingCount,
      replaceSavedIds,
      retrySync,
      scopeKey: accountErased ? "loading" : viewState.expectedScope,
      storageAvailable,
      syncPhase,
      toggleSaved,
    }),
    [
      accountErased,
      freezeAccountScope,
      unfreezeAccountScope,
      forgetAccountScope,
      canImportGuestSaves,
      canMutate,
      guestImportCount,
      importGuestSaves,
      lastError,
      pendingCount,
      replaceSavedIds,
      retrySync,
      storageAvailable,
      syncPhase,
      toggleSaved,
      viewState.accountBaseAvailable,
      viewState.expectedScope,
      viewState.hydrated,
      viewState.visibleIds,
    ],
  );

  return (
    <SavedCollegeContext.Provider value={value}>
      {children}
    </SavedCollegeContext.Provider>
  );
}

export function useSavedColleges() {
  const context = useContext(SavedCollegeContext);
  if (!context) {
    throw new Error("useSavedColleges must be used inside SavedCollegesProvider.");
  }
  return context;
}
