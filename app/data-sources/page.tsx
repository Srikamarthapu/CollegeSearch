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
import tuitionDataset from "@/data/college-tuition.json";
import costOverrides from "@/data/college-cost-overrides.json";
import {
  colleges,
  observationSourceKind,
  release,
  type SourceRelease,
} from "@/app/lib/college-data";

const logoSources = [...logoSourcesFirst, ...logoSourcesSecond];
const collegeNames = new Map(
  colleges.map((college) => [college.slug, college.name]),
);
const reviewedInstitutionRecords = colleges.filter((college) =>
  Object.values(college.observations).some(
    (observation) =>
      observation !== null &&
      !observation.sourceId.startsWith("uc-") &&
      !observationSourceKind(observation).isFederal,
  ),
);
const reviewedAdmissionHeadlines = reviewedInstitutionRecords.filter(
  (college) => !observationSourceKind(college.observations.admitRate).isFederal,
);
const firstPartyAdmissionHeadlines = colleges.filter(
  (college) => !observationSourceKind(college.observations.admitRate).isFederal,
);
const federalAdmissionBaselines =
  colleges.length - firstPartyAdmissionHeadlines.length;

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
    <article className="sources-record" id={source.id}>
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
            <dt>
              {source.artifactHashMode && source.artifactHashMode !== "raw"
                ? "Normalized content fingerprint"
                : "Artifact SHA-256"}
            </dt>
            <dd>
              <code>{source.artifactSha256}</code>
            </dd>
          </div>
        ) : null}
        {source.review ? (
          <div>
            <dt>Manual review</dt>
            <dd>Approved {source.review.reviewedOn}</dd>
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
        {!source.sourcePage || source.sourceUrl !== source.sourcePage ? (
          <a href={source.sourceUrl} target="_blank" rel="noreferrer">
            {source.sourcePage ? "Source file" : "Open source"}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
        {source.artifactUrl &&
        source.artifactUrl !== source.sourceUrl &&
        source.artifactUrl !== source.sourcePage ? (
          <a href={source.artifactUrl} target="_blank" rel="noreferrer">
            {source.artifactKind === "html"
              ? "Open reviewed page"
              : "Open source file"}
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
            <div>
              <dt>Reviewed institution records</dt>
              <dd>{reviewedInstitutionRecords.length}</dd>
            </div>
            <div>
              <dt>Reviewed admission headlines</dt>
              <dd>{reviewedAdmissionHeadlines.length}</dd>
            </div>
            <div>
              <dt>Total first-party admission headlines</dt>
              <dd>{firstPartyAdmissionHeadlines.length}</dd>
            </div>
            <div>
              <dt>Federal admission baselines</dt>
              <dd>{federalAdmissionBaselines}</dd>
            </div>
          </dl>
        </header>

        <section className="sources-section" aria-labelledby="tuition-evidence-heading">
          <div className="page-section-heading"><div><h2 id="tuition-evidence-heading">Tuition, fees and the full budget</h2></div></div>
          <div className="sources-field-map">
            <article>
              <h3>Tuition means instruction only</h3>
              <p>Discovery cards show annual tuition before aid, excluding fees and living costs. Public colleges show the out-of-state rate; profiles also show in-state tuition. Every amount retains its academic year.</p>
            </article>
            <article>
              <h3>IPEDS reports tuition separately</h3>
              <p>{colleges.filter((college) => college.costs.tuitionOutOfState.value !== null).length.toLocaleString()} of {colleges.length.toLocaleString()} colleges have a separately reported or reviewed annual tuition amount. Missing figures stay “Not reported.” Federal figures are historical institutional reports, not a current bill; IPEDS may flag values as imputed or adjusted in their source definitions.</p>
              <a href={tuitionDataset.release.sourceUrl} target="_blank" rel="noreferrer">Open the federal tuition source</a>
            </article>
            <article>
              <h3>Full attendance costs are separate</h3>
              <p>Official {costOverrides.colleges.length}-college budget review checked {costOverrides.reviewedOn}. Stanford and Berkeley profiles include sourced 2026–2027 budgets. A fee allowance is an estimate, not a fixed charge. Other colleges link to their official website where a full budget has not yet been reviewed.</p>
              {costOverrides.colleges.map((row) => <p key={row.unitId}><a href={row.budget.sourceUrl} target="_blank" rel="noreferrer">{row.costs.tuitionOutOfState.publisher}: official budget</a></p>)}
            </article>
          </div>
        </section>

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
              <span className="sources-status">Primary after review</span>
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
                completion within 150% of normal time at four-year institutions. C150_L4 covers two-year institutions and has a different entering cohort.
              </p>
            </article>
            <article>
              <span className="sources-status">Program + award evidence</span>
              <h3>Federal broad fields</h3>
              <p>
                Each 2024-2025 broad CIP family requires a bachelor&apos;s or associate program
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
                Where available, results use an institutional or athletics identity
                mark from an official university source or Wikimedia Commons.
                Other colleges use a text initial, not an invented mark.
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
