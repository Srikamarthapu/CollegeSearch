"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  CircleAlert,
  SlidersHorizontal,
  RotateCcw,
  Share2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ApplicantProfile } from "@/app/components/ApplicantProfile";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import { LocalSaveButton } from "@/app/components/LocalSaveButton";
import { ResearchNotebook } from "@/app/components/ResearchNotebook";
import {
  balancedObservedShortlist,
  hasActiveMatchSignal,
  MATCH_CRITERIA,
  RESIDENCY_STATES,
  rankMatches,
  weightsForActiveCriteria,
  type MatchCollege,
  type MatchCriterion,
  type MatchPreferences,
} from "./scoring";
import {
  initialMatchWorksheet,
  parseMatchWorksheet,
  serializeMatchWorksheet,
} from "./url-state";
import styles from "./match.module.css";

type MatchToolProps = {
  colleges: MatchCollege[];
  majorOptions: string[];
  stateOptions: string[];
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

const criterionLabels: Record<MatchCriterion, string> = {
  major: "Field availability",
  location: "Location",
  price: "Average net price",
  size: "Campus size",
  setting: "Campus setting",
  graduation: "Graduation outcome",
  earnings: "Earnings context",
};

type SelectPreferenceKey = Exclude<keyof MatchPreferences, "weights">;

function selectedCriterion(
  key: SelectPreferenceKey,
  value: MatchPreferences[SelectPreferenceKey],
): MatchCriterion | null {
  if (key === "major" && value !== "undecided") return "major";
  if (key === "region" && value !== "anywhere") return "location";
  if (key === "maxNetPrice" && value !== null) return "price";
  if (key === "size" && value !== "any") return "size";
  if (key === "setting" && value !== "any") return "setting";
  return null;
}

function criterionCanScore(
  criterion: MatchCriterion,
  preferences: MatchPreferences,
) {
  if (criterion === "major") return preferences.major !== "undecided";
  if (criterion === "location") return preferences.region !== "anywhere";
  if (criterion === "price") return preferences.maxNetPrice !== null;
  if (criterion === "size") return preferences.size !== "any";
  if (criterion === "setting") return preferences.setting !== "any";
  return true;
}

function scoreTone(score: number) {
  if (score === 0) return "No measured alignment";
  if (score >= 80) return "Strong preference alignment";
  if (score >= 65) return "Good preference alignment";
  return "Some preference alignment";
}

function strongestReasons(components: ReturnType<typeof rankMatches>[number]["components"]) {
  return components
    .filter((component) => component.score !== null && component.score >= 0.75)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 2);
}

function importantTradeoff(components: ReturnType<typeof rankMatches>[number]["components"]) {
  return [...components]
    .filter((component) => component.missing || (component.score !== null && component.score < 0.65))
    .sort((left, right) => right.weight - left.weight)[0];
}

function tradeoffCopy(
  component: ReturnType<typeof rankMatches>[number]["components"][number] | undefined,
) {
  if (!component) return "No clear tradeoff appears in your selected preferences.";
  if (component.missing || component.score === null) return component.note;
  if (component.key === "graduation") {
    return "The reported graduation outcome leaves more room for scrutiny; inspect its cohort and definition.";
  }
  if (component.key === "earnings") {
    return "Reported earnings sit below the upper range in this 50-college release; program mix and cohort still matter.";
  }
  return component.note;
}

