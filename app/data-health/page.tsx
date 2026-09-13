import type { Metadata } from "next";
import { AlertCircle, ArrowRight, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { colleges, observationSourceKind, release } from "@/app/lib/college-data";
import styles from "./data-health.module.css";
import verification from "@/data/institution-source-verification.json";
import { verificationRecency } from "@/app/lib/verification-recency.mjs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data health | CollegeSearch",
  description: "Current source coverage, reporting periods, and known refresh work.",
};

const institutionList = new Intl.ListFormat("en-US", {
  style: "long",
  type: "conjunction",
});

export default function DataHealthPage() {
  // This force-dynamic server page evaluates age per request; no client render reads the clock.
  // eslint-disable-next-line react-hooks/purity
  const recency = verificationRecency({ checkedAt: verification.checkedAt, passed: verification.counts.passed, total: verification.counts.total }, Date.now());
  const timestamp = Date.parse(verification.checkedAt);
  const recencyCopy = recency.state === "within_window"
    ? { title: "Artifact check within the eight-day review window.", detail: "This published snapshot was within the review window when this page was loaded. It checks source availability and approved fingerprints; it does not update reporting periods or repeat manual factual review." }
    : recency.state === "stale"
    ? { title: "Published artifact check is overdue for review.", detail: "This published snapshot is more than eight days old. Use the dated records as research context and confirm important details with the college. Later maintenance checks may exist; this website has not published a newer reviewed snapshot." }
    : recency.state === "needs_review"
    ? { title: "Some artifact checks need review.", detail: "The published check did not verify every registered artifact. The last approved college records remain available; confirm important details with the college." }
    : { title: "Artifact-check recency is unavailable.", detail: "The published timestamp or coverage could not be verified. Confirm important details with the college." };
  const reviewedInstitutionRecords = colleges.filter((college) =>
    Object.values(college.observations).some(
      (observation) =>
        observation !== null &&
        !observation.sourceId.startsWith("uc-") &&
        !observationSourceKind(observation).isFederal,
    ),
  );
  const firstPartyAdmissions = colleges.filter(
    (college) => !observationSourceKind(college.observations.admitRate).isFederal,
  );
  const federalAdmissions = colleges.filter(
    (college) => observationSourceKind(college.observations.admitRate).isFederal,
  );
  const preliminaryUc = firstPartyAdmissions.filter((college) =>
    college.observations.admitRate.sourceId.startsWith("uc-"),
  );
  const reviewedCollegeAdmissions = reviewedInstitutionRecords.filter(
    (college) => !observationSourceKind(college.observations.admitRate).isFederal,
  );
  const partialInstitutionRecords = reviewedInstitutionRecords.filter(
    (college) => observationSourceKind(college.observations.admitRate).isFederal,
  );

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.page}>
        <header className={styles.masthead}>
          <span className={styles.eyebrow}>Evidence operations</span>
          <h1>What is current—and what is still a baseline.</h1>
          <p>
            A 2026 source release can contain 2024 or older reporting cohorts.
            This page separates publication freshness from the year each metric
            actually describes.
          </p>
        </header>

        <section className={styles.releases} aria-labelledby="verification-heading">
          <div className={styles.sectionHeading}>
            <span>Published source check</span>
            <h2 id="verification-heading">{verification.counts.passed} of {verification.counts.total} registered artifacts passed</h2>
          </div>
          <p>Published verification snapshot: {Number.isFinite(timestamp) ? <time dateTime={verification.checkedAt}>{new Date(timestamp).toISOString().replace("T", " ").slice(0, 16)} UTC</time> : "Timestamp unavailable"}.</p>
          <aside className={styles.recency} data-verification-state={recency.state} aria-label="Published verification recency">
            <strong>{recencyCopy.title}</strong><p>{recencyCopy.detail}</p>
          </aside>
          <p>{verification.counts.failed + verification.counts.notChecked > 0 ? `${verification.counts.failed} failed and ${verification.counts.notChecked} unchecked sources need review. The last approved college records remain available.` : "Every registered artifact agreed with its approved evidence at that check."} Later scheduled checks are retained in the maintenance workflow; this published snapshot changes when a reviewed update is released.</p>
          <details>
            <summary>Inspect each source and its last factual review</summary>
            <div className={styles.releaseList}>
              {verification.sources.map((source) => (
                <article key={source.sourceId}>
                  <div><span>{source.status === "passed" ? "Passed" : "Needs review"} · {source.publisher}</span><h3>{source.sourceName}</h3></div>
                  <dl>
                    <div><dt>Artifact checked</dt><dd>{source.checkedAt.slice(0, 10)}</dd></div>
                    <div><dt>Last manual factual review</dt><dd>{source.lastApprovedEvidence.reviewedOn ?? "Not recorded"}</dd></div>
                    <div><dt>Population</dt><dd>{source.lastApprovedEvidence.cohort ?? "Metric-specific"}</dd></div>
                  </dl>
                  <a href={source.lastApprovedEvidence.sourcePage} target="_blank" rel="noreferrer">Inspect official source <ArrowRight size={14} aria-hidden="true" /></a>
                </article>
              ))}
            </div>
          </details>
        </section>

        <section className={styles.summary} aria-labelledby="coverage-heading">
          <div className={styles.sectionHeading}>
            <span>01</span>
            <h2 id="coverage-heading">Official and federal coverage</h2>
          </div>
          <div className={styles.summaryGrid}>
            <article>
              <CheckCircle2 size={19} aria-hidden="true" />
              <strong>{reviewedInstitutionRecords.length}</strong>
              <span>reviewed institutional records</span>
              <p>
                {reviewedCollegeAdmissions.length} supply reviewed admission
                headlines. {institutionList.format(
                  partialInstitutionRecords.map((college) => college.name),
                )} are partial records: their official enrollment
                or outcome fields do not replace the federal admission baseline.
              </p>
            </article>
            <article>
              <AlertCircle size={19} aria-hidden="true" />
              <strong>{firstPartyAdmissions.length}</strong>
              <span>total first-party admission headlines</span>
              <p>
                {preliminaryUc.length} preliminary UC campus snapshots plus{" "}
                {reviewedCollegeAdmissions.length} reviewed institution
                admission records. Source period and finality remain attached.
              </p>
            </article>
            <article>
              <Database size={19} aria-hidden="true" />
              <strong>{federalAdmissions.length}</strong>
              <span>federal admission baselines</span>
              <p>
                These use Fall 2024 admissions from the current Scorecard
                artifact until an unambiguous first-party admission record is
                independently reviewed.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.releases} aria-labelledby="releases-heading">
          <div className={styles.sectionHeading}>
            <span>02</span>
            <h2 id="releases-heading">Registered source releases</h2>
          </div>
          <div className={styles.releaseList}>
            {release.sources.map((source) => (
              <article key={source.id}>
                <div>
                  <span>{source.publisher}</span>
                  <h3>{source.sourceName}</h3>
                </div>
                <dl>
                  <div>
                    <dt>Accessed</dt>
                    <dd>{source.accessedOn}</dd>
                  </div>
                  <div>
                    <dt>Revision state</dt>
                    <dd>{source.revisionStatus ?? source.finality ?? "Source snapshot"}</dd>
                  </div>
                  <div>
                    <dt>Cohort</dt>
                    <dd>{source.cohort ?? "Metric-specific periods"}</dd>
                  </div>
                </dl>
                <a href={source.sourcePage ?? source.sourceUrl} target="_blank" rel="noreferrer">
                  Inspect publisher record
                  <ArrowRight size={14} aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </section>

        <aside className={styles.caveat}>
          <ShieldCheck size={21} aria-hidden="true" />
          <div>
            <strong>Known refresh work is visible, not hidden.</strong>
            <p>
              The next data pass should expand beyond the current{" "}
              {reviewedInstitutionRecords.length} reviewed institutional records
              and add newer UC cost/outcome records while retaining federal
              observations as comparable alternates.
            </p>
          </div>
          <Link href="/data-sources">Read the source ledger</Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
