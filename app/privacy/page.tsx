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
            CollegeSearch is currently a research prototype. It stores saved
            colleges in your browser and does not yet sync lists or student
            academic profiles to a CollegeSearch database.
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
                <strong>Saved colleges stay on this device.</strong>
                <p>
                  College identifiers are stored in browser local storage under
                  <code> college-search-saved</code>. Remove individual saves on
                  the Saved page or clear this site&apos;s browser data to erase them.
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
                  and authentication session. CollegeSearch never places a
                  privileged Supabase service key in the browser.
                </p>
              </div>
            </li>
            <li>
              <span><Database size={19} aria-hidden="true" /></span>
              <div>
                <strong>No academic profile is collected in this release.</strong>
                <p>
                  The current matching tools use choices in memory to render
                  results. They do not ask for transcripts, essays, test scores,
                  financial-aid records, or demographic profiles.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section className="methodology-section methodology-limitations" aria-labelledby="services-heading">
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">02</span>
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
              Self-service account deletion and server-synced saved lists are
              not active yet. They must ship with ownership-based row security
              and a tested deletion path before student data is stored.
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
            <p>Open Saved and remove the colleges you no longer want retained.</p>
          </div>
          <Link className="page-primary-action" href="/saved">
            Review saved colleges
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
