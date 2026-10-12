"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, MessageSquare, Plus, Scale, ShieldCheck, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { AuthDialog } from "@/app/components/auth/AuthDialog";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import { LocalSaveButton } from "@/app/components/LocalSaveButton";
import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";
import { captureVerifiedSupabaseSession } from "@/app/lib/supabase/verified-session";
import type { AdviserAnswer } from "@/app/lib/adviser/engine";
import type { AdviserRecommendation } from "@/app/lib/adviser/evidence";
import { AdviserApiError, AdviserSessionVerificationError, canRetryAdviserVerification, classifyPollError, copyPendingJobForRetry, createPollLoop, isAdviserAuthIssueForUser, isCurrentPendingRequest, reconcilePendingHistory, shouldRestoreMissingRequest, type AdviserAuthIssue } from "@/app/lib/adviser/polling";
import type { AdviserPublicStatus } from "@/app/lib/adviser/server";
import type { AdviserUsage } from "@/app/lib/adviser/service";
import styles from "./adviser.module.css";

type Conversation = { id: string; title: string; updated_at: string; expires_at: string };
type Message = { id: string; request_id?: string | null; role: "user" | "assistant"; payload: { text?: string } & Partial<AdviserAnswer>; created_at: string };
type PendingJob = { requestId: string; conversationId: string; message: string; status: "queued" | "running" };
type AdviserHistoryResult = { conversations: Conversation[]; nextOffset: number | null; pendingJob: PendingJob | null; usage: AdviserUsage };
type AdviserHistoryRefresh = {
  response: AdviserHistoryResult;
  pendingApplied: boolean;
  pendingRequestAtStart: string | null;
  pendingRequestAfter: string | null;
  pendingRevisionAtStart: number;
  pendingRevisionAfter: number;
};
const examples = ["I'm interested in engineering in California.", "Help me compare smaller colleges in the Northeast.", "I live in Texas. What should I know before comparing costs?"];

function InactiveAdviser({ collegeCount, showHistorySignIn = false }: { collegeCount: number; showHistorySignIn?: boolean }) {
  return <section className={styles.inactive} aria-labelledby="adviser-status-heading">
    <div className={styles.inactiveIntro}><span className={styles.statusLabel}><MessageSquare size={16} aria-hidden="true" /> In preparation</span>
      <h2 id="adviser-status-heading">A conversation worth relying on.</h2>
      <p>We&apos;re preparing the adviser and checking its recommendations against published college data. It isn&apos;t available for live conversations yet.</p>
      <p>You can already explore the collection, match your preferences and keep your research in one place. All of these tools are free.</p>
      <Link className={styles.primary} href="/match">Find colleges by preference <ArrowRight size={17} aria-hidden="true" /></Link>
      {showHistorySignIn && <div className={styles.historySignIn}><p>Already have adviser conversations?</p><AuthDialog><button className={styles.textButton} type="button">Sign in to view or delete your history</button></AuthDialog></div>}
    </div>
    <div className={styles.researchLinks}><h3>Keep your search moving</h3>
      <Link href="/explore"><BookOpen size={21} aria-hidden="true" /><span><strong>Explore {collegeCount} colleges</strong><small>Fields, published costs and source-linked profiles</small></span><ArrowRight size={17} aria-hidden="true" /></Link>
      <Link href="/compare"><Scale size={21} aria-hidden="true" /><span><strong>See the differences</strong><small>Compare up to four colleges side by side</small></span><ArrowRight size={17} aria-hidden="true" /></Link>
      <Link href="/my-colleges"><Check size={21} aria-hidden="true" /><span><strong>Make a plan</strong><small>Your saved colleges, notes and deadlines</small></span><ArrowRight size={17} aria-hidden="true" /></Link>
      <p><ShieldCheck size={16} aria-hidden="true" /> Your saved notes, activities and GPA are never sent to the adviser automatically.</p>
    </div>
  </section>;
}

