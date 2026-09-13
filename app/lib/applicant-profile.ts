/** Browser-only, self-reported preparation notes. Never an input to matching. */
export const APPLICANT_PROFILE_LIMITS = {
  gpa: 32,
  scale: 100,
  coursework: 1800,
  opportunities: 1400,
  activities: 2600,
  interests: 1200,
  priorities: 1200,
  nextSteps: 1800,
} as const;

export const PREPARATION_CHECKLIST = [
  { id: "context", label: "Check my GPA scale and course context with my school" },
  { id: "requirements", label: "Review current course and application requirements at each college" },
  { id: "affordability", label: "Discuss affordability and use official net price calculators" },
  { id: "dates", label: "Record application and aid dates from official sources" },
  { id: "conversation", label: "Review my research list with a counselor or trusted adult" },
] as const;

export type PreparationCheck = (typeof PREPARATION_CHECKLIST)[number]["id"];
export type ApplicantProfile = {
  version: 1;
  gpa: string;
  scale: string;
  weighting: "" | "unweighted" | "weighted" | "unknown";
  coursework: string;
  opportunities: string;
  activities: string;
  interests: string;
  priorities: string;
  nextSteps: string;
  checked: PreparationCheck[];
};
export type ApplicantProfileStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ApplicantProfileSnapshot = {
  draft: ApplicantProfile;
  /** The exact browser record the editor last observed, for stale-write detection. */
  revision: string | null;
  status: "ready" | "saving" | "unavailable" | "unsupported" | "invalid" | "conflict" | "blocked";
  /** A recovery draft in this tab’s sessionStorage survives same-tab reload. */
  draftPersisted?: boolean;
  persisted: boolean;
};

export function emptyApplicantProfile(): ApplicantProfile {
  return {
    version: 1, gpa: "", scale: "", weighting: "", coursework: "",
    opportunities: "", activities: "", interests: "", priorities: "",
    nextSteps: "", checked: [],
  };
}

/** The caller must obtain this scope from the verified SavedCollegesProvider. */
export function applicantProfileKey(scope: unknown): string | null {
  if (typeof scope !== "string") return null;
  const normalized = scope.trim().toLowerCase();
  if (normalized !== "guest" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) return null;
  return `college-search-applicant:v1:${normalized}`;
}

export function deriveApplicantProfileScope(input: {
  scopeKey: string; clientReady: boolean; hydrated: boolean; canMutate: boolean;
}) {
  return input.clientReady && input.hydrated && input.canMutate && applicantProfileKey(input.scopeKey)
    ? input.scopeKey.trim().toLowerCase()
    : null;
}

export function parseApplicantProfile(raw: string | null): ApplicantProfile | null {
  if (raw === null) return emptyApplicantProfile();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !["", "unweighted", "weighted", "unknown"].includes(record.weighting as string)) return null;
  for (const [field, limit] of Object.entries(APPLICANT_PROFILE_LIMITS)) {
    if (typeof record[field] !== "string" || (record[field] as string).length > limit) return null;
  }
  if (!Array.isArray(record.checked) || record.checked.length > PREPARATION_CHECKLIST.length ||
      !record.checked.every((id) => PREPARATION_CHECKLIST.some((item) => item.id === id)) ||
      new Set(record.checked).size !== record.checked.length) return null;
  // Project the approved fields only; ignore imported odds, account data, and URLs.
  return {
    ...Object.fromEntries(Object.keys(APPLICANT_PROFILE_LIMITS).map((key) => [key, record[key]])),
    version: 1,
    weighting: record.weighting,
    checked: PREPARATION_CHECKLIST.filter((item) => (record.checked as unknown[]).includes(item.id)).map((item) => item.id),
  } as ApplicantProfile;
}

export function getApplicantProfileStorage(): ApplicantProfileStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function readApplicantProfile(scope: unknown, storage = getApplicantProfileStorage()): ApplicantProfileSnapshot {
  const key = applicantProfileKey(scope);
  const empty = { draft: emptyApplicantProfile(), revision: null, persisted: false };
  if (!key) return { ...empty, status: "blocked" };
  if (!storage) return { ...empty, status: "unavailable" };
  try {
    const revision = storage.getItem(key);
    const draft = parseApplicantProfile(revision);
    return { draft: draft ?? emptyApplicantProfile(), revision, persisted: draft !== null && revision !== null, status: draft ? "ready" : "invalid" };
  } catch { return { ...empty, status: "unavailable" }; }
}

