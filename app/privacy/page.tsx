import type { Metadata } from "next";
import { Database, HardDrive, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "Privacy | CollegeSearch",
  description: "What CollegeSearch stores, where it stays, and what is not collected.",
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="page-shell methodology-page">
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">CollegeSearch</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Privacy</span>
        </nav>

        <header className="methodology-masthead">
          <div>
            <span className="page-eyebrow">
              <ShieldCheck size={15} aria-hidden="true" />
              Plain-language privacy note
            </span>
            <h1>Your college list is yours.</h1>
          </div>
          <p>
            CollegeSearch keeps browser-only saves separate from account data.
            When account services are configured and you sign in, new account
            saves can sync; existing browser saves require an explicit import.
          </p>
        </header>

        <section className="methodology-section" aria-labelledby="stored-heading">
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">01</span>
              <h2 id="stored-heading">What is stored today</h2>
            </div>
          </div>
          <ul className="methodology-rule-list">
            <li>
              <span><HardDrive size={19} aria-hidden="true" /></span>
              <div>
                <strong>Browser-only saves stay separate.</strong>
                <p>
                  College identifiers are stored in browser local storage under
                  <code> college-search-saved</code>. Remove individual saves on
                  the Saved page or clear this site&apos;s browser data to erase them.
                  Signing in does not upload this guest list automatically.
                  An explicit successful import moves the selected college saves
                  into your account and removes them from the guest shortlist.
                  Guest research notes, profiles, and deadlines are not imported.
                </p>
              </div>
            </li>
            <li>
              <span><KeyRound size={19} aria-hidden="true" /></span>
              <div>
                <strong>Account data exists only when authentication is configured.</strong>
                <p>
                  If a deployment enables Supabase and you sign up, Supabase
                  processes your email, password credential or Google identity,
                  authentication session, and college identifiers you save to
                  your account. Ownership rules restrict each account to its own
                  rows. CollegeSearch never places a privileged Supabase service
                  key in the browser.
                </p>
              </div>
            </li>
            <li>
              <span><HardDrive size={19} aria-hidden="true" /></span>
              <div>
                <strong>Signed-in lists also keep a browser recovery copy.</strong>
                <p>
                  CollegeSearch stores each verified account&apos;s college
                  identifiers and per-college pending save or remove actions in
                  UUID-scoped local-storage keys. This supports offline retry and
                  never stores email, tokens, or profile fields. Signing out
                  hides but does not erase that recovery copy; clear this
                  site&apos;s browser data to remove every local copy on a shared
                  browser profile.
                </p>
              </div>
            </li>
            <li>
              <span><HardDrive size={19} aria-hidden="true" /></span>
              <div>
                <strong>Research notes and checklists stay in this browser.</strong>
                <p>
                  Each college notebook is stored locally, separately for guests
                  and verified accounts. Notes do not sync or upload when you
                  sign in. Removing a college from your shortlist keeps its
                  notebook; use Clear all research to erase its notes, checklist,
                  and list category, or clear this site&apos;s browser data to remove all
                  local notebooks. Export research downloads a CSV containing
                  your current notes (including this tab&apos;s drafts), checklist, student-assigned list categories,
                  college metrics, and source links. Reach, target, and likely
                  labels are your own planning notes, not generated predictions.
                </p>
                <p>Edits have a recovery copy in this tab&apos;s session storage so they survive navigation and reload. Save research commits a copy in browser local storage. Save or download drafts before closing the tab. Complete notebook backups also include research for removed colleges; restoring a backup adds missing notebooks and leaves existing copies intact.</p>
              </div>
            </li>
            <li>
              <span><Database size={19} aria-hidden="true" /></span>
              <div>
                <strong>Your optional application profile stays local.</strong>
                <p>
                  Find my fit can keep the GPA, grading context, course notes,
                  activities, and priorities you choose to enter in this browser.
                  This optional profile is separate for guests and verified
                  accounts. It does not sync, enter shared links, or go to an AI
                  provider. Use Clear profile to remove it. A review brief is
                  downloaded only when you request it.
                </p>
                <p>Profile changes autosave to local storage, with a separate per-tab recovery draft in session storage. If storage, coordination between tabs, or account verification fails, the interface shows what still needs saving. Download your brief before leaving when a saved copy is unavailable.</p>
                <p>
                  Search and matching preferences are included in the page URL
                  so you can return to or share the same choices. Anyone with
                  that link can see those preferences. The application profile
                  does not change preference scores. The app does not request
                  transcripts, financial-aid records, or demographic profiles.
                </p>
              </div>
            </li>
            <li>
              <span><HardDrive size={19} aria-hidden="true" /></span>
              <div>
                <strong>Your deadline tracker stays local.</strong>
                <p>Dates, source links, tasks, and notes you enter are stored in this browser, separately for guests and verified accounts. Added tasks autosave; an unfinished form has a recovery copy in this tab. Dates are your own entries and checks, not a feed of college deadlines. The tracker does not send email or push reminders. Remove tasks individually or clear this site&apos;s browser data. Download a deadline backup to move the list; a restore preview asks before replacing the current list.</p>
              </div>
            </li>
          </ul>
        </section>

        <section id="adviser-privacy" className="methodology-section" aria-labelledby="adviser-privacy-heading">
          <div className="page-section-heading"><div><span className="page-section-index">02</span><h2 id="adviser-privacy-heading">When you use the college adviser</h2></div></div>
          <ul className="methodology-rule-list">
            <li><span><ShieldCheck size={19} aria-hidden="true" /></span><div><strong>You choose what to share.</strong><p>The adviser is available only after its provider setup and quality checks are complete. Before sending a message, you agree to share that message, the research preferences from your conversation and relevant public college evidence with NVIDIA for processing. Your email, account identifier, saved list, GPA, activities, research notes and raw conversation history are not automatically included in model requests.</p><p>Leave names, contact details, transcripts and other sensitive information out of your messages. The server removes recognizable email addresses, phone numbers, Social Security number patterns and web links before sending the current message, but this cannot reliably identify every kind of personal information. Your original message is saved privately if the reply completes.</p></div></li>
            <li><span><Database size={19} aria-hidden="true" /></span><div><strong>History belongs to your account.</strong><p>Supabase stores your adviser messages, replies, research preferences, source references and conversation dates under your account. Ownership rules and active-session checks restrict access. Student messages are never added to the shared college search index. Signing out hides this history; it does not delete it. Unsent adviser drafts stay in the current page&apos;s memory and are not stored on the server.</p></div></li>
            <li><span><HardDrive size={19} aria-hidden="true" /></span><div><strong>Delete a conversation or all adviser history at any time.</strong><p>The adviser&apos;s history controls remove messages and cached replies from the application database. Deleting your account also removes its adviser history. Conversations become inaccessible 90 days after the last completed reply and are scheduled for deletion by nightly cleanup. Deleting a conversation keeps your saved colleges, browser notes and usage allowance separate.</p><p>Content-free monthly usage counts remain until account deletion so removing a conversation cannot reset the free allowance. Opaque request identifiers, attempt status and token counts support safe retries; deleted conversation content is cleared immediately, and its remaining request records are removed after 90 days. Provider and hosting security logs or backups follow those providers&apos; retention terms and may not disappear immediately when you delete app history. No message bodies or API keys are intentionally written to application logs.</p></div></li>
          </ul>
        </section>

        <section className="methodology-section methodology-limitations" aria-labelledby="services-heading">
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">03</span>
              <h2 id="services-heading">Services and limits</h2>
            </div>
          </div>
          <ul>
            <li>
              This codebase does not include an advertising or behavioral
              analytics SDK. A production hosting provider may still keep
              standard request and security logs under its own terms.
            </li>
            <li>
              Opening an official college or source link sends you to that
              organization&apos;s website, where its privacy policy applies.
            </li>
            <li>
              Account settings includes a confirmed deletion control. When the server
              is configured, it removes your login, synced shortlist and adviser history and revokes
              all account sessions. Your notes, profile and deadline records for that
              account are cleared from accessible browser storage; other open tabs
              clear their local drafts when they resume. Guest data and other
              accounts are kept. Downloads and copies on other devices must be
              removed separately. A receipt containing only the deleted account
              identifier is retained locally to prevent old tabs restoring its data.
            </li>
            <li>
              This note describes the current repository build. A public launch
              needs an operator contact, effective date, retention schedule, and
              deployment-specific provider list.
            </li>
          </ul>
        </section>

        <aside className="methodology-integrity-note">
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <strong>Want to clear your local list?</strong>
            <p>Open My colleges and remove the colleges you no longer want retained.</p>
          </div>
          <Link className="page-primary-action" href="/my-colleges#colleges">
            Review saved colleges
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
