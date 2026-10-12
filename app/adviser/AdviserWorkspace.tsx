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
import { createPollLoop } from "@/app/lib/adviser/polling";
import type { AdviserPublicStatus } from "@/app/lib/adviser/server";
import type { AdviserUsage } from "@/app/lib/adviser/service";
import styles from "./adviser.module.css";

type Conversation = { id: string; title: string; updated_at: string; expires_at: string };
type Message = { id: string; request_id?: string | null; role: "user" | "assistant"; payload: { text?: string } & Partial<AdviserAnswer>; created_at: string };
type PendingJob = { requestId: string; conversationId: string; message: string; status: "queued" | "running" };
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
  if (status === "loading" || verification === "checking") return <div className={styles.loading} role="status" aria-busy="true"><span>Checking your account…</span><div /><div /><div /></div>;
  const verifiedId = status === "signed-in" && verification === "verified" && user && !user.is_anonymous ? user.id : null;
  if (!availability.available) {
    if (!verifiedId) return <InactiveAdviser collegeCount={availability.catalogCount} showHistorySignIn />;
    return <AdviserSession key={verifiedId} userId={verifiedId} available={false} />;
  }
  if (!verifiedId) return <section className={styles.signIn}><MessageSquare size={28} aria-hidden="true" /><h2>A place to work through your choices.</h2><p>Sign in for private conversation history and {availability.monthlyAllowance} free adviser messages per month. Browsing and preference matching work without an account.</p><AuthDialog><button className={styles.primary}>Sign in to start</button></AuthDialog><Link href="/match">Use preference match without an account</Link></section>;
  return <AdviserSession key={verifiedId} userId={verifiedId} available />;
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