export type ApplicantProfileLockManager = {
  request<T>(name: string, options: { mode: "exclusive" }, task: () => T | Promise<T>): Promise<T>;
};
export function getApplicantProfileLocks(): ApplicantProfileLockManager | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
}
export function getApplicantProfileJournal(): ApplicantProfileStorage | null {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch { return null; }
}
export function applicantProfileDraftKey(scope: unknown) {
  const key = applicantProfileKey(scope);
  return key ? `${key}:draft` : null;
}

/** Shared copies are written only under the same exclusive Web Lock in every tab. */
export async function writeApplicantProfile(
  scope: unknown, draft: ApplicantProfile, expectedRevision: string | null,
  storage = getApplicantProfileStorage(), locks = getApplicantProfileLocks(),
  isCurrent: () => boolean = () => true, replaceBrowserCopy = false,
): Promise<ApplicantProfileSnapshot> {
  const key = applicantProfileKey(scope);
  const base = { draft, revision: expectedRevision, persisted: false };
  if (!key || !isCurrent()) return { ...base, status: "blocked" };
  const parsed = parseApplicantProfile(JSON.stringify(draft));
  if (!parsed) return { ...base, status: "invalid" };
  if (!storage) return { ...base, status: "unavailable" };
  if (!locks) return { ...base, status: "unsupported" };
  try {
    return await locks.request(`college-search:applicant-profile:${key}`, { mode: "exclusive" }, () => {
      // Authentication may have changed while this tab waited for the lock.
      if (!isCurrent()) return { ...base, status: "blocked" as const };
      if (!replaceBrowserCopy && storage.getItem(key) !== expectedRevision) return { ...base, status: "conflict" as const };
      const revision = JSON.stringify(parsed);
      storage.setItem(key, revision);
      return { draft: parsed, revision, persisted: true, status: "ready" as const };
    });
  } catch { return { ...base, status: "unavailable" }; }
}

/**
 * Each keystroke journals synchronously to this tab's sessionStorage before an
 * async autosave. Exclusive Web Locks protect the canonical localStorage copy;
 * a module cache retains drafts across SPA navigation and verification pauses.
 */
