"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  CircleAlert,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

import { CollegeLogo } from "@/app/components/CollegeLogo";
import {
  hasActiveMatchSignal,
  MATCH_CRITERIA,
  rankMatches,
  type MatchCollege,
  type MatchCriterion,
  type MatchPreferences,
  type MatchWeights,
} from "./scoring";
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
  graduation: "Graduation outcome",
  earnings: "Earnings context",
};

const initialWeights: MatchWeights = {
  major: 5,
  location: 3,
  price: 4,
  size: 2,
  graduation: 4,
  earnings: 3,
};

const initialPreferences: MatchPreferences = {
  major: "undecided",
  region: "anywhere",
  ownership: "any",
  maxNetPrice: 30_000,
  size: "any",
  weights: initialWeights,
};

function scoreTone(score: number) {
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
  if (!component) return "No strong tradeoff appears in the active signals.";
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
    useState<MatchPreferences>(initialPreferences);
  const hasActiveSignal = hasActiveMatchSignal(preferences.weights);

  const results = useMemo(
    () => hasActiveSignal ? rankMatches(colleges, preferences, 10) : [],
    [colleges, hasActiveSignal, preferences],
  );

  const updatePreference = <Key extends keyof MatchPreferences>(
    key: Key,
    value: MatchPreferences[Key],
  ) => setPreferences((current) => ({ ...current, [key]: value }));

  const updateWeight = (criterion: MatchCriterion, value: number) => {
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
            Preference studio
          </span>
          <h1>A college list with reasons attached.</h1>
          <p>
            Set what matters, tune its importance, and inspect exactly why a
            college appears. This is preference alignment—not an admissions
            prediction or a ranking of school quality.
          </p>
        </div>
        <aside className={styles.formulaCard} aria-label="Scoring summary">
          <span>Transparent formula</span>
          <strong>Weighted evidence ÷ available weights</strong>
          <p>
            Missing evidence is removed from the denominator. It is never
            silently scored as zero.
          </p>
        </aside>
      </header>

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
              <p>Changes update the ten results immediately.</p>
            </div>
          </div>

          <div className={styles.controlGrid}>
            <label>
              <span>Field or major area</span>
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
              <small>This is a hard filter, not a scored preference.</small>
            </label>

            <label>
              <span>Preferred maximum average net price</span>
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
              <small>Net price is cohort-specific and is not your personal aid offer.</small>
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
          </div>

          <fieldset className={styles.weights}>
            <legend>How important is each signal?</legend>
            <p id="weight-help">Zero removes a signal. Five gives it the most influence.</p>
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
                <output>{preferences.weights[criterion]} / 5</output>
              </label>
            ))}
          </fieldset>
        </aside>

        <section className={styles.results} aria-labelledby="match-results-heading" aria-live="polite">
          <div className={styles.resultsHeading}>
            <div>
              <span>02 / live worksheet</span>
              <h2 id="match-results-heading">
                {hasActiveSignal
                  ? "Ten places to investigate"
                  : "Choose what should shape your list"}
              </h2>
            </div>
            <p>
              {hasActiveSignal
                ? "Ordered only by the preferences above. Open each score to audit its evidence and effective weighting."
                : "No colleges are ranked until at least one preference signal is active."}
            </p>
          </div>

          {!hasActiveSignal ? (
            <div className={styles.emptyState}>
              <CircleAlert size={24} aria-hidden="true" />
              <h3>Turn on at least one signal.</h3>
              <p>
                Move any importance slider above zero to see preference-aligned
                colleges. Until then, there is no honest basis for an alignment
                score or result order.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className={styles.emptyState}>
              <CircleAlert size={24} aria-hidden="true" />
              <h3>No colleges match that hard filter.</h3>
              <p>Choose both ownership types to restore the complete evidence set.</p>
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
                        <span>Why it surfaced</span>
                        {reasons.length > 0 ? (
                          <ul>
                            {reasons.map((reason) => (
                              <li key={reason.key}><CheckCircle2 size={14} aria-hidden="true" />{reason.note}</li>
                            ))}
                          </ul>
                        ) : <p>No high-alignment signal; inspect the full score below.</p>}
                      </div>
                      <div>
                        <span>Tradeoff to inspect</span>
                        <p>{tradeoffCopy(tradeoff)}</p>
                      </div>
                    </div>

                    <dl className={styles.quickFacts}>
                      <div>
                        <dt>Average net price</dt>
                        <dd>{result.college.netPrice.value === null ? "Not reported" : currency.format(result.college.netPrice.value)}</dd>
                        <small>{result.college.netPrice.periodLabel}</small>
                      </div>
                      <div>
                        <dt>Graduation outcome</dt>
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
                        Audit this preference score
                      </summary>
                      <div className={styles.breakdownTable}>
                        {result.components.map((component) => (
                          <div key={component.key}>
                            <span>{component.label}</span>
                            <strong>{component.score === null ? "Excluded—missing" : `${Math.round(component.score * 100)} points`}</strong>
                            <small>
                              {component.score === null
                                ? "No denominator weight used"
                                : `${Math.round((component.weight / result.usedWeight) * 100)}% effective weight`}
                            </small>
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
                      <Link href={`/colleges/${result.college.slug}`}>
                        Inspect full record <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

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
