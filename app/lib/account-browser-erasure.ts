/** Account deletion receipts contain no notes, tokens, or user contact details. */
export const ACCOUNT_ERASURE_PREFIX = "college-search-deleted-account:v1:";
export const ACCOUNT_ERASURE_EVENT = "college-search-account-erased";
export type AccountErasureStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
export type AccountErasureLocks = {
  request<T>(name: string, options: { mode: "exclusive" }, task: () => T | Promise<T>): Promise<T>;
};
export type AccountErasureState = "active" | "deleted" | "unavailable" | "invalid";
export type AccountErasureResult = {
  status: "complete" | "partial" | "invalid";
  markerPersisted: boolean;
  coordinationAvailable: boolean;
  removedCount: number;
  failedKeys: string[];
  errors: string[];
};
const memoryReceipts = new Set<string>();

export function normalizeAccountErasureId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized) ? normalized : null;
}

function browserStorage(kind: "localStorage" | "sessionStorage") {
  try { return typeof window === "undefined" ? null : window[kind]; } catch { return null; }
}

export function accountErasureKey(userId: string) {
  const id = normalizeAccountErasureId(userId);
  return id ? `${ACCOUNT_ERASURE_PREFIX}${id}` : null;
}

/** A read failure pauses writes; it is never evidence that an account was deleted. */
export function getAccountErasureState(scope: string, storage: Pick<AccountErasureStorage, "getItem"> | null = browserStorage("localStorage")): AccountErasureState {
  if (scope === "guest") return "active";
  const id = normalizeAccountErasureId(scope);
  if (!id) return "invalid";
  if (memoryReceipts.has(id)) return "deleted";
  if (!storage) return "unavailable";
  try { return storage.getItem(accountErasureKey(id)!) !== null ? "deleted" : "active"; } catch { return "unavailable"; }
}

export function isAccountScopeErased(scope: string, storage?: Pick<AccountErasureStorage, "getItem"> | null) {
  return getAccountErasureState(scope, storage) === "deleted";
}

/** Namespace + exact UUID delimiter, never substring matching or storage.clear(). */
export function browserKeyBelongsToAccount(key: string, userId: string) {
  const id = normalizeAccountErasureId(userId);
  if (!id) return false;
  const normalized = key.toLowerCase();
  if (normalized === `college-search-saved-user-cache:${id}`) return true;
  const outbox = `college-search-saved-user-outbox:${id}`;
  if (normalized === outbox || normalized.startsWith(`${outbox}:`)) return true;
  // Enumerate all stored records, including colleges removed from today's directory.
  if (new RegExp(`^college-search-research(?:-draft)?:v\\d+:${id}:`).test(normalized)) return true;
  const profile = new RegExp(`^college-search-(?:applicant|deadlines):v\\d+:${id}(?::|$)`);
  return profile.test(normalized);
}

/** Sweeps only this browser storage object; other tabs own separate sessionStorage. */
export function purgeAccountStorage(userId: string, storage: AccountErasureStorage | null) {
  const result = { removedCount: 0, failedKeys: [] as string[], accessible: true };
  if (!normalizeAccountErasureId(userId) || !storage) return { ...result, accessible: false };
  let keys: string[];
  try {
    // Snapshot first so removing items cannot make enumeration skip adjacent keys.
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null && browserKeyBelongsToAccount(key, userId));
  } catch { return { ...result, accessible: false }; }
  for (const key of keys) {
    try {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) result.failedKeys.push(key);
      else result.removedCount += 1;
    } catch { result.failedKeys.push(key); }
  }
  return result;
}

function browserLocks(): AccountErasureLocks | null {
  return typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null;
}

