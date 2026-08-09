import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  ExternalLink,
  FileCheck2,
  Landmark,
  RefreshCw,
} from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import logoSourcesFirst from "@/data/college-logo-sources-01-25.json";
import logoSourcesSecond from "@/data/college-logo-sources-26-50.json";
import { colleges, release, type SourceRelease } from "@/app/lib/college-data";

const logoSources = [...logoSourcesFirst, ...logoSourcesSecond];
const collegeNames = new Map(
  colleges.map((college) => [college.slug, college.name]),
);

export const metadata: Metadata = {
  title: "Data sources · CollegeSearch",
  description:
    "The official and federal releases behind CollegeSearch, including reporting periods and update limits.",
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
        {source.releaseDate ? (
          <div>
            <dt>Release date</dt>
            <dd>{source.releaseDate}</dd>
          </div>
        ) : null}
        <div>
          <dt>Reporting year</dt>
          <dd>{source.reportingYear ?? "Varies by field"}</dd>
        </div>
        <div>
          <dt>Cohort</dt>
          <dd>{source.cohort ?? "Multiple federal reporting cohorts"}</dd>
        </div>
        {source.finality ? (
          <div>
            <dt>Finality</dt>
            <dd>{source.finality}</dd>
          </div>
        ) : null}
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
        {source.artifactSha256 ? (
          <div className="sources-hash">
            <dt>Artifact SHA-256</dt>
            <dd>
              <code>{source.artifactSha256}</code>
            </dd>
          </div>
        ) : null}
        {source.sourceHashes?.length ? (
          <div>
            <dt>Page snapshots</dt>
            <dd>{source.sourceHashes.length} SHA-256 hashes recorded</dd>
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
        {source.artifactUrl ? (
          <a href={source.artifactUrl} target="_blank" rel="noreferrer">
            Download release
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function DataSourcesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="page-shell sources-page">
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
              This ledger identifies what the current CollegeSearch release
              actually uses. A linked reference is not presented as imported
              evidence until it passes the same lineage and validation checks.
              Federal values are historical reporting cohorts, not live data.
            </p>
          </div>
          <dl className="sources-release-summary">
            <div>
              <dt>Dataset accessed</dt>
              <dd>{release.accessedOn}</dd>
            </div>
            <div>
              <dt>Federal release</dt>
              <dd>{release.federalReleaseDate}</dd>
            </div>
            <div>
              <dt>Earnings period</dt>
              <dd>{release.earningsPeriodLabel}</dd>
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
              <span className="sources-status">Primary when verified</span>
              <h3>Official college records</h3>
              <p>
                Preliminary UC Fall 2026 campus counts and
                institution-specific official updates supersede older federal
                fields only after review.
              </p>
            </article>
            <article>
              <span className="sources-status">
                Primary for federal measures
              </span>
              <h3>College Scorecard</h3>
              <p>
                A standardized historical baseline: UGDS counts
                certificate/degree-seeking undergraduates; public-college net
                price covers first-time, full-time, in-state Title IV
                recipients; and C150_4 measures degree or certificate
                completion within 150% of normal time at four-year
                institutions.
              </p>
            </article>
            <article>
              <span className="sources-status">Program + award evidence</span>
              <h3>Federal bachelor&apos;s fields</h3>
              <p>
                Each 2024-2025 broad CIP family requires a bachelor&apos;s-program
                indicator. Percentages are still shares of all institutional
                awards, so CollegeSearch does not present them as an exact
                major catalog or program-specific acceptance rate.
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
          aria-labelledby="identity-sources-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">04</span>
              <h2 id="identity-sources-heading">Institution marks, source by source</h2>
            </div>
            <p>{logoSources.length} real identity assets</p>
          </div>
          <article className="sources-logo-note">
            <Landmark size={24} aria-hidden="true" />
            <div>
              <h3>For identification, never endorsement.</h3>
              <p>
                Each result uses a real institutional or athletics identity
                mark from an official university source or Wikimedia Commons.
                Copyright status and trademark permission are different, so
                the source and usage note stay recorded for every asset.
              </p>
            </div>
          </article>
          <details className="sources-logo-disclosure">
            <summary>Review all {logoSources.length} artwork sources</summary>
            <ul>
              {logoSources.map((source) => (
                <li key={source.slug}>
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    <strong>{collegeNames.get(source.slug) ?? source.slug}</strong>
                    <span>
                      Open source
                      <ExternalLink size={13} aria-hidden="true" />
                    </span>
                  </a>
                  <p>{source.usageNote}</p>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <section
          className="sources-section"
          aria-labelledby="freshness-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">05</span>
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