export function createApplicantProfileSessionStore(
  storageProvider = getApplicantProfileStorage,
  journalProvider = getApplicantProfileJournal,
  locksProvider = getApplicantProfileLocks,
  scopeAllowed: (scope: string) => boolean = () => true,
) {
  const sessions = new Map<string, ApplicantProfileSnapshot>();
  const epochs = new Map<string, number>();
  const running = new Map<string, Promise<ApplicantProfileSnapshot>>();
  const listeners = new Set<() => void>();
  let activeScope: string | null = null;
  function publish(scope: string, snapshot: ApplicantProfileSnapshot) {
    const key = applicantProfileKey(scope);
    if (key) sessions.set(key, snapshot);
    for (const listener of listeners) listener();
    return snapshot;
  }
  function journal(scope: string, snapshot: ApplicantProfileSnapshot) {
    try {
      const key = applicantProfileDraftKey(scope);
      const storage = journalProvider();
      if (!key || !storage) return false;
      storage.setItem(key, JSON.stringify({ version: 1, baseRevision: snapshot.revision, draft: snapshot.draft }));
      return true;
    } catch { return false; }
  }
  function removeJournal(scope: string) {
    try {
      const key = applicantProfileDraftKey(scope);
      const storage = journalProvider();
      if (!key || !storage) return false;
      storage.removeItem(key);
      return true;
    } catch { return false; }
  }
  function get(scope: string): ApplicantProfileSnapshot {
    const key = applicantProfileKey(scope);
    if (!key || !scopeAllowed(scope)) return { draft: emptyApplicantProfile(), revision: null, persisted: false, status: "blocked" };
    const existing = sessions.get(key);
    if (existing) return existing;
    let initial = readApplicantProfile(scope, storageProvider());
    try {
      const raw = journalProvider()?.getItem(applicantProfileDraftKey(scope)!);
      if (raw) {
        const candidate = JSON.parse(raw) as Record<string, unknown>;
        const draft = parseApplicantProfile(JSON.stringify(candidate.draft));
        if (candidate.version === 1 && draft && (typeof candidate.baseRevision === "string" || candidate.baseRevision === null)) {
          // A prior autosave may have finished immediately before the page left.
          if (initial.revision === JSON.stringify(draft)) removeJournal(scope);
          else initial = { draft, revision: candidate.baseRevision, persisted: false, draftPersisted: true,
            status: initial.status === "unavailable" ? "unavailable" : candidate.baseRevision === initial.revision ? "saving" : "conflict" };
        }
      }
    } catch { /* Preserve the canonical copy if a recovery journal is unreadable. */ }
    sessions.set(key, initial);
    return initial;
  }
  function isCurrent(scope: string) { return applicantProfileKey(activeScope) === applicantProfileKey(scope) && applicantProfileKey(scope) !== null && scopeAllowed(scope); }
  function update(scope: string, patch: Partial<ApplicantProfile>) {
    const current = get(scope);
    if (!isCurrent(scope)) return { ...current, status: "blocked" as const };
    const draft = { ...current.draft, ...patch, version: 1 as const };
    const next: ApplicantProfileSnapshot = { ...current, draft, persisted: false,
      status: current.status === "conflict" || current.status === "invalid" ? current.status : "saving" };
    next.draftPersisted = journal(scope, next);
    return publish(scope, next);
  }
  function flush(scope: string, replaceBrowserCopy = false): Promise<ApplicantProfileSnapshot> {
    const key = applicantProfileKey(scope);
    const current = get(scope);
    if (!key || !isCurrent(scope)) return Promise.resolve({ ...current, status: "blocked" });
    const pending = running.get(key);
    if (pending) return pending;
    if (current.persisted || (!replaceBrowserCopy && ["conflict", "invalid"].includes(current.status))) return Promise.resolve(current);
    const submitted = current;
    const epoch = epochs.get(key) ?? 0;
    const promise = writeApplicantProfile(scope, submitted.draft, submitted.revision, storageProvider(), locksProvider(), () => isCurrent(scope) && (epochs.get(key) ?? 0) === epoch, replaceBrowserCopy)
      .then((result) => {
        const latest = get(scope);
        if ((epochs.get(key) ?? 0) !== epoch || !scopeAllowed(scope)) return latest;
        if (result.status === "ready") {
          const unchanged = JSON.stringify(latest.draft) === JSON.stringify(submitted.draft);
          if (unchanged) {
            const removed = removeJournal(scope);
            return publish(scope, { ...result, draftPersisted: !removed && Boolean(latest.draftPersisted) });
          }
          const rebased: ApplicantProfileSnapshot = { ...latest, revision: result.revision, persisted: false, status: "saving" };
          rebased.draftPersisted = journal(scope, rebased);
          return publish(scope, rebased);
        }
        return publish(scope, { ...latest, status: result.status, persisted: false });
      })
      .finally(() => {
        running.delete(key);
        if (get(scope).status === "saving" && isCurrent(scope)) void flush(scope);
      });
    running.set(key, promise);
    return promise;
  }
  return {
    get, update, flush,
    activate(scope: string | null) { activeScope = scope && applicantProfileKey(scope) && scopeAllowed(scope) ? scope : null; },
    /** A deletion observer can forget memory after removing the owner's local keys. */
    forget(scope: string) {
      const key = applicantProfileKey(scope);
      if (!key) return;
      epochs.set(key, (epochs.get(key) ?? 0) + 1);
      if (applicantProfileKey(activeScope) === key) activeScope = null;
      removeJournal(scope);
      publish(scope, { draft: emptyApplicantProfile(), revision: null, status: "blocked", persisted: false });
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reconcile(scope: string) {
      const current = get(scope);
      if (!scopeAllowed(scope)) return current;
      const stored = readApplicantProfile(scope, storageProvider());
      if (stored.revision === current.revision && stored.status === "ready") {
        return current.status === "blocked" ? publish(scope, { ...current, status: "saving" }) : current;
      }
      if (current.persisted || (current.status === 'ready' && current.revision === null && !hasApplicantProfileContent(current.draft))) return publish(scope, stored);
      return publish(scope, { ...current, status: stored.status === "unavailable" ? "unavailable" : "conflict", persisted: false });
    },
    useSaved(scope: string) {
      if (!isCurrent(scope)) return get(scope);
      if (!removeJournal(scope)) return publish(scope, { ...get(scope), status: "unavailable" });
      return publish(scope, readApplicantProfile(scope, storageProvider()));
    },
    saveDraft: flush,
    async clear(scope: string): Promise<ApplicantProfileSnapshot> {
      const key = applicantProfileKey(scope);
      // Finish an outstanding autosave before taking the same lock for clear.
      const pending = key ? running.get(key) : null;
      if (pending) await pending;
      const current = get(scope);
      if (!key || !isCurrent(scope)) return { ...current, status: "blocked" };
      const epoch = epochs.get(key) ?? 0;
      const storage = storageProvider();
      const locks = locksProvider();
      if (!storage || !locks) return publish(scope, { ...current, status: !storage ? "unavailable" : "unsupported" });
      try {
        return await locks.request(`college-search:applicant-profile:${key}`, { mode: "exclusive" }, () => {
          if (!isCurrent(scope) || (epochs.get(key) ?? 0) !== epoch) return { ...current, status: "blocked" as const };
          // A new edit made while clear waited is not part of the confirmed clear.
          const latest = get(scope);
          if (JSON.stringify(latest.draft) !== JSON.stringify(current.draft) || latest.revision !== current.revision) return latest;
          if (storage.getItem(key) !== current.revision) return publish(scope, { ...current, status: "conflict", persisted: false });
          storage.removeItem(key);
          if (!removeJournal(scope)) return publish(scope, { ...current, revision: null, status: "unavailable", persisted: false });
          return publish(scope, { draft: emptyApplicantProfile(), revision: null, status: "ready", persisted: false });
        });
      } catch { return publish(scope, { ...current, status: "unavailable", persisted: false }); }
    },
  };
}

export function applicantProfileReviewNotes(profile: ApplicantProfile): string[] {
  const notes: string[] = [];
  if (profile.gpa.trim() && !/^\d+(?:\.\d+)?$/.test(profile.gpa.trim())) notes.push("Check the GPA entry with your school; it is retained exactly as entered.");
  if (profile.gpa.trim() && !profile.scale.trim()) notes.push("Add the original grading scale so a reader can interpret your GPA.");
  if (profile.gpa.trim() && (!profile.weighting || profile.weighting === "unknown")) notes.push("Confirm whether the reported GPA is weighted or unweighted.");
  return notes;
}

export function hasApplicantProfileContent(profile: ApplicantProfile) {
  return Object.keys(APPLICANT_PROFILE_LIMITS).some((key) => profile[key as keyof typeof APPLICANT_PROFILE_LIMITS].trim()) ||
    Boolean(profile.weighting) || profile.checked.length > 0;
}

export function buildApplicantBrief(profile: ApplicantProfile, generatedAt = new Date()): string {
  const entry = (text: string) => text.trim() || "Not entered";
  const weighting = { "": "Not entered", unweighted: "Unweighted", weighted: "Weighted", unknown: "Not sure yet" }[profile.weighting];
  const notes = applicantProfileReviewNotes(profile);
  return [
    "COLLEGESEARCH · APPLICANT PREPARATION BRIEF",
    `Prepared ${generatedAt.toISOString().slice(0, 10)} (UTC) · Self-reported notes`,
    "", "For a conversation with a counselor or trusted adult. These entries are not verified by CollegeSearch.",
    "No GPA conversion, admission probability, or automated reach/target/safety assessment is included. This profile does not affect preference scores.",
    "", "ACADEMIC CONTEXT", `GPA as entered: ${entry(profile.gpa)}`, `Original scale: ${entry(profile.scale)}`, `Weighting: ${weighting}`,
    "", "Coursework taken or planned", entry(profile.coursework),
    "", "Opportunities and course access", entry(profile.opportunities),
    "", "ACTIVITIES AND RESPONSIBILITIES", entry(profile.activities),
    "", "INTERESTS TO EXPLORE", entry(profile.interests),
    "", "WHAT MATTERS TO ME", entry(profile.priorities),
    "", "PREPARATION CHECKLIST · Marked by the student",
    ...PREPARATION_CHECKLIST.map((item) => `[${profile.checked.includes(item.id) ? "x" : " "}] ${item.label}`),
    "", "MY NEXT STEPS AND DATES", entry(profile.nextSteps),
    "Dates and requirements here are student-entered. Confirm them with the college's official application and financial-aid pages.",
    "", "QUESTIONS FOR OUR CONVERSATION",
    ...notes.map((note) => `- ${note}`),
    "- What does my coursework show in the context of the opportunities available at my school?",
    "- Which current program requirements, costs, and application or aid dates should I verify next?",
    "- What should I investigate before assigning my own planning categories to a college list?",
    "", "PRIVACY", "Generated in this browser. The file contains the notes above; review it before choosing whom to share it with. CollegeSearch does not send this brief to a counselor or AI provider.", "",
  ].join("\n");
}