function AdviserSession({ userId, available }: { userId: string; available: boolean }) {
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
  const requests = useRef(new Set<AbortController>());
  const historyPageRequest = useRef(false);
  const suppressedPendingIds = useRef(new Set<string>());
  const requestIdentity = useRef<{ id: string; text: string; conversationId: string | null } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const lastReply = useRef<HTMLDivElement>(null);

  const api = useCallback(async (query = "", init: RequestInit = {}) => {
    const generation = effectGeneration.current;
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Account services are unavailable.");
      const session = await captureVerifiedSupabaseSession(supabase, userId);
      if (!generation || generation !== effectGeneration.current) throw new Error("Account changed.");
      const response = await fetch(`/api/adviser${query}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.accessToken}` }, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "That request could not be completed.");
      if (generation !== effectGeneration.current) throw new Error("Account changed.");
      return result;
    } finally { requests.current.delete(controller); }
  }, [userId]);

  const loadHistory = useCallback(async (offset = 0) => {
    const generation = effectGeneration.current;
    const revision = historyRevision.current;
    const result = await api(offset ? `?offset=${offset}` : "");
    if (!generation || generation !== effectGeneration.current || revision !== historyRevision.current) return;
    setConversations((current) => offset ? [...current, ...result.conversations] : result.conversations);
    setHistoryOffset(result.nextOffset); setUsage(result.usage);
    if (result.pendingJob && !suppressedPendingIds.current.has(result.pendingJob.requestId)) setPendingJob(result.pendingJob);
    setHistoryError(null);
  }, [api]);

  useEffect(() => {
    const generation = ++effectGeneration.current;
    const start = setTimeout(() => {
      loadHistory().catch((cause) => {
        if (generation !== effectGeneration.current || (cause as Error)?.name === "AbortError") return;
        setHistoryError((cause as Error).message);
      }).finally(() => { if (generation === effectGeneration.current) setLoading(false); });
    }, 0);
    const controllers = requests.current;
    return () => {
      clearTimeout(start);
      if (generation === effectGeneration.current) effectGeneration.current += 1;
      for (const controller of controllers) controller.abort();
    };
  }, [loadHistory]);

  async function openConversation(id: string, offset = 0) {
    if (busy || loading || loadingMore || deleting) return;
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
    if (!available || busy || loading || loadingMore || deleting) return;
    setConversationId(null); setMessages([]); setMessagesOffset(null); setError(null); requestIdentity.current = null;
    composer.current?.focus();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!available || !draft.trim() || !consent || busy || pendingJob || loading || loadingMore || usage?.remaining === 0) return;
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
        setPendingJob({ requestId: id, conversationId: result.conversationId, message: text, status: "queued" });
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
    if (!pendingJob) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || suppressedPendingIds.current.has(pendingJob.requestId)) return false;
      try {
        const result = await api(`?requestId=${pendingJob.requestId}`);
        if (cancelled || suppressedPendingIds.current.has(pendingJob.requestId)) return false;
        if (result.status === "completed") {
          setPendingJob(null); requestIdentity.current = null;
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
          setPendingJob(null); requestIdentity.current = null;
          setMessages((current) => current.filter((message) => message.request_id !== pendingJob.requestId));
          if (result.status === "failed") setDraft((current) => current.trim() ? current : pendingJob.message);
          setError(result.status === "deleted" ? "That conversation was deleted while the message was queued." : "The adviser couldn't finish that message. Your draft is back; you can edit it or send again.");
          void loadHistory().catch(() => {});
          return false;
        }
        if ((result.status === "queued" || result.status === "running") && result.status !== pendingJob.status) {
          setPendingJob({ ...pendingJob, status: result.status });
        }
      } catch {
        // A transient status read does not discard the durable job or its local preview.
      }
      return !cancelled && !suppressedPendingIds.current.has(pendingJob.requestId);
    };
    const loop = createPollLoop(poll, { isVisible: () => !document.hidden,
      setTimer: (callback, delay) => setTimeout(callback, delay), clearTimer: clearTimeout });
    const onVisibilityChange = () => loop.visibilityChanged();
    document.addEventListener("visibilitychange", onVisibilityChange);
    loop.start();
    return () => { cancelled = true; loop.stop(); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [api, conversationId, loadHistory, pendingJob]);

  async function deleteHistory() {
    if (!deleteTarget || deleting || loading || loadingMore || busy) return;
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
      if (pendingToDelete) { setPendingJob(null); requestIdentity.current = null; }
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
        if (generation === effectGeneration.current) setPendingJob({ ...pendingToDelete });
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
    if (historyOffset === null || historyPageRequest.current || loading || loadingMore || deleting || busy) return;
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

  return <div className={styles.workspace}>
    <aside className={styles.history} aria-label="Private conversation history"><div className={styles.historyDisclosure} data-open={historyOpen}>
      <button className={styles.historySummary} type="button" aria-expanded={historyOpen} aria-controls="adviser-history-content" onClick={() => setHistoryOpen((open) => !open)}><span>Your conversations</span><ChevronDown className={styles.historyChevron} size={16} aria-hidden="true" /></button>
      <div id="adviser-history-content" className={styles.historyContent} data-open={historyOpen}>
      {available && <button className={styles.newConversation} disabled={busy || loading || loadingMore || deleting} onClick={newConversation}><Plus size={17} aria-hidden="true" /> New conversation</button>}<h2 className={styles.historyHeading}>Your conversations</h2>
      {loading && !conversations.length ? <p role="status">Loading your history…</p> : !conversations.length ? <p className={styles.muted}>Your conversations will appear here.</p> : <ul>{conversations.map((conversation) => <li key={conversation.id}><button disabled={busy || loading || loadingMore || deleting} className={conversationId === conversation.id ? styles.selectedHistory : ""} onClick={() => openConversation(conversation.id)} aria-current={conversationId === conversation.id ? "true" : undefined}><span>{conversation.title}</span><small>{pendingJob?.conversationId === conversation.id ? (pendingJob.status === "running" ? "Processing" : "Queued") : new Date(conversation.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></button><button disabled={busy || loading || loadingMore || deleting} aria-label={`Delete conversation: ${conversation.title}`} onClick={() => setDeleteTarget(conversation.id)}><Trash2 size={15} aria-hidden="true" /></button></li>)}</ul>}
      {historyError && <div role="alert"><p className={styles.error}>{historyError}</p><button className={styles.textButton} disabled={busy || loading || loadingMore || deleting} onClick={retryHistoryRefresh}>Retry history refresh</button></div>}
      {historyOffset !== null && <button className={styles.textButton} disabled={busy || loading || loadingMore || deleting} onClick={loadMoreHistory}>{loadingMore ? "Loading conversations…" : "Load more conversations"}</button>}
      {conversations.length > 0 && <button className={styles.textButton} disabled={busy || loading || loadingMore || deleting} onClick={() => setDeleteTarget("all")}>Delete all history</button>}
      <div className={styles.retention}><ShieldCheck size={17} aria-hidden="true" /><p>Private to your account. Conversations expire after 90 days without a new reply and are removed by the nightly cleanup. <Link href="/privacy#adviser-privacy">Privacy details</Link></p></div>
      </div>
    </div></aside>
    <section className={styles.conversation} aria-label="College adviser conversation">
      <div className={styles.conversationTop}><strong>College adviser</strong>{available && usage && <span>{usage.remaining} of {usage.limit} free messages left<small>Resets {new Date(usage.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} (UTC)</small></span>}</div>
      <div className={styles.messages} aria-busy={busy || loading}>
        {!messages.length && (available ? <div className={styles.welcome}><BookOpen size={27} aria-hidden="true" /><h2>What would you like your college experience to look like?</h2><p>You don&apos;t need to have it all figured out. Start with a subject, a place or a question about cost.</p><div className={styles.examples}>{examples.map((example) => <button key={example} onClick={() => { setDraft(example); composer.current?.focus(); }}>{example}<ArrowRight size={15} aria-hidden="true" /></button>)}</div></div> : <div className={styles.welcome}><BookOpen size={27} aria-hidden="true" /><h2>Your saved adviser conversations</h2><p>Open a conversation from your history to review it. New messages are unavailable right now.</p></div>)}
        {messagesOffset !== null && conversationId && <button className={styles.textButton} disabled={loading} onClick={() => openConversation(conversationId, messagesOffset)}>Load earlier messages</button>}
        {messages.map((message, index) => message.role === "user" ? <div className={styles.userMessage} key={message.id}><span>You</span><p>{message.payload.text}</p></div> : <div className={styles.answer} key={message.id} ref={index === messages.length - 1 ? lastReply : undefined} tabIndex={-1} aria-label="Adviser response"><span className={styles.answerLabel}>COLLEGE ADVISER</span><p>{message.payload.message}</p>
          {message.payload.recommendations?.map((college) => <AdviserRecommendationCard key={college.unitId} college={college} />)}
          {!!message.payload.recommendations && message.payload.recommendations.length > 1 && <Link className={styles.compareLink} href={`/compare?ids=${message.payload.recommendations.map((college) => college.unitId).join(",")}`}><Scale size={17} aria-hidden="true" /> Compare these colleges</Link>}
          {!!message.payload.notices?.length && <details className={styles.answerNotes}><summary>Research notes &amp; limits</summary><ul>{message.payload.notices.map((notice) => <li key={notice}>{notice}</li>)}</ul></details>}
          {message.payload.question && <p className={styles.followUp}>{message.payload.question}</p>}
        </div>)}
        {busy && <div className={styles.loading} role="status"><span>Saving your message…</span><div /><div /><div /></div>}
        {pendingJob?.conversationId === conversationId && <div className={styles.loading} role="status"><span>{pendingJob.status === "running" ? "Checking college evidence…" : "Your message is queued…"}</span><div /><div /><div /></div>}
      </div>
      {available ? <form className={styles.composer} onSubmit={send}><label htmlFor="adviser-message">Your message</label><textarea id="adviser-message" ref={composer} rows={3} maxLength={2000} value={draft} disabled={busy || loading} onChange={(event) => setDraft(event.target.value)} placeholder="Tell me what matters to you in a college…" aria-describedby="adviser-consent adviser-form-error" />
        <label className={styles.consent} id="adviser-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send my message and research preferences to NVIDIA. I&apos;ll leave out names, contact details and sensitive information. <Link href="/privacy#adviser-privacy">What is shared</Link></span></label>
        <div id="adviser-form-error" role={error ? "alert" : undefined}>{error && <p className={styles.error}>{error}</p>}</div>
        {usage?.remaining === 0 && <p className={styles.notice}>Your monthly allowance is used. Your history, draft and <Link href="/explore">free college tools</Link> are still available.</p>}
        <div className={styles.sendRow}><small>{draft.length}/2,000 · {pendingJob ? (pendingJob.status === "running" ? "Your queued message is processing." : "Your message is queued; you can keep browsing your history.") : !consent ? "Agree to the privacy note to send." : "Your profile and notes are not attached."}</small><button className={styles.primary} type="submit" disabled={busy || !!pendingJob || loading || loadingMore || !consent || !draft.trim() || usage?.remaining === 0}>{busy ? "Saving…" : pendingJob?.status === "running" ? "Processing…" : pendingJob ? "Queued" : "Send"}<ArrowUp size={18} aria-hidden="true" /></button></div>
      </form> : <div className={styles.composer}><p className={styles.notice} role="status">The adviser is not available for new messages right now. Your private history and deletion controls remain available.</p></div>}
    </section>
    <Dialog.Root open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}><Dialog.Portal><Dialog.Overlay className={styles.modalOverlay} /><Dialog.Content className={styles.modal}><Dialog.Title>{deleteTarget === "all" ? "Delete all adviser history?" : "Delete this conversation?"}</Dialog.Title><Dialog.Description>Messages and saved adviser answers will be removed. Your current unsent draft will stay in the message box; if it belonged to the deleted conversation, sending it later will start a new conversation. Your saved colleges and research notes are kept. This cannot be undone.</Dialog.Description>{error && <p className={styles.error} role="alert">{error}</p>}<div><Dialog.Close asChild><button disabled={deleting}>Keep history</button></Dialog.Close><button className={styles.primary} disabled={deleting || loading || loadingMore || busy} onClick={deleteHistory}>{deleting ? "Deleting…" : "Delete history"}</button></div><Dialog.Close asChild><button className={styles.modalClose} disabled={deleting} aria-label="Close delete history dialog"><X size={20} aria-hidden="true" /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
