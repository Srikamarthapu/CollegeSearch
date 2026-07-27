import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  ShieldCheck,
} from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { release } from "@/app/lib/college-data";

export const metadata: Metadata = {
  title: "Methodology · College Compass",
  description:
    "How College Compass selects, labels, compares, and limits college evidence.",
};

export default function MethodologyPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-shell methodology-page">
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Methodology</span>
        </nav>

        <header className="methodology-masthead">
          <span className="page-eyebrow">
            <FileSearch size={15} aria-hidden="true" />
            Evidence protocol · accessed {release.accessedOn}
          </span>
          <h1>Every number should explain itself.</h1>
          <p>
            College Compass is a decision aid, not a ranking. We preserve a
            metric&apos;s publisher, reporting year, cohort, field, definition,
            and missing-data status so a clean interface does not erase the
            limits of the evidence.
          </p>
        </header>

        <section
          className="methodology-section methodology-principles"
          aria-labelledby="principles-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">01</span>
              <h2 id="principles-heading">Rules of the record</h2>
            </div>
          </div>
          <ol className="methodology-rule-list">
            <li>
              <span>1</span>
              <div>
                <h3>Use the most direct authoritative source available.</h3>
                <p>
                  UC campus freshman admission counts come from the University
                  of California&apos;s own Accountability Report. Other
                  institution-level fields use the U.S. Department of
                  Education&apos;s College Scorecard release.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Do not force unlike years into one false snapshot.</h3>
                <p>
                  Admissions and institutional measures currently report 2025
                  and 2024 values, while the earnings observation reports a
                  2020 cohort. The year stays beside the metric.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Distinguish reported, derived, and unavailable values.</h3>
                <p>
                  UC admit and yield rates are derived from official counts.
                  A suppressed or unavailable value remains missing; it never
                  becomes zero.
                </p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <h3>Separate degree evidence from admissions evidence.</h3>
                <p>
                  Major shares describe recent degree completions at the
                  institution. They do not measure program selectivity,
                  capacity, enrollment access, or an applicant&apos;s odds.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section
          className="methodology-section"
          aria-labelledby="pipeline-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">02</span>
              <h2 id="pipeline-heading">From source to interface</h2>
            </div>
            <p>
              The current foundation contains {release.institutionCount}{" "}
              institutions.
            </p>
          </div>
          <div className="methodology-pipeline">
            <article>
              <span className="methodology-step">Source</span>
              <h3>Acquire</h3>
              <p>
                Download or query the publisher&apos;s release and record the
                access date. The official UC workbook is also fingerprinted
                with SHA-256.
              </p>
            </article>
            <article>
              <span className="methodology-step">Schema</span>
              <h3>Normalize</h3>
              <p>
                Map each value into an observation with a unit, year, source
                field, cohort, definition, and status.
              </p>
            </article>
            <article>
              <span className="methodology-step">Checks</span>
              <h3>Validate</h3>
              <p>
                Reject duplicate institution IDs, incomplete lineage, invalid
                ratios, and missing values without an explicit missing-data
                status.
              </p>
            </article>
            <article>
              <span className="methodology-step">Product</span>
              <h3>Present</h3>
              <p>
                Keep reporting years and publishers close to the value, with a
                direct path back to the underlying source.
              </p>
            </article>
          </div>
        </section>

        <section
          className="methodology-section"
          aria-labelledby="definitions-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">03</span>
              <h2 id="definitions-heading">What the measures mean</h2>
            </div>
          </div>
          <dl className="methodology-definition-list">
            <div>
              <dt>Headline admit rate</dt>
              <dd>
                Admitted applicants divided by applicants for the named
                reporting cohort. UC rates use Fall 2025 freshman campus
                counts; other rates use the 2024 federal admissions field.
              </dd>
            </div>
            <div>
              <dt>Average net price</dt>
              <dd>
                Average annual price after grants and scholarships for Title
                IV federal aid recipients, not a personalized aid estimate.
              </dd>
            </div>
            <div>
              <dt>Graduation rate</dt>
              <dd>
                Four-year award completion within 150% of expected time for
                the reported first-time, full-time cohort.
              </dd>
            </div>
            <div>
              <dt>Median earnings</dt>
              <dd>
                Median earnings ten years after entry for the federal earnings
                cohort. This is not a projection or a measure of every
                graduate.
              </dd>
            </div>
            <div>
              <dt>Degree share</dt>
              <dd>
                A field&apos;s share of recent degree completions. It is useful
                evidence of academic activity, not direct evidence of program
                admission or quality.
              </dd>
            </div>
          </dl>
        </section>

        <section
          className="methodology-section methodology-limitations"
          aria-labelledby="limitations-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">04</span>
              <h2 id="limitations-heading">Known limits</h2>
            </div>
          </div>
          <ul>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                Institution averages cannot estimate an individual
                applicant&apos;s likelihood of admission.
              </span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                Major groupings can combine different departments, degrees,
                and campus policies.
              </span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                Published tuition is not the same as a family&apos;s net price
                or final financial-aid offer.
              </span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                Program availability, application policies, and costs can
                change after a data release.
              </span>
            </li>
          </ul>
        </section>

        <aside className="methodology-integrity-note">
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <span className="page-evidence-label">Interpretation boundary</span>
            <h2>Use College Compass to ask better questions.</h2>
            <p>
              Before applying, verify current majors, deadlines, residency
              rules, costs, and admission policies on the institution&apos;s
              official site. No label here is an admission guarantee.
            </p>
          </div>
          <Link className="page-primary-action" href="/data-sources">
            Inspect data sources
            <ExternalLink size={15} aria-hidden="true" />
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
