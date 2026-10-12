"use client";

import { BookOpen, Check, ChevronDown, Download, HardDrive, Trash2 } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import {
  APPLICANT_PROFILE_LIMITS,
  PREPARATION_CHECKLIST,
  applicantProfileKey,
  applicantProfileReviewNotes,
  buildApplicantBrief,
  createApplicantProfileSessionStore,
  deriveApplicantProfileScope,
  hasApplicantProfileContent,
  type ApplicantProfile as Profile,
} from "@/app/lib/applicant-profile";
import { getAccountErasureState } from "@/app/lib/account-browser-erasure";
import styles from "./ApplicantProfile.module.css";

const sessions = createApplicantProfileSessionStore(undefined, undefined, undefined, (scope) => getAccountErasureState(scope) === "active");
/** Wire to confirmed account-erasure notifications; never call for a transient auth error. */
export function forgetApplicantProfileScope(scope: string) { sessions.forget(scope); }

const subscribeToClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Only the provider can select an active, verified owner. Never guess guest. */
export function ApplicantProfile() {
  const saved = useSavedColleges();
  const clientReady = useSyncExternalStore(subscribeToClient, clientSnapshot, serverSnapshot);
  const scope = deriveApplicantProfileScope({ ...saved, clientReady });
  useLayoutEffect(() => {
    sessions.activate(scope);
    return () => sessions.activate(null);
  }, [scope]);
  return scope ? <ScopedApplicantProfile key={scope} scope={scope} /> : (
    <div className={styles.pending} role="status">
      Your optional applicant profile is paused while your browser or account is verified.
    </div>
  );
}

const longFields = [
  { key: "coursework", title: "Coursework taken or planned", help: "Include relevant subjects, level, and what you plan to take. Use your school’s course names." },
  { key: "opportunities", title: "Opportunities and course access", help: "What is available at your school? Note scheduling limits or context you want a counselor to understand. Share only what you are comfortable including." },
  { key: "activities", title: "Activities and responsibilities", help: "Clubs, paid work, family care, creative projects, volunteering, or independent learning all belong here. Describe your role, time, and contribution." },
  { key: "interests", title: "Interests to explore", help: "Subjects, problems, careers, or experiences you are curious about. It is fine to be undecided." },
  { key: "priorities", title: "What matters to me", help: "For example: affordability, location, support, community, flexibility, or learning environment. These notes do not set your match preferences below." },
] as const;