export function AdviserWorkspace({ availability }: { availability: AdviserPublicStatus }) {
  const { status, verification, user } = useAuth();
  const [authIssue, setAuthIssue] = useState<AdviserAuthIssue | null>(null);
  const onAuthRecovered = useCallback((userId: string) => {
    setAuthIssue((current) => isAdviserAuthIssueForUser(current, userId) ? null : current);
  }, []);
  const handleUnauthorized = useCallback((userId: string) => {
    setAuthIssue({ userId, kind: "unauthorized", message: "Your adviser session is no longer accepted. Sign in again to continue." });
  }, []);
  const handleSessionVerificationFailure = useCallback((userId: string) => {
    setAuthIssue({ userId, kind: "verification", message: "We couldn't verify your adviser sign-in. Your conversation is saved here. Retry the account check or sign in again." });
  }, []);
  const retrySessionVerification = useCallback((userId: string) => {
    setAuthIssue((current) => canRetryAdviserVerification(current, userId) ? null : current);
  }, []);
  if (status === "loading" || verification === "checking") return <div className={styles.loading} role="status" aria-busy="true"><span>Checking your account…</span><div /><div /><div /></div>;
  const verifiedId = status === "signed-in" && verification === "verified" && user && !user.is_anonymous ? user.id : null;
  const userIssue = verifiedId && isAdviserAuthIssueForUser(authIssue, verifiedId) ? authIssue : null;
  if (!availability.available) {
    if (!verifiedId) return <InactiveAdviser collegeCount={availability.catalogCount} showHistorySignIn />;
    return <AdviserSession key={verifiedId} userId={verifiedId} available={false} authNotice={userIssue?.message ?? null} authBlocked={!!userIssue} authRetryAvailable={userIssue?.kind === "verification"} onUnauthorized={handleUnauthorized} onSessionVerificationFailure={handleSessionVerificationFailure} onRetrySessionVerification={retrySessionVerification} onAuthRecovered={onAuthRecovered} />;
  }
  if (!verifiedId) return <section className={styles.signIn}><MessageSquare size={28} aria-hidden="true" /><h2>A place to work through your choices.</h2><p>Sign in for private conversation history and {availability.monthlyAllowance} free adviser messages per month. Browsing and preference matching work without an account.</p><AuthDialog><button className={styles.primary}>Sign in to start</button></AuthDialog><Link href="/match">Use preference match without an account</Link></section>;
  return <AdviserSession key={verifiedId} userId={verifiedId} available authNotice={userIssue?.message ?? null} authBlocked={!!userIssue} authRetryAvailable={userIssue?.kind === "verification"} onUnauthorized={handleUnauthorized} onSessionVerificationFailure={handleSessionVerificationFailure} onRetrySessionVerification={retrySessionVerification} onAuthRecovered={onAuthRecovered} />;
}

