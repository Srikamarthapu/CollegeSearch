import type { Metadata } from "next";
import { AlertCircle, ArrowRight, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { colleges, observationSourceKind, release } from "@/app/lib/college-data";
import styles from "./data-health.module.css";

export const metadata: Metadata = {
  title: "Data health | CollegeSearch",
  description: "Current source coverage, reporting periods, and known refresh work.",
};

export default function DataHealthPage() {
  const firstPartyAdmissions = colleges.filter(
    (college) => !observationSourceKind(college.observations.admitRate).isFederal,
  );
  const federalAdmissions = colleges.filter(
    (college) => observationSourceKind(college.observations.admitRate).isFederal,
  );
  const preliminaryUc = firstPartyAdmissions.filter((college) =>
    college.observations.admitRate.sourceId.startsWith("uc-"),
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

        <section className={styles.summary} aria-labelledby="coverage-heading">
          <div className={styles.sectionHeading}>
            <span>01</span>
            <h2 id="coverage-heading">Admissions source coverage</h2>
          </div>
          <div className={styles.summaryGrid}>
            <article>
              <CheckCircle2 size={19} aria-hidden="true" />
              <strong>{firstPartyAdmissions.length}</strong>
              <span>college-first admission records</span>
              <p>
                {preliminaryUc.length} UC campuses plus manually reviewed ASU,
                Stanford, and MIT Common Data Set records pinned to source
                artifacts.
              </p>
            </article>
            <article>
              <Database size={19} aria-hidden="true" />
              <strong>{federalAdmissions.length}</strong>
              <span>standardized federal baselines</span>
              <p>
                These use Fall 2024 admissions from the current Scorecard
                artifact until a newer first-party record is independently
                reviewed.
              </p>
            </article>
            <article>
              <AlertCircle size={19} aria-hidden="true" />
              <strong>{preliminaryUc.length}</strong>
              <span>preliminary UC records</span>
              <p>
                Fall 2026 UC campus snapshots are current and exact, but UC says
                they may change. That caveat remains attached everywhere.
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
              The next data pass should add reviewed first-party overlays for
              the remaining colleges and newer UC cost/outcome records while
              retaining the federal observations as comparable alternates.
            </p>
          </div>
          <Link href="/data-sources">Read the source ledger</Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
