import { getAccountErasureState, normalizeAccountErasureId } from "./account-browser-erasure.ts";

/** Exact-account pause/erasure state shared by render and asynchronous callbacks. */
export function createAccountMutationFence(
  initialScope = "loading",
  erasureState: (scope: string) => ReturnType<typeof getAccountErasureState> = getAccountErasureState,
) {
  let currentScope = initialScope;
  const frozen = new Set<string>();
  const forgotten = new Set<string>();
  return {
    activate(scope: string) { currentScope = scope === "guest" ? scope : normalizeAccountErasureId(scope) ?? "loading"; },
    canWrite(scope: string) {
      const id = normalizeAccountErasureId(scope);
      return Boolean(id && id === currentScope && !frozen.has(id) && !forgotten.has(id) && erasureState(id) === "active");
    },
    isForgotten(scope: string) {
      const id = normalizeAccountErasureId(scope);
      return Boolean(id && (forgotten.has(id) || erasureState(id) === "deleted"));
    },
    freeze(scope: string) {
      const id = normalizeAccountErasureId(scope);
      if (!id || !this.canWrite(id)) return false;
      frozen.add(id);
      return true;
    },
    unfreeze(scope: string) {
      const id = normalizeAccountErasureId(scope);
      return id ? frozen.delete(id) : false;
    },
    forget(scope: string) {
      const id = normalizeAccountErasureId(scope);
      if (!id) return false;
      forgotten.add(id);
      frozen.delete(id);
      return currentScope === id;
    },
  };
}

/** Fence the cycle's cache/ack writes as well as its remote requests. */
export function guardAccountStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  isCurrent: () => boolean,
): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const check = () => { if (!isCurrent()) throw new Error("Account browser work is paused or no longer current."); };
  return {
    getItem(key) { check(); return storage.getItem(key); },
    setItem(key, value) { check(); storage.setItem(key, value); },
    removeItem(key) { check(); storage.removeItem(key); },
  };
}
