"use client";

import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Info,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CollegeLogo } from "@/app/components/CollegeLogo";
import { LocalSaveButton } from "@/app/components/LocalSaveButton";
import type { ChancesCollege } from "./admissions-record";
import {
  admissionsQueryChanged,
  normalizeAdmissionsQuery,
} from "./admissions-query";
import { historicalAdmitBand } from "./context";
import styles from "./chances.module.css";

type ChancesToolProps = {
  colleges: ChancesCollege[];
  initialIds: number[];
};

type SearchPhase = "idle" | "loading" | "ready" | "error";

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
  const [knownColleges, setKnownColleges] = useState(colleges);
  const [searchResults, setSearchResults] = useState(colleges);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("ready");
  const [searchError, setSearchError] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const searchRequestId = useRef(0);
  const normalizedSearchTerm = normalizeAdmissionsQuery(searchTerm);

  const selected = selectedIds
    .map((unitId) => knownColleges.find((college) => college.unitId === unitId))
    .filter((college): college is ChancesCollege => Boolean(college));
  const selectedIdSet = new Set(selectedIds);
  const available = searchResults.filter((college) => !selectedIdSet.has(college.unitId));

  useEffect(() => {
    const requestId = ++searchRequestId.current;
    if (normalizedSearchTerm.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ q: normalizedSearchTerm });
      void fetch(`/api/colleges/admissions?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("College search is unavailable.");
          const payload = await response.json() as { items?: ChancesCollege[] };
          if (!Array.isArray(payload.items)) throw new Error("College search returned an invalid response.");
          return payload.items;
        })
        .then((items) => {
          if (searchRequestId.current !== requestId) return;
          setKnownColleges((current) => {
            const merged = new Map(current.map((college) => [college.unitId, college]));
            for (const college of items) merged.set(college.unitId, college);
            return [...merged.values()];
          });
          setSearchResults(items);
          setSearchPhase("ready");
        })
        .catch((error) => {
          if (controller.signal.aborted || searchRequestId.current !== requestId) return;
          setSearchResults([]);
          setSearchError(error instanceof Error ? error.message : "College search is unavailable.");
          setSearchPhase("error");
        });
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [colleges, normalizedSearchTerm, searchAttempt]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedIds.length > 0) {
      url.searchParams.set("colleges", selectedIds.join(","));
      url.searchParams.delete("ids");
    } else {
      url.searchParams.delete("colleges");
      url.searchParams.delete("ids");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [selectedIds]);

  const updateSearchTerm = (value: string) => {
    const next = value.slice(0, 120);
    const normalized = normalizeAdmissionsQuery(next);
    const queryChanged = admissionsQueryChanged(searchTerm, next);
    setSearchTerm(next);
    if (!queryChanged) return;
    searchRequestId.current += 1;
    setPendingId("");
    setSearchError("");
    if (!normalized) {
      setSearchResults(colleges);
      setSearchPhase("ready");
    } else if (normalized.length < 2) {
      setSearchResults([]);
      setSearchPhase("idle");
    } else {
      setSearchResults([]);
      setSearchPhase("loading");
    }
  };

  const addCollege = () => {
    if (pendingId === "" || selectedIds.length >= 4) return;
    setSelectedIds((current) => [...current, pendingId]);
    setPendingId("");
    updateSearchTerm("");
  };

  const removeCollege = (unitId: number) => {
    setSelectedIds((current) => current.filter((id) => id !== unitId));
  };

  const retrySearch = () => {
    setPendingId("");
    setSearchError("");
    setSearchPhase("loading");
    setSearchAttempt((attempt) => attempt + 1);
  };

  const optionPrompt = selected.length >= 4
    ? "Four colleges selected"
    : searchPhase === "loading"
      ? "Searching colleges…"
      : searchPhase === "error"
        ? "Search unavailable"
        : normalizedSearchTerm.length === 1
          ? "Type at least 2 characters"
          : available.length > 0
            ? "Choose a college"
            : "No matching colleges";
  const searchStatus = selected.length >= 4
    ? "Remove a college before adding another."
    : searchPhase === "loading"
      ? `Searching for ${normalizedSearchTerm}.`
      : searchPhase === "error"
        ? searchError
        : normalizedSearchTerm.length === 1
          ? "Type at least 2 characters to search the full college directory."
          : normalizedSearchTerm
            ? `${available.length} ${available.length === 1 ? "college" : "colleges"} found.`
            : `Showing ${available.length} starting colleges. Search by college, city, state, or abbreviation.`;
  const selectionUnavailable =
    selected.length >= 4 ||
    searchPhase === "loading" ||
    searchPhase === "error" ||
    normalizedSearchTerm.length === 1 ||
    available.length === 0;

  return (
    <>
      <header className={styles.masthead}>
        <div>
          <span className="page-eyebrow">
            <ShieldCheck size={15} aria-hidden="true" />
            Understand admissions
          </span>
          <h1>Understand admission rates.</h1>
          <p>Compare reported first-year admit rates for up to four colleges.</p>
        </div>
        <aside className={styles.contextNote} aria-label="How to interpret admission rates">
          <Info size={18} aria-hidden="true" />
          <div>
            <strong>Past admit rates aren’t personal admission odds.</strong>
            <details>
              <summary>How to read these rates</summary>
              <p>
                A reported institution-wide rate describes a past applicant
                cohort. CollegeSearch does not estimate your probability or
                assign reach, target, or safety labels because the rate cannot
                account for your program, residency, achievements, or the next
                applicant pool.
              </p>
            </details>
          </div>
        </aside>
      </header>

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
                maxLength={120}
                placeholder="Try UCLA, Stanford, or Arizona"
                aria-describedby="admissions-search-help admissions-search-status"
                aria-controls="admissions-college-options"
                aria-busy={searchPhase === "loading"}
                onChange={(event) => updateSearchTerm(event.target.value)}
              />
              <small id="admissions-search-help">Enter at least 2 characters to search all colleges.</small>
            </label>
            <label>
              <span>Available colleges</span>
              <select
                id="admissions-college-options"
                value={pendingId}
                disabled={selectionUnavailable}
                aria-describedby="admissions-search-status"
                onChange={(event) => setPendingId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">{optionPrompt}</option>
                {available.map((college) => (
                  <option value={college.unitId} key={college.unitId}>
                    {college.name} · {college.city}, {college.state}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={pendingId === "" || selected.length >= 4} onClick={addCollege}>
              <Plus size={16} aria-hidden="true" />
              Add college
            </button>
            <div className={styles.searchFeedback}>
              <p id="admissions-search-status" role={searchPhase === "error" ? "alert" : "status"} aria-live="polite">{searchStatus}</p>
              {searchPhase === "error" ? (
                <button type="button" onClick={retrySearch}>
                  Retry search
                </button>
              ) : null}
            </div>
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
                      <div className={styles.cardActions}>
                        <LocalSaveButton
                          unitId={college.unitId}
                          collegeName={college.name}
                          className={styles.localSave}
                        />
                        <Link href={`/colleges/${college.slug}`}>Full evidence profile <ArrowRight size={14} aria-hidden="true" /></Link>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${college.name} from admit-rate context`}
                        onClick={() => removeCollege(college.unitId)}
                      >
                        Remove
                      </button>
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