export function MatchTool({
  colleges,
  majorOptions,
  stateOptions,
}: MatchToolProps) {
  const [preferences, setPreferences] =
    useState<MatchPreferences>(() => initialMatchWorksheet().preferences);
  const [hasStudentInput, setHasStudentInput] = useState(false);
  const [activeCriteria, setActiveCriteria] = useState<MatchCriterion[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [manualShareLink, setManualShareLink] = useState("");
  const manualShareRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    const restore = () => {
      if (window.location.pathname !== "/match") return;
      const restored = parseMatchWorksheet(window.location.search, { majorOptions, stateOptions });
      queueMicrotask(() => {
        if (!mounted || window.location.pathname !== "/match") return;
        setPreferences(restored.preferences);
        setActiveCriteria(restored.activeCriteria);
        setHasStudentInput(restored.hasStudentInput);
        setManualShareLink("");
        setShareStatus("");
        setHydrated(true);
      });
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      mounted = false;
      window.removeEventListener("popstate", restore);
    };
  }, [majorOptions, stateOptions]);

  useEffect(() => {
    if (!hydrated || window.location.pathname !== "/match") return;
    const url = new URL(window.location.href);
    url.search = serializeMatchWorksheet(url.search, { preferences, activeCriteria, hasStudentInput });
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeCriteria, hasStudentInput, hydrated, preferences]);

  const clearShareMessage = () => {
    setShareStatus("");
    setManualShareLink("");
  };

  const resetPreferences = () => {
    const initial = initialMatchWorksheet();
    setPreferences(initial.preferences);
    setActiveCriteria(initial.activeCriteria);
    setHasStudentInput(false);
    setManualShareLink("");
    setShareStatus("Preferences reset. Choose a preference to start again.");
  };

  const sharePreferences = async () => {
    const url = new URL(window.location.href);
    url.search = serializeMatchWorksheet(url.search, { preferences, activeCriteria, hasStudentInput });
    try {
      await navigator.clipboard.writeText(url.href);
      setManualShareLink("");
      setShareStatus("Link copied. It includes your preferences and importance settings.");
    } catch {
      setManualShareLink(url.href);
      setShareStatus("Copy the link below to share these preferences.");
      window.requestAnimationFrame(() => {
        manualShareRef.current?.focus();
        manualShareRef.current?.select();
      });
    }
  };
  const effectiveWeights = useMemo(
    () => weightsForActiveCriteria(preferences.weights, activeCriteria),
    [activeCriteria, preferences.weights],
  );
  const hasActiveSignal = hasActiveMatchSignal(effectiveWeights);

  const setCriterionActive = (criterion: MatchCriterion, active: boolean) => {
    setActiveCriteria((current) => {
      const isActive = current.includes(criterion);
      if (isActive === active) return current;
      return active
        ? [...current, criterion]
        : current.filter((item) => item !== criterion);
    });
  };

  const allResults = useMemo(
    () => hasActiveSignal
      ? rankMatches(
          colleges,
          { ...preferences, weights: effectiveWeights },
          colleges.length,
        )
      : [],
    [colleges, effectiveWeights, hasActiveSignal, preferences],
  );
  const results = allResults.slice(0, 10);
  const balancedShortlist = useMemo(
    () => balancedObservedShortlist(allResults),
    [allResults],
  );

  const updatePreference = <Key extends SelectPreferenceKey>(
    key: Key,
    value: MatchPreferences[Key],
  ) => {
    clearShareMessage();
    setHasStudentInput(true);
    const previousCriterion = key === "major"
      ? "major"
      : key === "region"
        ? "location"
        : key === "maxNetPrice"
          ? "price"
          : key === "size"
            ? "size"
            : key === "setting"
              ? "setting"
            : null;
    const nextCriterion = selectedCriterion(key, value);

    if (previousCriterion) {
      setCriterionActive(
        previousCriterion,
        nextCriterion === previousCriterion &&
          preferences.weights[previousCriterion] > 0,
      );
    }
    setPreferences((current) =>
      key === "major" && value === "undecided"
        ? { ...current, major: "undecided", majorMode: "prefer" }
        : { ...current, [key]: value },
    );
  };

  const updateWeight = (criterion: MatchCriterion, value: number) => {
    clearShareMessage();
    setHasStudentInput(true);
    setCriterionActive(
      criterion,
      value > 0 && criterionCanScore(criterion, preferences),
    );
    setPreferences((current) => ({
      ...current,
      weights: { ...current.weights, [criterion]: value },
    }));
  };

  return (
    <>
      <header className={styles.masthead}>
        <div>
          <span className="page-eyebrow">
            <SlidersHorizontal size={15} aria-hidden="true" />
            Find your fit
          </span>
          <h1>What matters to you in a college?</h1>
          <p>
            Start with a field, a place, or a budget. Adjust what matters and
            build a list of colleges to look into. Each result explains how it
            fits your preferences.
          </p>
        </div>
        <aside className={styles.formulaCard} aria-label="How preference scores work">
          <span>You set the priorities</span>
          <strong>A starting point for your research.</strong>
          <p>
            Scores describe preference alignment, not admission chances or
            college quality. Missing evidence is left out of the calculation.
          </p>
        </aside>
      </header>

      <ApplicantProfile />

      <div className={styles.worksheetActions}>
        <p>Your preferences stay in this page’s link. Save it or share it with someone helping you.</p>
        <div>
          <button type="button" onClick={sharePreferences} disabled={!hydrated}>
            <Share2 size={16} aria-hidden="true" />Share preferences
          </button>
          <button type="button" onClick={resetPreferences} disabled={!hydrated || !hasStudentInput}>
            <RotateCcw size={16} aria-hidden="true" />Reset preferences
          </button>
        </div>
        <span className={styles.shareStatus} role="status">{shareStatus}</span>
        {manualShareLink ? (
          <label className={styles.manualShare}>
            <span>Link to these preferences</span>
            <input ref={manualShareRef} readOnly value={manualShareLink} onFocus={(event) => event.target.select()} />
          </label>
        ) : null}
      </div>

      <div className={styles.workspace}>
        <aside
          className={styles.controls}
          aria-labelledby="preferences-heading"
          data-lenis-prevent
        >
          <div className={styles.panelHeading}>
            <span>01</span>
            <div>
              <h2 id="preferences-heading">Shape your shortlist</h2>
              <p>Choose one preference to begin. Your list updates as you go.</p>
            </div>
          </div>

          <div className={styles.controlGrid}>
            <label>
              <span>Field of study</span>
              <select
                value={preferences.major}
                onChange={(event) => updatePreference("major", event.target.value)}
              >
                <option value="undecided">Undecided / keep fields open</option>
                {majorOptions.map((major) => (
                  <option value={major} key={major}>{major}</option>
                ))}
              </select>
              <small>Broad bachelor&apos;s-field availability, not major admission.</small>
            </label>

            {preferences.major !== "undecided" ? (
              <label>
                <span>Field requirement</span>
                <select
                  value={preferences.majorMode}
                  onChange={(event) =>
                    updatePreference(
                      "majorMode",
                      event.target.value as MatchPreferences["majorMode"],
                    )
                  }
                >
                  <option value="prefer">Prefer it, keep options open</option>
                  <option value="require">Require broad-field evidence</option>
                </select>
                <small>
                  “Require” removes colleges without the selected broad
                  federal field indicator; it does not confirm a specific
                  major or concentration.
                </small>
              </label>
            ) : null}

            <label>
              <span>Location preference</span>
              <select
                value={preferences.region}
                onChange={(event) => updatePreference("region", event.target.value)}
              >
                <option value="anywhere">Anywhere</option>
                <option value="west">West</option>
                <option value="midwest">Midwest</option>
                <option value="northeast">Northeast</option>
                <option value="south">South</option>
                <optgroup label="Specific state">
                  {stateOptions.map((state) => (
                    <option value={`state:${state}`} key={state}>{state}</option>
                  ))}
                </optgroup>
              </select>
            </label>

            <label>
              <span>College type</span>
              <select
                value={preferences.ownership}
                onChange={(event) => updatePreference("ownership", event.target.value)}
              >
                <option value="any">Public or private nonprofit</option>
                <option value="Public">Public only</option>
                <option value="Private nonprofit">Private nonprofit only</option>
              </select>
              <small>Only the selected college type appears in your results.</small>
            </label>

            <label>
              <span>Historical net-price preference</span>
              <select
                value={preferences.maxNetPrice ?? "none"}
                onChange={(event) => updatePreference(
                  "maxNetPrice",
                  event.target.value === "none" ? null : Number(event.target.value),
                )}
              >
                <option value="15000">$15,000</option>
                <option value="20000">$20,000</option>
                <option value="30000">$30,000</option>
                <option value="40000">$40,000</option>
                <option value="60000">$60,000</option>
                <option value="none">No price preference</option>
              </select>
              <small>Past average annual cost after grants for first-time, full-time students receiving federal Title IV aid. Public-college figures describe in-state students. This is not a personal cost estimate.</small>
            </label>

            <label>
              <span>Your tuition-residency state</span>
              <select value={preferences.residencyState} onChange={(event) => updatePreference("residencyState", event.target.value)}>
                <option value="unknown">Unsure / not selected</option>
                {RESIDENCY_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                <option value="international">International / outside these states</option>
              </select>
              <small>Public-college price is excluded unless the state matches. Each college determines tuition residency; living in a state alone may not qualify you. Confirm with its admissions office and net-price calculator.</small>
            </label>

            <label>
              <span>Undergraduate size</span>
              <select
                value={preferences.size}
                onChange={(event) => updatePreference("size", event.target.value)}
              >
                <option value="any">Any size</option>
                <option value="small">Small · under 10,000</option>
                <option value="medium">Medium · 10,000–24,999</option>
                <option value="large">Large · 25,000+</option>
              </select>
            </label>

            <label>
              <span>Campus setting</span>
              <select
                value={preferences.setting}
                onChange={(event) =>
                  updatePreference(
                    "setting",
                    event.target.value as MatchPreferences["setting"],
                  )
                }
              >
                <option value="any">Any setting</option>
                <option value="City">City</option>
                <option value="Suburb">Suburb</option>
                <option value="Town">Town</option>
              </select>
            </label>
          </div>

          <fieldset className={styles.weights}>
            <legend>How much does each matter?</legend>
            <p id="weight-help">
              Choosing a preference turns on its suggested importance. Adjust
              graduation or earnings to include them too. Set any importance to
              zero to leave it out.
            </p>
            {MATCH_CRITERIA.map((criterion) => (
              <label key={criterion}>
                <span>{criterionLabels[criterion]}</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={preferences.weights[criterion]}
                  aria-describedby="weight-help"
                  onChange={(event) => updateWeight(criterion, Number(event.target.value))}
                />
                <output>
                  {preferences.weights[criterion]} / 5 · {effectiveWeights[criterion] > 0 ? "active" : "inactive"}
                </output>
              </label>
            ))}
          </fieldset>
        </aside>

        <section className={styles.results} aria-labelledby="match-results-heading" aria-live="polite">
          <div className={styles.resultsHeading}>
            <div>
              <span>Your research list</span>
              <h2 id="match-results-heading">
                {hasActiveSignal
                  ? results.length > 0
                    ? `${results.length} ${results.length === 1 ? "place" : "places"} to investigate`
                    : "No colleges match those constraints"
                  : hasStudentInput
                    ? "Choose what should shape your list"
                    : "Start with one preference"}
              </h2>
            </div>
            <p>
              {hasActiveSignal
                ? results.length > 0
                  ? "Ordered only by the preferences above. Open a score to see the evidence and importance behind it."
                  : "Required-field and college-type choices stay as hard constraints. Relax one constraint or activate a different preference."
                : hasStudentInput
                  ? "Choose a preference with an importance above zero to see colleges."
                  : "Your list begins when you choose a preference or adjust its importance."}
            </p>
          </div>

          {!hasStudentInput ? (
            <div className={styles.emptyState}>
              <CircleAlert size={24} aria-hidden="true" />
              <h3>Choose one place to begin.</h3>
              <p>
                Select a field, location, price, size, or campus setting—or
                adjust Graduation outcome or Earnings context. College type
                narrows the list once you choose a preference.
              </p>
            </div>
          ) : !hasActiveSignal ? (
            <div className={styles.emptyState}>
              <CircleAlert size={24} aria-hidden="true" />
              <h3>Choose a preference to include.</h3>
              <p>
                Choose a field, location, price, size, or campus setting, or
                adjust Graduation outcome or Earnings context. College type
                narrows an existing list. A zero importance leaves that
                preference out.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className={styles.emptyState}>
              <CircleAlert size={24} aria-hidden="true" />
              <h3>No colleges meet those requirements.</h3>
              <p>Try allowing both college types or changing your required field of study.</p>
            </div>
          ) : (
            <ol className={styles.resultList}>
              {results.map((result, index) => {
                const reasons = strongestReasons(result.components);
                const tradeoff = importantTradeoff(result.components);
                const admitRate = result.college.admitRate.value;

                return (
                  <li key={result.college.unitId} className={styles.resultCard}>
                    <div className={styles.rank} aria-label={`Result ${index + 1}`}>
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className={styles.identity}>
                      <CollegeLogo college={result.college} variant="card" />
                      <div>
                        <Link href={`/colleges/${result.college.slug}`}>
                          {result.college.name}
                        </Link>
                        <span>{result.college.city}, {result.college.state} · {result.college.ownership}</span>
                      </div>
                    </div>
                    <div className={styles.scoreBlock}>
                      <strong>{result.score}<small>/100</small></strong>
                      <span>{scoreTone(result.score)}</span>
                    </div>

                    <div className={styles.cardEvidence}>
                      <div>
                        <span>What fits</span>
                        {reasons.length > 0 ? (
                          <ul>
                            {reasons.map((reason) => (
                              <li key={reason.key}><CheckCircle2 size={14} aria-hidden="true" />{reason.note}</li>
                            ))}
                          </ul>
                        ) : <p>No strong match on your selected preferences. See the score details below.</p>}
                      </div>
                      <div>
                        <span>Worth a closer look</span>
                        <p>{tradeoffCopy(tradeoff)}</p>
                      </div>
                    </div>

                    <dl className={styles.quickFacts}>
                      <div>
                        <dt>{result.college.ownership === "Public" ? "Historical in-state net price" : "Historical average net price"}</dt>
                        <dd>{result.college.netPrice.value === null ? "Not reported" : currency.format(result.college.netPrice.value)}</dd>
                        <small>{result.college.netPrice.periodLabel}</small>
                        {result.college.netPriceCalculator ? <details>
                          <summary>Estimate my own cost</summary>
                          <p><a href={result.college.netPriceCalculator.url} target="_blank" rel="noreferrer">Official net price calculator ↗</a></p>
                          <p>Link checked {result.college.netPriceCalculator.checkedOn}. Verify the aid year and eligibility; this is not an aid offer. {result.college.netPriceCalculator.note}</p>
                        </details> : <small>Open the college record for official cost resources.</small>}
                      </div>
                      <div>
                        <dt>Federal completion measure</dt>
                        <dd>{result.college.graduationRate.value === null ? "Not reported" : percent.format(result.college.graduationRate.value)}</dd>
                        <small>{result.college.graduationRate.periodLabel}</small>
                      </div>
                      <div>
                        <dt>Undergraduates</dt>
                        <dd>{result.college.enrollment.value === null ? "Not reported" : number.format(result.college.enrollment.value)}</dd>
                        <small>{result.college.enrollment.periodLabel}</small>
                      </div>
                    </dl>

                    <details className={styles.breakdown}>
                      <summary>
                        <Calculator size={15} aria-hidden="true" />
                        How this score was calculated
                      </summary>
                      <div className={styles.breakdownTable}>
                        {result.components.map((component) => (
                          <div key={component.key}>
                            <span>{component.label}</span>
                            <strong>{component.score === null ? "Excluded" : `${Math.round(component.score * 100)} points`}</strong>
                            <small>
                              {component.score === null
                                ? "No denominator weight used"
                                : `${Math.round((component.weight / result.usedWeight) * 100)}% effective weight`}
                            </small>
                            <p>{component.note}</p>
                          </div>
                        ))}
                      </div>
                      <p>
                        The 0–100 score is a weighted alignment summary within
                        this 50-college release. It is not a quality grade.
                      </p>
                    </details>

                    <div className={styles.cardFooter}>
                      <span>
                        Historical overall admit rate: {admitRate === null ? "not reported" : percent.format(admitRate)} · {result.college.admitRate.periodLabel}
                      </span>
                      <div className={styles.cardFooterActions}>
                        <LocalSaveButton
                          unitId={result.college.unitId}
                          collegeName={result.college.name}
                          className={styles.localSave}
                        />
                        <Link href={`/colleges/${result.college.slug}`}>
                          Inspect full record <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                      </div>
                    </div>
                    <div className={styles.researchSlot}>
                      <ResearchNotebook unitId={result.college.unitId} collegeName={result.college.name} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {balancedShortlist.length > 0 ? (
        <section
          className={styles.balanceSection}
          aria-labelledby="selectivity-mix-heading"
        >
          <div className={styles.balanceHeading}>
            <div>
              <span>03 / list check</span>
              <h2 id="selectivity-mix-heading">Check the selectivity mix.</h2>
            </div>
            <p>
              One leading preference match from each observed overall-rate
              band. These are historical institution-wide bands—not personal
              chances, targets, or safeties.
            </p>
          </div>
          <div className={styles.balanceGrid}>
            {balancedShortlist.map(({ band, result }) => (
              <article key={band.key}>
                <span>{band.label}</span>
                <small>{band.rangeLabel}</small>
                <div className={styles.balanceIdentity}>
                  <CollegeLogo college={result.college} variant="suggestion" />
                  <div>
                    <Link href={`/colleges/${result.college.slug}`}>
                      {result.college.name}
                    </Link>
                    <p>
                      {result.score}/100 preference alignment ·{" "}
                      {result.college.city}, {result.college.state}
                    </p>
                  </div>
                </div>
                <footer>
                  <span>
                    Overall rate:{" "}
                    {result.college.admitRate.value === null
                      ? "not reported"
                      : percent.format(result.college.admitRate.value)}
                    {" · "}
                    {result.college.admitRate.periodLabel}
                  </span>
                  <LocalSaveButton
                    unitId={result.college.unitId}
                    collegeName={result.college.name}
                    className={styles.localSave}
                  />
                </footer>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <aside className={styles.guardrail}>
        <CircleAlert size={21} aria-hidden="true" />
        <div>
          <strong>Fit and admission likelihood are different questions.</strong>
          <p>
            These results never use the overall admit rate in the preference
            score. Use the historical context tool separately, and never treat
            a high fit score as a likely admission.
          </p>
        </div>
        <Link href="/chances">Open admit-rate context <ArrowRight size={15} aria-hidden="true" /></Link>
      </aside>
    </>
  );
}
