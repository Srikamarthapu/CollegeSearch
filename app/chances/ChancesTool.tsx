"use client";

import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  FileWarning,
  Info,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CollegeLogo } from "@/app/components/CollegeLogo";
import { historicalAdmitBand } from "./context";
import styles from "./chances.module.css";

export type ChancesCollege = {
  unitId: number;
  slug: string;
  name: string;
  city: string;
  state: string;
  ownership: string;
  rate: number | null;
  periodLabel: string;
  finality: string;
  status: string;
  publisher: string;
  sourceName: string;
  sourceUrl: string;
  cohort: string;
  definition: string;
};

type ChancesToolProps = {
  colleges: ChancesCollege[];
  initialIds: number[];
};

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function sourceKind(college: ChancesCollege) {
  if (college.publisher === "University of California") {
    return "Official UC campus snapshot";
  }
  if (college.publisher === "U.S. Department of Education") {
    return "Federal institution record";
  }
  return "Official college record";
}

export function ChancesTool({ colleges, initialIds }: ChancesToolProps) {
  const validIds = useMemo(() => new Set(colleges.map((college) => college.unitId)), [colleges]);
  const [selectedIds, setSelectedIds] = useState(() => initialIds.filter((id) => validIds.has(id)).slice(0, 4));
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingId, setPendingId] = useState<number | "">("");

  const selected = selectedIds
    .map((unitId) => colleges.find((college) => college.unitId === unitId))
    .filter((college): college is ChancesCollege => Boolean(college));

  const available = colleges.filter((college) => {
    if (selectedIds.includes(college.unitId)) return false;
    const query = searchTerm.trim().toLowerCase();
    return !query || `${college.name} ${college.city} ${college.state}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedIds.length > 0) {
      url.searchParams.set("colleges", selectedIds.join(","));
    } else {
      url.searchParams.delete("colleges");
      url.searchParams.delete("ids");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [selectedIds]);

  const addCollege = () => {
    if (pendingId === "" || selectedIds.length >= 4) return;
    setSelectedIds((current) => [...current, pendingId]);
    setPendingId("");
    setSearchTerm("");
  };

  const removeCollege = (unitId: number) => {
    setSelectedIds((current) => current.filter((id) => id !== unitId));
  };

  return (
    <>
      <header className={styles.masthead}>
        <div>
          <span className="page-eyebrow">
            <ShieldCheck size={15} aria-hidden="true" />
            Historical context, no false precision
          </span>
          <h1>Read the rate. Keep its limits in view.</h1>
          <p>
            Compare up to four colleges using their reported overall first-year
            admit rates. We describe the observed cohort; we do not turn it
            into a personalized probability.
          </p>
        </div>
        <div className={styles.boundaryCard}>
          <span>What this tool will not claim</span>
          <strong>No “87% chance.” No reach, target, or safety labels.</strong>
          <p>
            An institution-wide historical rate cannot account for your
            program, residency, achievements, or the next applicant pool.
          </p>
        </div>
      </header>

      <section className={styles.deferredNotice} aria-labelledby="model-boundary-heading">
        <FileWarning size={22} aria-hidden="true" />
        <div>
          <h2 id="model-boundary-heading">Applicant-range modeling is intentionally deferred.</h2>
          <p>
            This dataset does not yet contain verified, consistently defined
            GPA and test-score ranges for these colleges. We will not ask for
            sensitive academic inputs until those source ranges and their
            cohorts can be shown beside every result.
          </p>
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.selector} aria-labelledby="college-selector-heading">
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div>
              <h2 id="college-selector-heading">Choose up to four colleges</h2>
              <p>{selected.length} of 4 selected · the URL updates so this context can be revisited.</p>
            </div>
          </div>

          <div className={styles.addControls}>
            <label>
              <span><Search size={14} aria-hidden="true" />Filter the college list</span>
              <input
                type="search"
                value={searchTerm}
                placeholder="Try UCLA, Stanford, or Arizona"
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPendingId("");
                }}
              />
            </label>
            <label>
              <span>Available colleges</span>
              <select
                value={pendingId}
                disabled={selected.length >= 4}
                onChange={(event) => setPendingId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">{available.length > 0 ? "Choose a college" : "No matching colleges"}</option>
                {available.map((college) => (
                  <option value={college.unitId} key={college.unitId}>
                    {college.name} · {college.state}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={pendingId === "" || selected.length >= 4} onClick={addCollege}>
              <Plus size={16} aria-hidden="true" />
              Add college
            </button>
          </div>

          {selected.length > 0 ? (
            <ul className={styles.selectedChips} aria-label="Selected colleges">
              {selected.map((college) => (
                <li key={college.unitId}>
                  <span>{college.name}</span>
                  <button type="button" aria-label={`Remove ${college.name}`} onClick={() => removeCollege(college.unitId)}>
                    <X size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.contextSection} aria-labelledby="context-heading" aria-live="polite">
          <div className={styles.resultsHeading}>
            <div>
              <span>02 / evidence cards</span>
              <h2 id="context-heading">Observed overall context</h2>
            </div>
            <p>
              The descriptive band comes only from the displayed historical
              rate. “Limited” refers to personal interpretation, not source quality.
            </p>
          </div>

          {selected.length === 0 ? (
            <div className={styles.emptyState}>
              <Info size={24} aria-hidden="true" />
              <h3>Start with a college you are considering.</h3>
              <p>
                Add one above to see its observed rate, cohort, source, and the
                boundary between institution context and personal likelihood.
              </p>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {selected.map((college) => {
                const band = historicalAdmitBand(college.rate);
                return (
                  <article className={styles.contextCard} key={college.unitId}>
                    <header>
                      <CollegeLogo college={college} variant="comparison" />
                      <div>
                        <Link href={`/colleges/${college.slug}`}>{college.name}</Link>
                        <span>{college.city}, {college.state} · {college.ownership}</span>
                      </div>
                    </header>

                    <div className={styles.rateBlock}>
                      <div>
                        <span>Reported overall admit rate</span>
                        <strong>{college.rate === null ? "Not reported" : percent.format(college.rate)}</strong>
                      </div>
                      <span className={styles.band}>{band.label}</span>
                    </div>

                    <p className={styles.bandExplanation}>{band.explanation}</p>

                    <dl className={styles.evidenceGrid}>
                      <div>
                        <dt>Personal interpretation</dt>
                        <dd>Limited</dd>
                        <small>Not applicant-specific</small>
                      </div>
                      <div>
                        <dt>Reporting period</dt>
                        <dd>{college.periodLabel}</dd>
                        <small>{college.finality} · {college.status}</small>
                      </div>
                      <div>
                        <dt>Source class</dt>
                        <dd>{sourceKind(college)}</dd>
                        <small>{college.publisher}</small>
                      </div>
                      <div>
                        <dt>Cohort</dt>
                        <dd>{college.cohort}</dd>
                      </div>
                    </dl>

                    <details className={styles.definition}>
                      <summary>Read the exact measure and source</summary>
                      <p>{college.definition}</p>
                      <a href={college.sourceUrl} target="_blank" rel="noreferrer">
                        {college.sourceName}<ExternalLink size={13} aria-hidden="true" />
                      </a>
                    </details>

                    <footer>
                      <Link href={`/colleges/${college.slug}`}>Full evidence profile <ArrowRight size={14} aria-hidden="true" /></Link>
                      <button type="button" onClick={() => removeCollege(college.unitId)}>Remove</button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <aside className={styles.nextStep}>
        <div>
          <span>Use context responsibly</span>
          <h2>Build the list first. Then verify each policy.</h2>
          <p>
            Admissions practices, residency rules, programs, and testing
            policies can change. Read our methods, then confirm the current
            requirements on each college&apos;s official site.
          </p>
        </div>
        <div>
          <Link className="page-primary-action" href="/match">Build a preference match <ArrowRight size={15} aria-hidden="true" /></Link>
          <Link className="page-secondary-action" href="/methodology">Read methodology</Link>
        </div>
      </aside>
    </>
  );
}
