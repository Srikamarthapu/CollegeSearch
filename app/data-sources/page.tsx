import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  ExternalLink,
  FileCheck2,
  RefreshCw,
} from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { release, type SourceRelease } from "@/app/lib/college-data";

export const metadata: Metadata = {
  title: "Data sources · College Compass",
  description:
    "The official and federal releases behind College Compass, including reporting years and update limits.",
};

function SourceRecord({
  source,
  position,
}: {
  source: SourceRelease;
  position: number;
}) {
  return (
    <article className="sources-record">
      <header>
        <span className="sources-record-number">
          {String(position).padStart(2, "0")}
        </span>
        <span className="sources-status">
          <FileCheck2 size={14} aria-hidden="true" />
          In current release
        </span>
      </header>
      <div className="sources-record-title">
        <span>{source.publisher}</span>
        <h2>{source.sourceName}</h2>
      </div>
      <dl>
        <div>
          <dt>Accessed</dt>
          <dd>{source.accessedOn}</dd>
        </div>
        <div>
          <dt>Reporting year</dt>
          <dd>{source.reportingYear ?? "Varies by field"}</dd>
        </div>
        <div>
          <dt>Cohort</dt>
          <dd>{source.cohort ?? "Multiple federal reporting cohorts"}</dd>
        </div>
        {source.sourceSheet ? (
          <div>
            <dt>Workbook sheet</dt>
            <dd>{source.sourceSheet}</dd>
          </div>
        ) : null}
        {source.workbookSha256 ? (
          <div className="sources-hash">
            <dt>Workbook SHA-256</dt>
            <dd>
              <code>{source.workbookSha256}</code>
            </dd>
          </div>
        ) : null}
      </dl>
      {source.notes ? <p>{source.notes}</p> : null}
      <div className="sources-record-actions">
        {source.sourcePage ? (
          <a href={source.sourcePage} target="_blank" rel="noreferrer">
            Publisher page
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
        <a href={source.sourceUrl} target="_blank" rel="noreferrer">
          {source.sourcePage ? "Source file" : "Open source"}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export default function DataSourcesPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-shell sources-page">
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Data sources</span>
        </nav>

        <header className="sources-masthead">
          <div>
            <span className="page-eyebrow">
              <Database size={15} aria-hidden="true" />
              Release ledger · {release.institutionCount} institutions
            </span>
            <h1>Primary sources, plainly labeled.</h1>
            <p>
              This ledger identifies what the current College Compass release
              actually uses. A linked reference is not presented as imported
              evidence until it passes the same lineage and validation checks.
            </p>
          </div>
          <dl className="sources-release-summary">
            <div>
              <dt>Dataset accessed</dt>
              <dd>{release.accessedOn}</dd>
            </div>
            <div>
              <dt>Institution measures</dt>
              <dd>{release.institutionMetricsYear}</dd>
            </div>
            <div>
              <dt>Earnings cohort</dt>
              <dd>{release.earningsCohortYear}</dd>
            </div>
          </dl>
        </header>

        <section
          className="sources-section"
          aria-labelledby="active-sources-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">01</span>
              <h2 id="active-sources-heading">Sources in the current release</h2>
            </div>
            <p>{release.sources.length} normalized source releases</p>
          </div>
          <div className="sources-record-list">
            {release.sources.map((source, index) => (
              <SourceRecord
                source={source}
                position={index + 1}
                key={source.id}
              />
            ))}
          </div>
        </section>

        <section
          className="sources-section"
          aria-labelledby="field-map-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">02</span>
              <h2 id="field-map-heading">Which source wins where</h2>
            </div>
          </div>
          <div className="sources-field-map">
            <article>
              <span className="sources-status">Primary for UC admissions</span>
              <h3>UC Accountability Report</h3>
              <p>
                Official Fall 2025 campus applicants, admits, and enrollees.
                Admit and yield rates are derived directly from those counts.
              </p>
            </article>
            <article>
              <span className="sources-status">
                Primary for federal measures
              </span>
              <h3>College Scorecard</h3>
              <p>
                2024 institution admissions, enrollment, price, tuition, and
                completion observations; the earnings measure describes a
                2020 cohort.
              </p>
            </article>
            <article>
              <span className="sources-status">Completion evidence only</span>
              <h3>Federal degree fields</h3>
              <p>
                Major categories are recent degree-completion shares. College
                Compass does not label them as program-specific admit rates.
              </p>
            </article>
          </div>
        </section>

        <section
          className="sources-section sources-reference-section"
          aria-labelledby="references-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">03</span>
              <h2 id="references-heading">Linked, not yet normalized</h2>
            </div>
          </div>
          <article className="sources-reference-card">
            <div>
              <span className="sources-reference-status">Reference only</span>
              <h3>UC freshman admission by discipline</h3>
              <p>
                The UC Information Center publishes a discipline view, but it
                is not used as a normalized major-admit-rate field in this
                release. Broad disciplines can hide campus and program
                differences, so the current explorer keeps degree completion
                evidence separate.
              </p>
            </div>
            <a
              className="page-secondary-action"
              href={release.ucDisciplineSourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Inspect UC reference
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </article>
        </section>

        <section
          className="sources-section"
          aria-labelledby="freshness-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">04</span>
              <h2 id="freshness-heading">Freshness and change control</h2>
            </div>
          </div>
          <div className="sources-freshness">
            <RefreshCw size={22} aria-hidden="true" />
            <div>
              <h3>Newer does not automatically mean comparable.</h3>
              <p>
                A refresh updates a metric only after its source field, cohort,
                unit, and definition are checked. Reporting years stay attached
                to individual observations, and the UC workbook fingerprint
                makes an upstream file change detectable.
              </p>
            </div>
          </div>
        </section>

        <aside className="page-next-step">
          <span className="page-evidence-label">Read before ranking</span>
          <h2>Source confidence is not predictive certainty.</h2>
          <p>
            These are reliable records of reported cohorts, not guarantees
            about future admission, cost, or career outcomes.
          </p>
          <div>
            <Link className="page-primary-action" href="/methodology">
              Read the methodology
            </Link>
            <Link className="page-text-link" href="/explore">
              Explore the evidence
            </Link>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
