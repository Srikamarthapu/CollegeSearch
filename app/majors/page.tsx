import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  FileSearch,
  Search,
} from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { colleges, release } from "@/app/lib/college-data";
import { broadFields } from "@/app/majors/major-data";
import styles from "@/app/majors/majors.module.css";

type MajorsPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export const metadata: Metadata = {
  title: "Broad fields of study · CollegeSearch",
  description:
    "Browse clearly labeled federal bachelor's-program and award-share evidence across the CollegeSearch cohort.",
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function MajorsPage({ searchParams }: MajorsPageProps) {
  const query = firstValue((await searchParams).q).trim().slice(0, 80);
  const normalizedQuery = query.toLocaleLowerCase();
  const visibleFields = normalizedQuery
    ? broadFields.filter((field) =>
        field.name.toLocaleLowerCase().includes(normalizedQuery),
      )
    : broadFields;
  const federalSource = release.sources.find((source) =>
    broadFields.some((field) => field.sourceIds.includes(source.id)),
  );

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={`page-shell ${styles.page}`}>
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Fields of study</span>
        </nav>

        <header className={styles.masthead}>
          <div className={styles.mastheadCopy}>
            <span className="page-eyebrow">
              <BookOpenCheck size={15} aria-hidden="true" />
              Broad federal field evidence
            </span>
            <h1>Start with a field. Keep the claim honest.</h1>
            <p>
              Explore bachelor&apos;s-program indicators and the share of all
              institutional awards reported in each broad federal field. These
              records help you find places to investigate—not estimate your
              chance of admission to a particular major.
            </p>
          </div>

          <aside className={styles.boundaryCard}>
            <span>What this page can answer</span>
            <strong>Where broad-field evidence appears</strong>
            <p>
              It cannot confirm an exact current major, capacity, or
              program-specific admit rate. Always check the college catalog.
            </p>
          </aside>
        </header>

        <section className={styles.catalogSection} aria-labelledby="field-index-heading">
          <div className={styles.sectionHeading}>
            <div>
              <span className="page-section-index">01 / FIELD INDEX</span>
              <h2 id="field-index-heading">Browse {broadFields.length} broad fields</h2>
            </div>
            <p>
              Current field evidence covers {colleges.length} colleges and is
              drawn from {federalSource?.sourceName ?? "the registered federal release"}.
            </p>
          </div>

          <form className={styles.searchForm} action="/majors" method="get" role="search">
            <label htmlFor="major-field-search">Search fields of study</label>
            <div className={styles.searchControl}>
              <Search size={19} aria-hidden="true" />
              <input
                id="major-field-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Try computing, engineering, or psychology"
                maxLength={80}
              />
              <button type="submit">Search fields</button>
            </div>
          </form>

          <p className={styles.resultSummary} aria-live="polite">
            <strong>{visibleFields.length}</strong>{" "}
            {visibleFields.length === 1 ? "field" : "fields"}
            {query ? ` matching “${query}”` : " in this release"}
          </p>

          {visibleFields.length ? (
            <ol className={styles.fieldGrid}>
              {visibleFields.map((field) => (
                <li key={field.slug}>
                  <Link className={styles.fieldCard} href={`/majors/${field.slug}`}>
                    <span className={styles.fieldIndex} aria-hidden="true">
                      {String(broadFields.indexOf(field) + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.fieldCardBody}>
                      <strong>{field.name}</strong>
                      <small>
                        {field.records.length} of {colleges.length} colleges have a
                        bachelor&apos;s indicator in this field
                      </small>
                      <span>{field.periodLabels.join(" · ")}</span>
                    </span>
                    <ArrowRight size={19} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.emptyState}>
              <FileSearch size={28} aria-hidden="true" />
              <div>
                <h3>No broad field matches “{query}”.</h3>
                <p>
                  Try a wider term such as “science,” or return to the complete
                  field index.
                </p>
              </div>
              <Link className="page-secondary-action" href="/majors">
                Clear search
              </Link>
            </div>
          )}
        </section>

        <aside className={styles.evidenceNote}>
          <FileSearch size={22} aria-hidden="true" />
          <div>
            <strong>A zero and a missing record mean different things.</strong>
            <p>
              A reported 0% is a source value rounded to the available
              precision. No field record means the release did not meet the
              bachelor&apos;s-indicator rule; it does not prove that no related
              program exists.
            </p>
          </div>
          <Link href="/methodology">
            Read the methodology
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