/** Root calls only after confirmed server deletion, with the captured deleted UUID. */
export async function eraseAccountBrowserData(
  deletedUserId: string,
  options: {
    forgetScope: (scope: string) => void;
    localStorage?: AccountErasureStorage | null;
    sessionStorage?: AccountErasureStorage | null;
    locks?: AccountErasureLocks | null;
    announce?: (scope: string) => void;
  },
): Promise<AccountErasureResult> {
  const id = normalizeAccountErasureId(deletedUserId);
  const result: AccountErasureResult = { status: "complete", markerPersisted: false, coordinationAvailable: false, removedCount: 0, failedKeys: [], errors: [] };
  if (!id) return { ...result, status: "invalid" };
  const local = options.localStorage === undefined ? browserStorage("localStorage") : options.localStorage;
  const session = options.sessionStorage === undefined ? browserStorage("sessionStorage") : options.sessionStorage;
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  memoryReceipts.add(id);
  // Establish the cross-tab write fence before waiting for any outstanding writer.
  try {
    local?.setItem(accountErasureKey(id)!, "1");
    result.markerPersisted = Boolean(local && local.getItem(accountErasureKey(id)!) === "1");
  } catch { /* Exact completion is reported below. */ }
  if (!result.markerPersisted) result.errors.push("The deletion receipt could not be stored; other tabs may require manual cleanup.");
  try { options.forgetScope(id); } catch { result.errors.push("An in-memory account copy could not be cleared."); }
  try {
    if (options.announce) options.announce(id);
    else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ACCOUNT_ERASURE_EVENT, { detail: { userId: id } }));
  } catch { result.errors.push("Other in-page account views could not be notified."); }

  function sweep() {
    for (const [kind, store] of [["Browser", local], ["Tab", session]] as const) {
      const cleared = purgeAccountStorage(id!, store);
      result.removedCount += cleared.removedCount;
      result.failedKeys.push(...cleared.failedKeys);
      if (!cleared.accessible) result.errors.push(`${kind} storage could not be inspected.`);
    }
  }
  if (locks) {
    try {
      // Each product writer holds only one of these locks. The fence prevents new
      // writes; acquiring them drains operations that started before deletion.
      const names = [
        `college-search:research:${id}`,
        `college-search:applicant-profile:college-search-applicant:v1:${id}`,
        `college-search:saved-colleges:${id}`,
        `college-search:deadlines:${id}`,
      ];
      const drain = (index: number): Promise<void> => index === names.length
        ? Promise.resolve(sweep())
        : locks.request(names[index], { mode: "exclusive" }, () => drain(index + 1));
      await drain(0);
      result.coordinationAvailable = true;
    } catch { result.errors.push("Pending browser writers could not be drained safely."); sweep(); }
  } else {
    result.errors.push("This browser cannot coordinate cleanup with other tabs.");
    sweep();
  }
  if (!result.markerPersisted || !result.coordinationAvailable || result.failedKeys.length || result.errors.length) result.status = "partial";
  return result;
}

/** Call before mounting account-local editors and again on page resume. */
export function sweepRecordedAccountErasures(
  forgetScope: (scope: string) => void,
  local: AccountErasureStorage | null = browserStorage("localStorage"),
  session: AccountErasureStorage | null = browserStorage("sessionStorage"),
) {
  const ids = new Set(memoryReceipts);
  try {
    if (local) for (let index = 0; index < local.length; index += 1) {
      const key = local.key(index);
      if (!key?.startsWith(ACCOUNT_ERASURE_PREFIX)) continue;
      const id = normalizeAccountErasureId(key.slice(ACCOUNT_ERASURE_PREFIX.length));
      if (id && local.getItem(key) !== null) ids.add(id);
    }
  } catch { /* Read failures cannot authorize erasure of an unknown scope. */ }
  return [...ids].map((id) => {
    memoryReceipts.add(id);
    let memoryCleared = true;
    try { forgetScope(id); } catch { memoryCleared = false; }
    return { userId: id, memoryCleared, local: purgeAccountStorage(id, local), session: purgeAccountStorage(id, session) };
  });
}

/** Storage events reach other open tabs; startup/resume sweeps cover missed events. */
export function subscribeToAccountErasure(forgetScope: (scope: string) => void) {
  if (typeof window === "undefined") return () => {};
  const sweep = () => { sweepRecordedAccountErasures(forgetScope); };
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== browserStorage("localStorage")) return;
    if (event.key === null || event.key.startsWith(ACCOUNT_ERASURE_PREFIX)) { sweep(); return; }
    // An older cooperating tab's pending write may arrive after the first sweep.
    for (const id of memoryReceipts) if (browserKeyBelongsToAccount(event.key, id)) { sweep(); break; }
  };
  const onNotice = (event: Event) => {
    const id = normalizeAccountErasureId((event as CustomEvent<{ userId?: unknown }>).detail?.userId);
    if (id) memoryReceipts.add(id);
    sweep();
  };
  const onVisible = () => { if (document.visibilityState === "visible") sweep(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(ACCOUNT_ERASURE_EVENT, onNotice);
  window.addEventListener("pageshow", sweep);
  document.addEventListener("visibilitychange", onVisible);
  sweep();
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ACCOUNT_ERASURE_EVENT, onNotice);
    window.removeEventListener("pageshow", sweep);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