export function AdviserRecommendationCard({ college }: { college: AdviserRecommendation }) {
  return <article className={styles.collegeCard}>
    <div className={styles.collegeHeading}><CollegeLogo college={college} variant="suggestion" /><div><h3><Link href={`/colleges/${college.slug}`}>{college.name}</Link></h3><p>{college.city}, {college.state} · {college.ownership}</p></div></div>
    {college.reasons.length > 0 && <ul className={styles.reasons}>{college.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
    <dl className={styles.facts}>{college.facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.display}<small>{fact.citation.period}</small></dd></div>)}</dl>
    <details className={styles.evidence}><summary>Sources &amp; what to verify</summary>
      <p>Federal institution record: UNITID <code>{college.unitId}</code>.</p>
      {college.fields.map((field) => <p key={field.name}><strong>{field.name}</strong> — {field.qualification}. <a href={field.citation.url} target="_blank" rel="noreferrer">{field.citation.publisher}, {field.citation.period}</a>{field.citation.artifactUrl && field.citation.artifactUrl !== field.citation.url && <> · <a href={field.citation.artifactUrl} target="_blank" rel="noreferrer">Open source file</a></>}</p>)}
      <ul>{college.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul>
      {college.facts.map((fact) => <div className={styles.source} key={fact.key}><strong>{fact.label} · {fact.citation.period}</strong><a href={fact.citation.url} target="_blank" rel="noreferrer">{fact.citation.name} ↗</a>{fact.citation.artifactUrl && fact.citation.artifactUrl !== fact.citation.url && <a href={fact.citation.artifactUrl} target="_blank" rel="noreferrer">Open source file</a>}<p>{fact.citation.cohort}</p><p>{fact.citation.definition}</p><small>UNITID {college.unitId} · Checked {fact.citation.checkedOn} · {fact.citation.field}</small></div>)}
    </details>
    <div className={styles.cardActions}><Link href={`/colleges/${college.slug}`}>Open profile <ArrowRight size={15} aria-hidden="true" /></Link><LocalSaveButton unitId={college.unitId} collegeName={college.name} /></div>
  </article>;
}

function AdviserSession({ userId, available, authNotice, authBlocked, authRetryAvailable, onUnauthorized, onSessionVerificationFailure, onRetrySessionVerification, onAuthRecovered }: { userId: string; available: boolean; authNotice: string | null; authBlocked: boolean; authRetryAvailable: boolean; onUnauthorized(userId: string): void; onSessionVerificationFailure(userId: string): void; onRetrySessionVerification(userId: string): void; onAuthRecovered(userId: string): void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOffset, setHistoryOffset] = useState<number | null>(null);
  const [messagesOffset, setMessagesOffset] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingJob, setPendingJob] = useState<PendingJob | null>(null);
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(false);
  const [usage, setUsage] = useState<AdviserUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | "all" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const effectGeneration = useRef(0);
  const historyRevision = useRef(0);
  const pendingRevision = useRef(0);
  const pendingJobRef = useRef<PendingJob | null>(null);
  const requests = useRef(new Set<AbortController>());
  const historyPageRequest = useRef(false);
  const suppressedPendingIds = useRef(new Set<string>());
  const requestIdentity = useRef<{ id: string; text: string; conversationId: string | null } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const lastReply = useRef<HTMLDivElement>(null);

  const replacePendingJob = useCallback((next: PendingJob | null) => {
    pendingRevision.current += 1;
    pendingJobRef.current = next;
    setPendingJob(next);
  }, []);

  const api = useCallback(async (query = "", init: RequestInit = {}) => {
    const generation = effectGeneration.current;
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        onSessionVerificationFailure(userId);
        throw new AdviserSessionVerificationError("Account services are unavailable.");
      }
      let session;
      try { session = await captureVerifiedSupabaseSession(supabase, userId); }
      catch (cause) {
        if (!generation || generation !== effectGeneration.current) throw cause;
        onSessionVerificationFailure(userId);
        throw new AdviserSessionVerificationError(cause instanceof Error ? cause.message : undefined);
      }
      if (!generation || generation !== effectGeneration.current) throw new Error("Account changed.");
      const response = await fetch(`/api/adviser${query}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.accessToken}` }, signal: controller.signal });
      let result;
      try { result = await response.json(); }
      catch {
        if (!response.ok) throw new AdviserApiError(response.status, "That request could not be completed.");
        throw new Error("The adviser returned an unreadable response.");
      }
      const payload = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
      if (!response.ok) throw new AdviserApiError(response.status,
        typeof payload.message === "string" ? payload.message : "That request could not be completed.",
        typeof payload.code === "string" ? payload.code : undefined);
      if (generation !== effectGeneration.current) throw new Error("Account changed.");
      return result;
    } finally { requests.current.delete(controller); }
  }, [onSessionVerificationFailure, userId]);

  const loadHistory = useCallback(async (offset = 0, options: { clearMissingRequestId?: string } = {}): Promise<AdviserHistoryRefresh | null> => {
    const generation = effectGeneration.current;
    const revision = historyRevision.current;
    const pendingVersion = pendingRevision.current;
    const pendingRequestAtStart = pendingJobRef.current?.requestId ?? null;
    const result = await api(offset ? `?offset=${offset}` : "");
    if (!generation || generation !== effectGeneration.current || revision !== historyRevision.current) return null;
    setConversations((current) => offset ? [...current, ...result.conversations] : result.conversations);
    setHistoryOffset(result.nextOffset); setUsage(result.usage);
    let pendingApplied = false;
    if (pendingVersion === pendingRevision.current) {
      const reconciled = reconcilePendingHistory({
        current: pendingJobRef.current,
        incoming: result.pendingJob ?? null,
        revisionAtStart: pendingVersion,
        currentRevision: pendingRevision.current,
        requestIdAtStart: pendingRequestAtStart,
        clearMissingRequest: options.clearMissingRequestId !== undefined && options.clearMissingRequestId === pendingRequestAtStart,
        isSuppressed: (requestId) => suppressedPendingIds.current.has(requestId),
      });
      if (reconciled.applied) {
        const current = pendingJobRef.current;
        const next = reconciled.value;
        if (current?.requestId !== next?.requestId || current?.status !== next?.status || current?.message !== next?.message || current?.conversationId !== next?.conversationId) {
          replacePendingJob(next);
        }
        pendingApplied = true;
      }
    }
    setHistoryError(null);
    return {
      response: result as AdviserHistoryResult,
      pendingApplied,
      pendingRequestAtStart,
      pendingRequestAfter: pendingJobRef.current?.requestId ?? null,
      pendingRevisionAtStart: pendingVersion,
      pendingRevisionAfter: pendingRevision.current,
    };
  }, [api, replacePendingJob]);

  useEffect(() => {
    if (authBlocked) return;
    const generation = ++effectGeneration.current;
    const start = setTimeout(() => {
      setLoading(true);
      loadHistory().catch((cause) => {
        if (generation !== effectGeneration.current || (cause as Error)?.name === "AbortError") return;
        if (cause instanceof AdviserSessionVerificationError) return;
        setHistoryError((cause as Error).message);
      }).finally(() => { if (generation === effectGeneration.current) setLoading(false); });
    }, 0);
    const controllers = requests.current;
    return () => {
      clearTimeout(start);
      if (generation === effectGeneration.current) effectGeneration.current += 1;
      for (const controller of controllers) controller.abort();
    };
  }, [authBlocked, loadHistory]);

  async function openConversation(id: string, offset = 0) {
    if (authBlocked || busy || loading || loadingMore || deleting) return;
    const generation = effectGeneration.current;
    if (!offset && id === conversationId) return;
    if (!offset && id !== conversationId && draft.trim()) { setError("Send or clear your draft before switching conversations."); return; }
    setLoading(true); setError(null);
    try {
      const result = await api(`?conversationId=${id}${offset ? `&offset=${offset}` : ""}`);
      if (generation !== effectGeneration.current) return;
      const loaded: Message[] = result.messages;
      if (!offset && pendingJob?.conversationId === id && !loaded.some((message) => message.request_id === pendingJob.requestId)) {
        loaded.push({ id: `${pendingJob.requestId}-pending`, request_id: pendingJob.requestId, role: "user",
          payload: { text: pendingJob.message }, created_at: new Date().toISOString() });
      }
      setMessages((current) => offset ? [...loaded, ...current] : loaded);
      setMessagesOffset(result.nextOffset); setConversationId(id);
      if (!offset) { setDraft(""); requestIdentity.current = null; }
    } catch (cause) { if (generation === effectGeneration.current) setError((cause as Error).message); }
    finally { if (generation === effectGeneration.current) setLoading(false); }
  }

  function newConversation() {
    if (authBlocked || !available || busy || loading || loadingMore || deleting) return;
    setConversationId(null); setMessages([]); setMessagesOffset(null); setError(null); requestIdentity.current = null;
    composer.current?.focus();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (authBlocked || !available || !draft.trim() || !consent || busy || pendingJob || loading || loadingMore || usage?.remaining === 0) return;
    const generation = effectGeneration.current;
    const text = draft.trim();
    const prior = requestIdentity.current;
    const id = prior && prior.text === text && prior.conversationId === conversationId ? prior.id : crypto.randomUUID();
    requestIdentity.current = { id, text, conversationId };
    setBusy(true); setError(null);
    try {
      const result = await api("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, conversationId, message: text, consentVersion: "2026-10-04" }) });
      if (generation !== effectGeneration.current) return;
      setConversationId(result.conversationId);
      if (result.status === "queued") {
        replacePendingJob({ requestId: id, conversationId: result.conversationId, message: text, status: "queued" });
        setMessages((current) => [...current.filter((message) => message.request_id !== id), {
          id: `${id}-pending`, request_id: id, role: "user", payload: { text }, created_at: new Date().toISOString(),
        }]);
        setDraft("");
        void loadHistory().catch((cause) => {
          if (generation === effectGeneration.current && (cause as Error)?.name !== "AbortError") {
            setHistoryError("Your message is queued, but the conversation list could not be refreshed. Try loading history again.");
          }
        });
        return;
      }
      setUsage(result.usage);
      setMessages((current) => [...current, { id: `${id}-user`, request_id: id, role: "user", payload: { text }, created_at: new Date().toISOString() }, { id: `${id}-assistant`, request_id: id, role: "assistant", payload: result.answer, created_at: new Date().toISOString() }]);
      setDraft(""); requestIdentity.current = null;
      void loadHistory().catch((cause) => {
        if (generation === effectGeneration.current && (cause as Error)?.name !== "AbortError") {
          setHistoryError("Your reply was saved, but the conversation list could not be refreshed. Try loading history again.");
        }
      });
      window.requestAnimationFrame(() => lastReply.current?.focus());
    } catch (cause) { if (generation === effectGeneration.current) setError((cause as Error).message); }
    finally { if (generation === effectGeneration.current) setBusy(false); }
  }

  useEffect(() => {
    if (!pendingJob || authBlocked) return;
    let cancelled = false;
    const pendingVersionAtStart = pendingRevision.current;
    const ownsPendingJob = () => isCurrentPendingRequest({
      requestId: pendingJob.requestId,
      revisionAtStart: pendingVersionAtStart,
      currentRequestId: pendingJobRef.current?.requestId ?? null,
      currentRevision: pendingRevision.current,
    });
    const handleUnauthorized = () => {
      if (!ownsPendingJob()) return false;
      effectGeneration.current += 1;
      historyRevision.current += 1;
      for (const controller of requests.current) controller.abort();
      replacePendingJob(null);
      setConversations([]); setHistoryOffset(null); setMessages([]); setMessagesOffset(null);
      setConversationId(null); setDraft(""); setConsent(false); setUsage(null);
      setBusy(false); setLoadingMore(false); setDeleting(false); historyPageRequest.current = false;
      setHistoryError(null); setDeleteTarget(null); setError("Your adviser sign-in is no longer accepted. Sign in again to continue.");
      requestIdentity.current = null;
      onUnauthorized(userId);
      return true;
    };
    const restoreMissingRequest = () => {
      setMessages((current) => current.filter((message) => message.request_id !== pendingJob.requestId));
      setDraft((current) => current.trim() ? current : pendingJob.message);
      requestIdentity.current = null;
      setError("We couldn't find that queued message. Its text is back in your draft; review it before sending again.");
    };
    const poll = async () => {
      if (cancelled || !ownsPendingJob() || suppressedPendingIds.current.has(pendingJob.requestId)) return false;
      try {
        const result = await api(`?requestId=${pendingJob.requestId}`);
        if (cancelled || !ownsPendingJob() || suppressedPendingIds.current.has(pendingJob.requestId)) return false;
        if (result.status === "completed") {
          replacePendingJob(null); requestIdentity.current = null;
          if (conversationId === result.conversationId && result.answer) {
            setMessages((current) => [...current.filter((message) => message.request_id !== pendingJob.requestId || message.role !== "assistant"), {
              id: `${pendingJob.requestId}-assistant`, request_id: pendingJob.requestId, role: "assistant",
              payload: result.answer, created_at: new Date().toISOString(),
            }]);
            window.requestAnimationFrame(() => lastReply.current?.focus());
          }
          void loadHistory().catch(() => {});
          return false;
        }
        if (result.status === "failed" || result.status === "deleted") {
          replacePendingJob(null); requestIdentity.current = null;
          setMessages((current) => current.filter((message) => message.request_id !== pendingJob.requestId));
          if (result.status === "failed") setDraft((current) => current.trim() ? current : pendingJob.message);
          setError(result.status === "deleted" ? "That conversation was deleted while the message was queued." : "The adviser couldn't finish that message. Your draft is back; you can edit it or send again.");
          void loadHistory().catch(() => {});
          return false;
        }
        if ((result.status === "queued" || result.status === "running") && result.status !== pendingJob.status) {
          replacePendingJob({ ...pendingJob, status: result.status });
        }
      } catch (cause) {
        if (cancelled || suppressedPendingIds.current.has(pendingJob.requestId)) return false;
        if (cause instanceof AdviserApiError) {
          const disposition = classifyPollError(cause);
          if (disposition === "unauthorized") {
            handleUnauthorized();
            return false;
          }
          if (disposition === "missing") {
            if (!ownsPendingJob()) return false;
            try {
              const refresh = await loadHistory(0, { clearMissingRequestId: pendingJob.requestId });
              if (cancelled || suppressedPendingIds.current.has(pendingJob.requestId)) return false;
              if (!refresh) return ownsPendingJob();
              if (refresh.response.pendingJob?.requestId === pendingJob.requestId && refresh.pendingRequestAfter === pendingJob.requestId) {
                return isCurrentPendingRequest({
                  requestId: pendingJob.requestId,
                  revisionAtStart: refresh.pendingRevisionAfter,
                  currentRequestId: pendingJobRef.current?.requestId ?? null,
                  currentRevision: pendingRevision.current,
                });
              }
              const mayRestore = shouldRestoreMissingRequest({
                requestId: pendingJob.requestId,
                responseRequestId: refresh.response.pendingJob?.requestId ?? null,
                requestIdAtStart: refresh.pendingRequestAtStart,
                requestIdAfterResponse: refresh.pendingRequestAfter,
                revisionAtStart: refresh.pendingRevisionAtStart,
                revisionAfterResponse: refresh.pendingRevisionAfter,
                currentRequestId: pendingJobRef.current?.requestId ?? null,
                currentRevision: pendingRevision.current,
                applied: refresh.pendingApplied,
              });
              if (mayRestore) restoreMissingRequest();
              return false;
            } catch (refreshError) {
              if (cancelled || suppressedPendingIds.current.has(pendingJob.requestId)) return false;
              if (refreshError instanceof AdviserSessionVerificationError) {
                return false;
              }
              if (refreshError instanceof AdviserApiError) {
                const refreshDisposition = classifyPollError(refreshError);
                if (refreshDisposition === "unauthorized") {
                  handleUnauthorized();
                  return false;
                }
                if (refreshDisposition === "rejected" || refreshDisposition === "missing") {
                  if (ownsPendingJob()) {
                    replacePendingJob(null);
                    restoreMissingRequest();
                    setHistoryError("The request could not be reconciled with your history. Your message is back in the draft.");
                  }
                  return false;
                }
              }
              // Keep the durable job preview while a transient history read fails.
              return ownsPendingJob();
            }
          }
          if (disposition === "rejected") {
            if (ownsPendingJob()) {
              replacePendingJob(null);
              restoreMissingRequest();
              setError(cause.message || "That adviser request could not be checked. Your draft is back; review it before sending again.");
            }
            return false;
          }
        } else if (cause instanceof AdviserSessionVerificationError) {
          return false;
        }
        // Network and 5xx failures are transient; keep the durable preview and use backoff.
      }
      return !cancelled && ownsPendingJob() && !suppressedPendingIds.current.has(pendingJob.requestId);
    };
    const loop = createPollLoop(poll, { isVisible: () => !document.hidden,
      setTimer: (callback, delay) => setTimeout(callback, delay), clearTimer: clearTimeout });
    const onVisibilityChange = () => loop.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibilityChange);
    loop.start();
    return () => { cancelled = true; loop.stop(); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [api, authBlocked, conversationId, loadHistory, onUnauthorized, pendingJob, replacePendingJob, userId]);

  async function deleteHistory() {
    if (authBlocked || !deleteTarget || deleting || loading || loadingMore || busy) return;
    const generation = effectGeneration.current;
    const target = deleteTarget;
    const pendingToDelete = pendingJob && (target === "all" || target === pendingJob.conversationId) ? pendingJob : null;
    if (pendingToDelete) suppressedPendingIds.current.add(pendingToDelete.requestId);
    historyRevision.current += 1;
    setDeleting(true); setError(null);
    try {
      await api(target === "all" ? "" : `?conversationId=${target}`, { method: "DELETE", headers: { "X-CollegeSearch-Delete-History": "delete-history" } });
      if (generation !== effectGeneration.current) return;
      historyRevision.current += 1;
      if (pendingToDelete) { replacePendingJob(null); requestIdentity.current = null; }
      setConversations((current) => target === "all" ? [] : current.filter((conversation) => conversation.id !== target));
      if (target === "all" || target === conversationId) { setMessages([]); setConversationId(null); setMessagesOffset(null); requestIdentity.current = null; }
      setDeleteTarget(null);
      try { await loadHistory(); }
      catch (cause) {
        if (generation === effectGeneration.current && (cause as Error)?.name !== "AbortError") {
          setHistoryError("History was deleted, but the conversation list could not be refreshed. Try loading history again.");
        }
      }
    } catch (cause) {
      historyRevision.current += 1;
      if (pendingToDelete) {
        suppressedPendingIds.current.delete(pendingToDelete.requestId);
        if (generation === effectGeneration.current) replacePendingJob({ ...pendingToDelete });
      }
      if (generation === effectGeneration.current) {
        setError((cause as Error).message);
        void loadHistory().catch((refreshError) => {
          if (generation === effectGeneration.current && (refreshError as Error)?.name !== "AbortError") {
            setHistoryError("History could not be refreshed after the deletion failed. Try loading history again.");
          }
        });
      }
    }
    finally { if (generation === effectGeneration.current) setDeleting(false); }
  }

  async function retryHistoryRefresh() {
    if (loading || loadingMore || deleting || busy) return;
    const generation = effectGeneration.current;
    setLoading(true); setHistoryError(null);
    try { await loadHistory(); }
    catch (cause) {
      if (generation === effectGeneration.current && (cause as Error)?.name !== "AbortError") setHistoryError((cause as Error).message);
    } finally {
      if (generation === effectGeneration.current) setLoading(false);
    }
  }

  async function loadMoreHistory() {
    if (authBlocked || historyOffset === null || historyPageRequest.current || loading || loadingMore || deleting || busy) return;
    const generation = effectGeneration.current;
    historyPageRequest.current = true;
    setLoadingMore(true);
    try { await loadHistory(historyOffset); }
    catch (cause) {
      if (generation === effectGeneration.current && (cause as Error)?.name !== "AbortError") setHistoryError((cause as Error).message);
    } finally {
      historyPageRequest.current = false;
      if (generation === effectGeneration.current) setLoadingMore(false);
    }
  }

  function retrySessionVerification() {
    if (authBlocked && authRetryAvailable) {
      const current = pendingJobRef.current;
      if (current) replacePendingJob(copyPendingJobForRetry(current));
      setBusy(false); setLoading(false); setLoadingMore(false); setDeleting(false); historyPageRequest.current = false;
      setError(null); setHistoryError(null);
      onRetrySessionVerification(userId);
    }
  }

  return <div className={styles.workspace}>
    {authNotice && <div className={styles.notice} role="alert"><p>{authNotice}</p>{authRetryAvailable && <button className={styles.textButton} type="button" onClick={retrySessionVerification}>Retry account check</button>}<AuthDialog onSignedIn={() => { setError(null); onAuthRecovered(userId); if (!authBlocked) void retryHistoryRefresh(); }}><button className={styles.textButton} type="button">Sign in again</button></AuthDialog></div>}
    <aside className={styles.history} aria-label="Private conversation history"><div className={styles.historyDisclosure} data-open={historyOpen}>
      <button className={styles.historySummary} type="button" aria-expanded={historyOpen} aria-controls="adviser-history-content" onClick={() => setHistoryOpen((open) => !open)}><span>Your conversations</span><ChevronDown className={styles.historyChevron} size={16} aria-hidden="true" /></button>
      <div id="adviser-history-content" className={styles.historyContent} data-open={historyOpen}>
      {available && <button className={styles.newConversation} disabled={authBlocked || busy || loading || loadingMore || deleting} onClick={newConversation}><Plus size={17} aria-hidden="true" /> New conversation</button>}<h2 className={styles.historyHeading}>Your conversations</h2>
      {loading && !conversations.length ? <p role="status">Loading your history…</p> : !conversations.length ? <p className={styles.muted}>Your conversations will appear here.</p> : <ul>{conversations.map((conversation) => <li key={conversation.id}><button disabled={authBlocked || busy || loading || loadingMore || deleting} className={conversationId === conversation.id ? styles.selectedHistory : ""} onClick={() => openConversation(conversation.id)} aria-current={conversationId === conversation.id ? "true" : undefined}><span>{conversation.title}</span><small>{pendingJob?.conversationId === conversation.id ? (pendingJob.status === "running" ? "Processing" : "Queued") : new Date(conversation.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></button><button disabled={authBlocked || busy || loading || loadingMore || deleting} aria-label={`Delete conversation: ${conversation.title}`} onClick={() => setDeleteTarget(conversation.id)}><Trash2 size={15} aria-hidden="true" /></button></li>)}</ul>}
      {historyError && <div role="alert"><p className={styles.error}>{historyError}</p><button className={styles.textButton} disabled={authBlocked || busy || loading || loadingMore || deleting} onClick={retryHistoryRefresh}>Retry history refresh</button></div>}
      {historyOffset !== null && <button className={styles.textButton} disabled={authBlocked || busy || loading || loadingMore || deleting} onClick={loadMoreHistory}>{loadingMore ? "Loading conversations…" : "Load more conversations"}</button>}
      {conversations.length > 0 && <button className={styles.textButton} disabled={authBlocked || busy || loading || loadingMore || deleting} onClick={() => setDeleteTarget("all")}>Delete all history</button>}
      <div className={styles.retention}><ShieldCheck size={17} aria-hidden="true" /><p>Private to your account. Conversations expire after 90 days without a new reply and are removed by the nightly cleanup. <Link href="/privacy#adviser-privacy">Privacy details</Link></p></div>
      </div>
    </div></aside>
    <section className={styles.conversation} aria-label="College adviser conversation">
      <div className={styles.conversationTop}><strong>College adviser</strong>{available && usage && <span>{usage.remaining} of {usage.limit} free messages left<small>Resets {new Date(usage.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} (UTC)</small></span>}</div>
      <div className={styles.messages} aria-busy={busy || loading}>
        {!messages.length && (available ? <div className={styles.welcome}><BookOpen size={27} aria-hidden="true" /><h2>What would you like your college experience to look like?</h2><p>You don&apos;t need to have it all figured out. Start with a subject, a place or a question about cost.</p><div className={styles.examples}>{examples.map((example) => <button key={example} disabled={authBlocked} onClick={() => { setDraft(example); composer.current?.focus(); }}>{example}<ArrowRight size={15} aria-hidden="true" /></button>)}</div></div> : <div className={styles.welcome}><BookOpen size={27} aria-hidden="true" /><h2>Your saved adviser conversations</h2><p>Open a conversation from your history to review it. New messages are unavailable right now.</p></div>)}
        {messagesOffset !== null && conversationId && <button className={styles.textButton} disabled={authBlocked || loading} onClick={() => openConversation(conversationId, messagesOffset)}>Load earlier messages</button>}
        {messages.map((message, index) => message.role === "user" ? <div className={styles.userMessage} key={message.id}><span>You</span><p>{message.payload.text}</p></div> : <div className={styles.answer} key={message.id} ref={index === messages.length - 1 ? lastReply : undefined} tabIndex={-1} aria-label="Adviser response"><span className={styles.answerLabel}>COLLEGE ADVISER</span><p>{message.payload.message}</p>
          {message.payload.recommendations?.map((college) => <AdviserRecommendationCard key={college.unitId} college={college} />)}
          {!!message.payload.recommendations && message.payload.recommendations.length > 1 && <Link className={styles.compareLink} href={`/compare?ids=${message.payload.recommendations.map((college) => college.unitId).join(",")}`}><Scale size={17} aria-hidden="true" /> Compare these colleges</Link>}
          {!!message.payload.notices?.length && <details className={styles.answerNotes}><summary>Research notes &amp; limits</summary><ul>{message.payload.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul></details>}
          {message.payload.question && <p className={styles.followUp}>{message.payload.question}</p>}
        </div>)}
        {busy && <div className={styles.loading} role="status"><span>Saving your message…</span><div /><div /><div /></div>}
        {pendingJob?.conversationId === conversationId && <div className={styles.loading} role="status"><span>{pendingJob.status === "running" ? "Checking college evidence…" : "Your message is queued…"}</span><div /><div /><div /></div>}
      </div>
      {available ? <form className={styles.composer} onSubmit={send}><label htmlFor="adviser-message">Your message</label><textarea id="adviser-message" ref={composer} rows={3} maxLength={2000} value={draft} disabled={authBlocked || busy || loading} onChange={(event) => setDraft(event.target.value)} placeholder="Tell me what matters to you in a college…" aria-describedby="adviser-consent adviser-form-error" />
        <label className={styles.consent} id="adviser-consent"><input type="checkbox" checked={consent} disabled={authBlocked || busy} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send my message and research preferences to NVIDIA. I&apos;ll leave out names, contact details and sensitive information. <Link href="/privacy#adviser-privacy">What is shared</Link></span></label>
        <div id="adviser-form-error" role={error ? "alert" : undefined}>{error && <p className={styles.error}>{error}</p>}</div>
        {usage?.remaining === 0 && <p className={styles.notice}>Your monthly allowance is used. Your history, draft and <Link href="/explore">free college tools</Link> are still available.</p>}
        <div className={styles.sendRow}><small>{draft.length}/2,000 · {pendingJob ? (pendingJob.status === "running" ? "Your queued message is processing." : "Your message is queued; you can keep browsing your history.") : !consent ? "Agree to the privacy note to send." : "Your profile and notes are not attached."}</small><button className={styles.primary} type="submit" disabled={authBlocked || busy || !!pendingJob || loading || loadingMore || !consent || !draft.trim() || usage?.remaining === 0}>{busy ? "Saving…" : pendingJob?.status === "running" ? "Processing…" : pendingJob ? "Queued" : "Send"}<ArrowUp size={18} aria-hidden="true" /></button></div>
      </form> : <div className={styles.composer}><p className={styles.notice} role="status">The adviser is not available for new messages right now. Your private history and deletion controls remain available.</p></div>}
    </section>
    <Dialog.Root open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}><Dialog.Portal><Dialog.Overlay className={styles.modalOverlay} /><Dialog.Content className={styles.modal}><Dialog.Title>{deleteTarget === "all" ? "Delete all adviser history?" : "Delete this conversation?"}</Dialog.Title><Dialog.Description>Messages and saved adviser answers will be removed. Your current unsent draft will stay in the message box; if it belonged to the deleted conversation, sending it later will start a new conversation. Your saved colleges and research notes are kept. This cannot be undone.</Dialog.Description>{error && <p className={styles.error} role="alert">{error}</p>}<div><Dialog.Close asChild><button disabled={deleting}>Keep history</button></Dialog.Close><button className={styles.primary} disabled={authBlocked || deleting || loading || loadingMore || busy} onClick={deleteHistory}>{deleting ? "Deleting…" : "Delete history"}</button></div><Dialog.Close asChild><button className={styles.modalClose} disabled={deleting} aria-label="Close delete history dialog"><X size={20} aria-hidden="true" /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