function ScopedApplicantProfile({ scope }: { scope: string }) {
  const id = useId();
  const [editor, setEditor] = useState(() => sessions.reconcile(scope));
  const [confirmClear, setConfirmClear] = useState(false);
  const clearProfileButtonRef = useRef<HTMLButtonElement>(null);
  const keepProfileButtonRef = useRef<HTMLButtonElement>(null);
  const saveStatusRef = useRef<HTMLParagraphElement>(null);
  const [clearing, setClearing] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [previewDate] = useState(() => new Date());
  const profile = editor.draft;
  const reviewNotes = applicantProfileReviewNotes(profile);
  const brief = buildApplicantBrief(profile, previewDate);
  const needsRecovery = editor.status === "conflict" || editor.status === "invalid";

  useEffect(() => {
    const unsubscribe = sessions.subscribe(() => setEditor(sessions.get(scope)));
    if (sessions.get(scope).status === "saving") void sessions.flush(scope);
    return unsubscribe;
  }, [scope]);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === null || event.key === applicantProfileKey(scope)) setEditor(sessions.reconcile(scope));
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [scope]);

  useEffect(() => {
    if (editor.persisted || !hasApplicantProfileContent(editor.draft)) return;
    const warnBeforeReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeReload);
    return () => window.removeEventListener("beforeunload", warnBeforeReload);
  }, [editor.persisted, editor.draft]);

  function setClearConfirmation(open: boolean, restoreFocus = true) {
    setConfirmClear(open);
    if (!restoreFocus) return;
    window.requestAnimationFrame(() => {
      const control = open ? keepProfileButtonRef.current : clearProfileButtonRef.current;
      control?.focus();
    });
  }

  async function recoverDraft(action: "replace" | "reload" | "retry", trigger: HTMLButtonElement) {
    const focusOrigin = document.activeElement;
    if (action === "reload") setEditor(sessions.useSaved(scope));
    else await sessions.saveDraft(scope, action === "replace");
    window.requestAnimationFrame(() => {
      // Only repair focus when the recovery action no longer exists.
      if (trigger.isConnected) return;
      const active = document.activeElement;
      const removedOrigin = focusOrigin && !focusOrigin.isConnected && active === document.body;
      if (active !== focusOrigin && !removedOrigin) return;
      const control = saveStatusRef.current;
      if (control && !control.closest("details:not([open]), [hidden], [inert]") && control.getClientRects().length) control.focus();
    });
  }

  function update(patch: Partial<Profile>) {
    setActionStatus("");
    setConfirmClear(false);
    setEditor(sessions.update(scope, patch));
    void sessions.flush(scope);
  }

  function download() {
    try {
      const blob = new Blob([brief], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "collegesearch-applicant-brief.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setActionStatus("Brief download requested. It includes the current entries shown in the preview, including any draft waiting to save.");
    } catch {
      setActionStatus("The download could not start. Open Preview my brief and copy its text.");
    }
  }

  return (
    <details className={styles.profile}>
      <summary className={styles.summary}>
        <span className={styles.summaryTitle}>
          <BookOpen size={22} aria-hidden="true" />
          <span><span className={styles.eyebrow}>Optional · A place to begin</span><span className={styles.title}>Your applicant profile</span></span>
        </span>
        <span className={styles.summaryEnd}>Prepare for a conversation<ChevronDown size={18} className={styles.chevron} aria-hidden="true" /></span>
      </summary>

      <div className={styles.body}>
        <div className={styles.intro}>
          <div>
            <h2>Put your experience in context.</h2>
            <p>Collect your academics, responsibilities, and questions in one place. Use your brief to start a conversation with a counselor or someone helping you plan.</p>
          </div>
          <aside className={styles.localNote}>
            <HardDrive size={19} aria-hidden="true" />
            <p>{scope === "guest" ? "Saved only in this browser’s guest profile." : "Saved only in this browser for this verified account."} Guest and account profiles stay separate. These notes do not sync, enter shared links, go to an AI provider, or change preference scores.</p>
          </aside>
        </div>

        <p ref={saveStatusRef} className={styles.saveStatus} role="status" tabIndex={-1}>
          {editor.status === "ready" ? <Check size={16} aria-hidden="true" /> : <HardDrive size={16} aria-hidden="true" />}
          <span>{editor.status === "ready"
            ? editor.persisted ? "Saved in this browser. Each change saves automatically." : "All fields are optional. Entries save in this browser as you type."
            : editor.status === "saving" ? editor.draftPersisted ? "Saving the browser copy. A recovery draft is already saved in this tab for reloads." : "Saving the browser copy. This tab could not save a recovery draft yet."
            : editor.status === "conflict" ? "Another tab changed the browser copy. Your draft is retained in this tab; review the preview before choosing which copy to keep."
            : editor.status === "invalid" ? "The browser copy could not be read. It has not been overwritten. You can prepare a new draft below and choose to replace it."
            : editor.draftPersisted ? "The shared browser copy could not be saved. A recovery draft is saved in this tab and survives reload, but closing the tab may erase it. Download your brief to keep a copy."
            : "Not saved: this browser cannot store or safely coordinate this profile. Your draft stays during navigation in this tab, but may be lost on reload or when the tab closes. Download your brief to keep a copy."}</span>
        </p>
        {needsRecovery ? (
          <div className={styles.recovery}>
            <button type="button" onClick={(event) => { void recoverDraft("replace", event.currentTarget); }}>Replace browser copy with my draft</button>
            <button type="button" onClick={(event) => { void recoverDraft("reload", event.currentTarget); }}>Discard my draft and reload browser copy</button>
          </div>
        ) : (editor.status === "unavailable" || editor.status === "unsupported") ? (
          <div className={styles.recovery}><button type="button" onClick={(event) => { void recoverDraft("retry", event.currentTarget); }}>Retry saving this draft</button></div>
        ) : null}

        <fieldset className={styles.section} disabled={clearing}>
          <legend>01 <span>Academic context</span></legend>
          <p className={styles.sectionHelp}>Use your school’s original grading system. We do not convert GPAs or estimate admission chances.</p>
          <div className={styles.gpaGrid}>
            <label htmlFor={`${id}-gpa`}>GPA as reported
              <input id={`${id}-gpa`} type="text" inputMode="decimal" maxLength={APPLICANT_PROFILE_LIMITS.gpa} value={profile.gpa} onChange={(event) => update({ gpa: event.target.value })} placeholder="For example, 3.7 or 92" autoComplete="off" aria-describedby={`${id}-gpa-help`} />
            </label>
            <label htmlFor={`${id}-scale`}>Original grading scale
              <input id={`${id}-scale`} type="text" maxLength={APPLICANT_PROFILE_LIMITS.scale} value={profile.scale} onChange={(event) => update({ scale: event.target.value })} placeholder="For example, 4.0 or 100" autoComplete="off" aria-describedby={`${id}-gpa-help`} />
            </label>
            <label htmlFor={`${id}-weighting`}>Weighting
              <select id={`${id}-weighting`} value={profile.weighting} onChange={(event) => update({ weighting: event.target.value as Profile["weighting"] })}>
                <option value="">Choose if known</option><option value="unweighted">Unweighted</option><option value="weighted">Weighted</option><option value="unknown">Not sure yet</option>
              </select>
            </label>
          </div>
          <p id={`${id}-gpa-help`} className={styles.help}>Enter the GPA exactly as your school reports it. Describe a different grading system in coursework if GPA does not apply.</p>
          {reviewNotes.length ? <ul className={styles.reviewNotes}>{reviewNotes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
          <div className={styles.fields}>
            {longFields.slice(0, 2).map((field) => (
              <label key={field.key} htmlFor={`${id}-${field.key}`}><span>{field.title}</span>
                <textarea id={`${id}-${field.key}`} value={profile[field.key]} maxLength={APPLICANT_PROFILE_LIMITS[field.key]} rows={4} onChange={(event) => update({ [field.key]: event.target.value })} aria-describedby={`${id}-${field.key}-help`} autoComplete="off" />
                <span className={styles.help} id={`${id}-${field.key}-help`}>{field.help} <span className={styles.counter}>{profile[field.key].length} / {APPLICANT_PROFILE_LIMITS[field.key]}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.section} disabled={clearing}>
          <legend>02 <span>Life beyond your grades</span></legend>
          <div className={styles.fields}>
            {longFields.slice(2).map((field) => (
              <label key={field.key} htmlFor={`${id}-${field.key}`} className={field.key === "activities" ? styles.fullWidth : undefined}><span>{field.title}</span>
                <textarea id={`${id}-${field.key}`} value={profile[field.key]} maxLength={APPLICANT_PROFILE_LIMITS[field.key]} rows={4} onChange={(event) => update({ [field.key]: event.target.value })} aria-describedby={`${id}-${field.key}-help`} autoComplete="off" />
                <span className={styles.help} id={`${id}-${field.key}-help`}>{field.help} <span className={styles.counter}>{profile[field.key].length} / {APPLICANT_PROFILE_LIMITS[field.key]}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.section} disabled={clearing}>
          <legend>03 <span>Prepare your next steps</span></legend>
          <div className={styles.fields}>
            <div className={styles.checklist}>
              <p className={styles.help}>A starting checklist you mark yourself.</p>
              {PREPARATION_CHECKLIST.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" checked={profile.checked.includes(item.id)} onChange={() => update({ checked: profile.checked.includes(item.id) ? profile.checked.filter((check) => check !== item.id) : [...profile.checked, item.id] })} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <label htmlFor={`${id}-nextSteps`}><span>My next steps and dates</span>
              <textarea id={`${id}-nextSteps`} value={profile.nextSteps} maxLength={APPLICANT_PROFILE_LIMITS.nextSteps} rows={7} onChange={(event) => update({ nextSteps: event.target.value })} aria-describedby={`${id}-dates-help`} autoComplete="off" />
              <span className={styles.help} id={`${id}-dates-help`}>Add the college, task, date, and official source you checked. These are your notes; CollegeSearch does not supply or verify deadlines here. <span className={styles.counter}>{profile.nextSteps.length} / {APPLICANT_PROFILE_LIMITS.nextSteps}</span></span>
            </label>
          </div>
        </fieldset>

        <div className={styles.briefArea}>
          <div><h3>Bring the context, and your questions.</h3><p>Preview includes your current entries. Download a text brief to review before sharing it yourself.</p></div>
          <button type="button" className={styles.download} onClick={download}><Download size={17} aria-hidden="true" />Download my brief</button>
          <details className={styles.preview}><summary>Preview my brief</summary><pre data-lenis-prevent tabIndex={0} aria-label="Applicant preparation brief preview">{brief}</pre></details>
          <p className={styles.help} role="status">{actionStatus}</p>
        </div>

        <div className={styles.clearArea}>
          <p>Signing out hides this account’s profile without erasing it. Anyone using the same browser profile can access guest notes. Clear your profile before leaving a shared device.</p>
          {confirmClear ? <div className={styles.clearConfirm}>
            <p id={`${id}-clear-question`}>Clear this {scope === "guest" ? "guest" : "account"} profile and its current draft from this browser?</p>
            <button type="button" disabled={clearing} aria-describedby={`${id}-clear-question`} onClick={async () => { const trigger = document.activeElement; setClearing(true); const result = await sessions.clear(scope); setEditor(result); setClearing(false); setClearConfirmation(false, document.activeElement === trigger || document.activeElement === document.body); setActionStatus(result.cleared ? "Profile cleared from this browser." : result.status === "conflict" ? "Another tab changed this profile before it could be cleared. Review the current copies first." : result.status === "ready" || result.status === "saving" ? "Profile was not cleared because it changed while clearing was pending. Review the current profile before trying again." : result.status === "blocked" ? "Profile clearing stopped because account or browser verification changed. No clear was completed." : "The browser could not fully clear the profile. Your draft is still available; clear this site’s browser data to remove all stored copies."); }}>{clearing ? "Clearing profile…" : "Yes, clear this profile"}</button>
            <button ref={keepProfileButtonRef} type="button" disabled={clearing} aria-describedby={`${id}-clear-question`} onClick={() => setClearConfirmation(false)}>Keep profile</button>
          </div> : <button ref={clearProfileButtonRef} type="button" onClick={() => setClearConfirmation(true)}><Trash2 size={16} aria-hidden="true" />Clear profile</button>}
        </div>
      </div>
    </details>
  );
}
