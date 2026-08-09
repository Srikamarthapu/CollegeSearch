import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  ExternalLink,
  FileQuestion,
  Filter,
  Landmark,
} from "lucide-react";

import { CollegeLogo } from "@/app/components/CollegeLogo";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import {
  colleges,
  formatObservation,
  percentFormatter,
} from "@/app/lib/college-data";
import {
  broadFieldBySlug,
  broadFields,
  collegesWithoutBroadField,
  sourceForBroadFieldEvidence,
} from "@/app/majors/major-data";
import styles from "@/app/majors/majors.module.css";

type BroadFieldPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    state?: string | string[];
    sort?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function generateStaticParams() {
  return broadFields.map((field) => ({ slug: field.slug }));
}

export async function generateMetadata({
  params,
}: BroadFieldPageProps): Promise<Metadata> {
  const field = broadFieldBySlug((await params).slug);
  if (!field) return { title: "Field not found · CollegeSearch" };

  return {
    title: `${field.name} field evidence · CollegeSearch`,
    description: `Compare clearly dated broad-field award evidence and institution-wide admission context for ${field.name}.`,
  };
}

export default async function BroadFieldPage({
  params,
  searchParams,
}: BroadFieldPageProps) {
  const field = broadFieldBySlug((await params).slug);
  if (!field) notFound();

  const requested = await searchParams;
  const availableStates = [...new Set(field.records.map(({ college }) => college.state))].sort();
  const requestedState = firstValue(requested.state).toUpperCase();
  const state = availableStates.includes(requestedState) ? requestedState : "";
  const sort = firstValue(requested.sort) === "name" ? "name" : "share";
  const source = sourceForBroadFieldEvidence(field.records[0].evidence);
  const absentColleges = collegesWithoutBroadField(field);
  const visibleRecords = field.records
    .filter(({ college }) => !state || college.state === state)
    .sort((left, right) =>
      sort === "name"
        ? left.college.name.localeCompare(right.college.name)
        : right.evidence.share - left.evidence.share ||
          left.college.name.localeCompare(right.college.name),
    );

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={`page-shell ${styles.page}`}>
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/majors">
            <ArrowLeft size={15} aria-hidden="true" />
            Fields of study
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{field.name}</span>
        </nav>

        <header className={styles.detailMasthead}>
          <div>
            <span className="page-eyebrow">
              <BookOpenCheck size={15} aria-hidden="true" />
              Broad bachelor&apos;s field
            </span>
            <h1>{field.name}</h1>
            <p>
              Compare the latest available federal bachelor&apos;s-program and
              award-share evidence in this cohort. The admission figure beside
              each record is institution-wide and is not a rate for this field.
            </p>
          </div>
          <Link
            className="page-primary-action"
            href={`/explore?major=${encodeURIComponent(field.name)}`}
          >
            Explore matching colleges
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </header>

        <section className={styles.releaseLedger} aria-label="Field evidence summary">
          <div>
            <span>College coverage</span>
            <strong>
              {field.records.length} <small>of {colleges.length}</small>
            </strong>
            <p>Bachelor&apos;s indicator present in this release</p>
          </div>
          <div>
            <span>Evidence period</span>
            <strong className={styles.ledgerText}>{field.periodLabels.join(", ")}</strong>
            <p>Program indicator and institution-wide award share</p>
          </div>
          <div>
            <span>Registered publisher</span>
            <strong className={styles.ledgerText}>
              {source?.publisher ?? "Source not registered"}
            </strong>
            <p>{source?.sourceName ?? "Inspect the data-source ledger"}</p>
          </div>
        </section>

        <aside className={styles.admissionBoundary}>
          <Landmark size={21} aria-hidden="true" />
          <div>
            <strong>Two different questions, shown together carefully.</strong>
            <p>
              Award share describes what a college awarded across this broad
              field. Admit rate describes freshman admission to the institution
              overall. Neither value reveals program capacity or your personal odds.
            </p>
          </div>
        </aside>

        <section className={styles.resultsSection} aria-labelledby="college-evidence-heading">
          <div className={styles.sectionHeading}>
            <div>
              <span className="page-section-index">01 / COLLEGE RECORDS</span>
              <h2 id="college-evidence-heading">Inspect the evidence college by college</h2>
            </div>
            <p>
              Every card keeps the period, publisher, and source field attached
              to the value. Sort order is descriptive, never a ranking.
            </p>
          </div>

          <form className={styles.filterForm} action={`/majors/${field.slug}`} method="get">
            <Filter size={18} aria-hidden="true" />
            <label>
              <span>State</span>
              <select name="state" defaultValue={state}>
                <option value="">All states</option>
                {availableStates.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort records</span>
              <select name="sort" defaultValue={sort}>
                <option value="share">Award share, high to low</option>
                <option value="name">College name</option>
              </select>
            </label>
            <button type="submit">Apply view</button>
          </form>

          <p className={styles.resultSummary} aria-live="polite">
            <strong>{visibleRecords.length}</strong>{" "}
            {visibleRecords.length === 1 ? "college record" : "college records"}
            {state ? ` in ${state}` : " across all states"}
          </p>

          {visibleRecords.length ? (
            <div className={styles.collegeGrid}>
              {visibleRecords.map(({ college, evidence }) => {
                const evidenceSource = sourceForBroadFieldEvidence(evidence);
                const admission = college.observations.admitRate;
                const exploreParams = new URLSearchParams({ major: field.name });
                if (state) exploreParams.set("state", state);

                return (
                  <article className={styles.collegeCard} key={college.unitId}>
                    <header>
                      <CollegeLogo college={college} variant="card" />
                      <div>
                        <span>{college.city}, {college.state}</span>
                        <h3>
                          <Link href={`/colleges/${college.slug}`}>{college.name}</Link>
                        </h3>
                        <small>{college.ownership} · {college.setting}</small>
                      </div>
                    </header>

                    <dl className={styles.metricPair}>
                      <div>
                        <dt>Broad-field award share</dt>
                        <dd>
                          <strong>{percentFormatter.format(evidence.share)}</strong>
                          <span>{evidence.periodLabel}</span>
                          <small>{evidenceSource?.publisher ?? "Source unavailable"}</small>
                        </dd>
                      </div>
                      <div>
                        <dt>Institution-wide admit rate</dt>
                        <dd>
                          <strong>{formatObservation(admission)}</strong>
                          <span>{admission.periodLabel}</span>
                          <small>{admission.publisher} · not field-specific</small>
                        </dd>
                      </div>
                    </dl>

                    <div className={styles.cardEvidence}>
                      <span className={styles.statusLabel}>Reported field record</span>
                      {evidence.share === 0 ? (
                        <p>
                          The source reports 0% at its available precision. This
                          is not treated as a missing value.
                        </p>
                      ) : null}
                      <dl>
                        <div>
                          <dt>Program evidence</dt>
                          <dd>Bachelor&apos;s indicator present</dd>
                        </div>
                        <div>
                          <dt>Source field</dt>
                          <dd><code>{evidence.sourceField}</code></dd>
                        </div>
                        <div>
                          <dt>Cohort</dt>
                          <dd>{evidence.cohort}</dd>
                        </div>
                        <div>
                          <dt>Source</dt>
                          <dd>
                            {evidenceSource ? (
                              <a href={evidenceSource.sourceUrl} target="_blank" rel="noreferrer">
                                {evidenceSource.sourceName}
                                <ExternalLink size={12} aria-hidden="true" />
                              </a>
                            ) : (
                              <Link href="/data-sources">Inspect source ledger</Link>
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <footer>
                      <Link href={`/colleges/${college.slug}`}>
                        Open evidence profile
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                      <Link href={`/explore?${exploreParams.toString()}`}>
                        View in explorer
                      </Link>
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <FileQuestion size={28} aria-hidden="true" />
              <div>
                <h3>No reported field records match this state.</h3>
                <p>Clear the state filter to inspect the complete evidence set.</p>
              </div>
              <Link className="page-secondary-action" href={`/majors/${field.slug}`}>
                Show all states
              </Link>
            </div>
          )}
        </section>

        {absentColleges.length ? (
          <section className={styles.missingSection} aria-labelledby="missing-field-heading">
            <div>
              <span className="page-section-index">02 / EXPLICITLY MISSING</span>
              <h2 id="missing-field-heading">No qualifying field record in this release</h2>
              <p>
                These {absentColleges.length} colleges do not have a record that
                satisfies the current bachelor&apos;s-indicator rule for this broad
                field. Absence is not converted to zero and does not prove an
                exact related major is unavailable.
              </p>
            </div>
            <ul>
              {absentColleges.map((college) => (
                <li key={college.unitId}>
                  <span>No field record</span>
                  <Link href={`/colleges/${college.slug}`}>{college.name}</Link>
                  <small>{college.city}, {college.state}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <aside className="page-next-step">
          <span className="page-evidence-label">Next verification step</span>
          <h2>Confirm the exact program before building your list.</h2>
          <p>
            Federal broad fields can group many distinct majors. Use this page
            to narrow your investigation, then confirm names, prerequisites,
            capacity, and current policies on the official college site.
          </p>
          <div>
            <Link
              className="page-primary-action"
              href={`/explore?major=${encodeURIComponent(field.name)}`}
            >
              Explore this field
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="page-text-link" href="/data-sources">
              Inspect source ledger
            </Link>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
