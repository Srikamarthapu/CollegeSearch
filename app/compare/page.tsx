import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  Info,
  Scale,
} from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import { NegativeNetPriceNote } from "@/app/components/NegativeNetPriceNote";
import {
  collegesByUnitIds,
  compactName,
  formatObservation,
  majorEvidenceFor,
  percentFormatter,
  type College,
  type Observation,
} from "@/app/lib/college-data";
import { MAJOR_OPTIONS } from "@/app/lib/college-search";

type ComparePageProps = {
  searchParams: Promise<{
    colleges?: string | string[];
    ids?: string | string[];
    major?: string | string[];
  }>;
};

type ComparisonRow = {
  label: string;
  observation: (college: College) => Observation | null;
  publicOnly?: boolean;
  privateLabel?: string;
  mixedLabel?: string;
  costKind?: "fees";
};

const comparisonRows: ComparisonRow[] = [
  { label: "Resident tuition", publicOnly: true, observation: (college) => college.costs.tuitionInState },
  { label: "Out-of-state tuition", privateLabel: "Published tuition", mixedLabel: "Out-of-state / published tuition", observation: (college) => college.costs.tuitionOutOfState },
  { label: "Resident fees", publicOnly: true, costKind: "fees", observation: (college) => college.costs.feesInState },
  { label: "Out-of-state fees", privateLabel: "Published fees", mixedLabel: "Out-of-state / published fees", costKind: "fees", observation: (college) => college.costs.feesOutOfState },
  { label: "Historical average net price (federal aid cohort)", observation: (college) => college.observations.averageNetPrice },
  { label: "Headline admit rate", observation: (college) => college.observations.admitRate },
  { label: "Completion / graduation rate", observation: (college) => college.observations.graduationRate },
  { label: "Median earnings", observation: (college) => college.observations.medianEarnings },
  { label: "Undergraduate enrollment", observation: (college) => college.observations.undergraduateEnrollment },
  { label: "Applicants", observation: (college) => college.observations.applicants },
  { label: "Admitted", observation: (college) => college.observations.admits },
  { label: "Enrolled", observation: (college) => college.observations.enrollees },
];

function comparisonLabel(row: ComparisonRow, selected: College[]) {
  if (row.label === "Resident tuition") {
    const labels = new Set(selected
      .filter((college) => college.ownership === "Public")
      .map((college) => college.costs.tuitionInState.sourceField === "TUITIONFEE_IN" && college.costs.tuitionInState.publisher === "U.S. Department of Education"
        ? "In-district tuition"
        : "In-state tuition"));
    return labels.size === 1 ? [...labels][0] : "Resident tuition (basis varies)";
  }
  if (row.costKind === "fees") {
    const applicable = row.publicOnly
      ? selected.filter((college) => college.ownership === "Public")
      : selected;
    const bases = new Set(applicable.map((college) => college.costs.feeBasis));
    const basisLabel = bases.size !== 1
      ? "fees / allowances (basis varies)"
      : [...bases][0] === "allowance" ? "fee allowance" : "required fees";
    const scope = row.label === "Resident fees"
      ? "Resident"
      : selected.every((college) => college.ownership !== "Public")
        ? "Published"
        : selected.some((college) => college.ownership !== "Public")
          ? "Out-of-state / published"
          : "Out-of-state";
    return `${scope} ${basisLabel}`;
  }
  if (row.privateLabel && selected.every((college) => college.ownership !== "Public")) return row.privateLabel;
  if (row.mixedLabel && selected.some((college) => college.ownership !== "Public")) return row.mixedLabel;
  return row.label;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseUnitIds(value: string | undefined) {
  const seen = new Set<number>();
  const parsed: number[] = [];

  for (const token of value?.split(",") ?? []) {
    const unitId = Number(token.trim());
    if (!Number.isInteger(unitId) || unitId <= 0 || seen.has(unitId)) continue;
    seen.add(unitId);
    parsed.push(unitId);
    if (parsed.length === 4) break;
  }

  return parsed;
}

function comparisonHref(colleges: College[], major: string | undefined) {
  const query = new URLSearchParams();
  if (colleges.length > 0) {
    query.set("colleges", colleges.map((college) => college.unitId).join(","));
  }
  if (major) query.set("major", major);
  const suffix = query.toString();
  return suffix ? `/compare?${suffix}` : "/compare";
}

function explorerContinuationHref(
  colleges: College[],
  major: string | undefined,
) {
  const query = new URLSearchParams();
  if (colleges.length > 0) {
    query.set("compare", colleges.map((college) => college.unitId).join(","));
  }
  if (major) query.set("major", major);
  const suffix = query.toString();
  return suffix ? `/explore?${suffix}` : "/explore";
}

function mixedEvidenceRows(colleges: College[]) {
  return comparisonRows.filter((row) => {
    const observations = colleges
      .map(row.observation)
      .filter((observation): observation is Observation => Boolean(observation));

    if (observations.length < 2) return false;

    return (
      new Set(
        observations.map(
          (observation) =>
            `${observation.comparabilityKey}:${observation.periodLabel}`,
        ),
      ).size > 1
    );
  });
}

function ObservationValue({
  observation,
  showDefinition = false,
  sourceDetail,
}: {
  observation: Observation | null;
  showDefinition?: boolean;
  sourceDetail?: string;
}) {
  if (!observation) {
    return (
      <span className="comparison-missing">
        Not reported
        <small>No comparable value in this release</small>
      </span>
    );
  }

  return (
    <span className="comparison-value">
      <strong>{formatObservation(observation)}</strong>
      {showDefinition ? <small>{observation.definition}</small> : null}
      {sourceDetail ? <small>{sourceDetail} · source field {observation.sourceField}</small> : null}
      <small>
        {observation.periodLabel} · <a href={observation.sourceUrl} target="_blank" rel="noreferrer">{observation.publisher}</a>
      </small>
    </span>
  );
}

function ComparisonNotice({ children }: { children: ReactNode }) {
  return (
    <aside className="comparison-notice" aria-label="Comparison note">
      <Scale size={19} aria-hidden="true" />
      <p>{children}</p>
    </aside>
  );
}

export default async function ComparePage({
  searchParams,
}: ComparePageProps) {
  const query = await searchParams;
  const rawCollegeIds = first(query.colleges) ?? first(query.ids);
  const requestedIds = parseUnitIds(rawCollegeIds);
  const selected = collegesByUnitIds(requestedIds).sort(
    (left, right) =>
      requestedIds.indexOf(left.unitId) - requestedIds.indexOf(right.unitId),
  );
  const requestedMajor = first(query.major)?.trim();
  const selectedMajor =
    requestedMajor && MAJOR_OPTIONS.includes(requestedMajor)
      ? requestedMajor
      : undefined;
  const mixedRows = mixedEvidenceRows(selected);

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="page-shell comparison-page">
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/explore">
            <ArrowLeft size={15} aria-hidden="true" />
            Explore
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Compare</span>
        </nav>

        <header className="comparison-masthead">
          <div>
            <span className="page-eyebrow">
              <Scale size={15} aria-hidden="true" />
              Your comparison
            </span>
            <h1>Your options, side by side.</h1>
            <p>
              Compare costs, admissions, and outcomes for up to four colleges.
              Check the reporting years as you go; they can differ between schools.
            </p>
          </div>
          <Link
            className="page-secondary-action"
            href={explorerContinuationHref(selected, selectedMajor)}
          >
            Add or change colleges
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </header>

        {selected.length === 0 ? (
          <section className="comparison-empty">
            <span className="page-section-index">00</span>
            <h2>No colleges selected yet.</h2>
            <p>
              Choose two to four colleges in the explorer to build an
              evidence-led comparison.
            </p>
            <Link className="page-primary-action" href="/explore">
              Explore colleges
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <>
            {selected.length === 1 ? (
              <ComparisonNotice>
                Add at least one more college for a useful comparison. This
                first profile is ready and will remain selected.
              </ComparisonNotice>
            ) : null}

            {mixedRows.length > 0 ? (
              <ComparisonNotice>
                {mixedRows.length}{" "}
                {mixedRows.length === 1 ? "measure uses" : "measures use"}{" "}
                different definitions or reporting periods. Read the period and
                source beneath each value before comparing.
              </ComparisonNotice>
            ) : null}

            <details className="comparison-field-disclosure" open={Boolean(selectedMajor)}>
              <summary><GraduationCap size={18} aria-hidden="true" />{selectedMajor ? `Field: ${selectedMajor}` : "Add a field of study to your comparison"}<ChevronDown size={17} aria-hidden="true" /></summary>
            <section
              className="comparison-field-lens"
              aria-labelledby="comparison-field-heading"
            >
              <div className="comparison-field-intro">
                <span className="page-evidence-label">
                  <GraduationCap size={15} aria-hidden="true" />
                  Optional field lens
                </span>
                <h2 id="comparison-field-heading">
                  Add a broad field to the table.
                </h2>
                <p id="comparison-field-help">
                  Choose one field to compare its bachelor&apos;s or associate program evidence
                  across the colleges already selected.
                </p>
              </div>

              <form
                className="comparison-field-form"
                action="/compare"
                method="get"
              >
                <input
                  type="hidden"
                  name="colleges"
                  value={selected.map((college) => college.unitId).join(",")}
                />
                <label className="filter-field" htmlFor="comparison-major">
                  <span>Broad degree field</span>
                  <div className="select-wrap">
                    <select
                      id="comparison-major"
                      name="major"
                      defaultValue={selectedMajor ?? ""}
                      aria-describedby="comparison-field-help comparison-field-boundary"
                    >
                      <option value="">No field selected</option>
                      {MAJOR_OPTIONS.map((major) => (
                        <option value={major} key={major}>
                          {major}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} aria-hidden="true" />
                  </div>
                </label>
                <div className="comparison-field-actions">
                  <button className="page-primary-action" type="submit">
                    Apply field
                  </button>
                  {selectedMajor ? (
                    <Link
                      className="page-secondary-action"
                      href={comparisonHref(selected, undefined)}
                    >
                      Clear field
                    </Link>
                  ) : null}
                </div>
              </form>

              <p
                className="comparison-field-boundary"
                id="comparison-field-boundary"
              >
                <Info size={16} aria-hidden="true" />
                <span>
                  This shows broad field availability and share of all awards, not a
                  major-specific admit rate or an applicant&apos;s chance of
                  admission.
                </span>
              </p>
            </section>
            </details>

            <section
              className="comparison-table-section"
              aria-labelledby="comparison-heading"
            >
              <div className="page-section-heading">
                <div>
                  <span className="page-section-index">01</span>
                  <h2 id="comparison-heading">Institution evidence</h2>
                </div>
                <p>
                  {selected.length} of 4 comparison positions filled
                </p>
              </div>

              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <caption>
                    Admissions, enrollment, cost, and outcome evidence for{" "}
                    {selected.map(compactName).join(", ")}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      {selected.map((college) => (
                        <th scope="col" key={college.unitId}>
                          <CollegeLogo college={college} variant="comparison" />
                          <Link href={`/colleges/${college.slug}`}>
                            {compactName(college)}
                          </Link>
                          <small>
                            {college.city}, {college.state}
                          </small>
                          <small>{college.ownership} · {college.institutionLevel}</small>
                          <Link
                            className="comparison-remove"
                            href={comparisonHref(
                              selected.filter(
                                (item) => item.unitId !== college.unitId,
                              ),
                              selectedMajor,
                            )}
                            aria-label={`Remove ${compactName(college)} from comparison`}
                          >
                            Remove
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.filter((row) => !row.publicOnly || selected.some((college) => college.ownership === "Public")).map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{comparisonLabel(row, selected)}</th>
                        {selected.map((college) => {
                          const observation = row.observation(college);
                          const sourceDetail = row.costKind === "fees" && observation
                            ? college.costs.feeBasis === "allowance" ? "Cost-of-attendance fee allowance (budget estimate)" : "Reported required fees"
                            : undefined;
                          return <td key={college.unitId}>
                            {row.publicOnly && college.ownership !== "Public" ? <span className="comparison-missing">See published {row.costKind === "fees" ? "fees" : "tuition"} below</span> : <>
                              <ObservationValue observation={observation} showDefinition={row.label === "Completion / graduation rate"} sourceDetail={sourceDetail} />
                              {row.label.startsWith("Historical average net price") ? <NegativeNetPriceNote value={college.observations.averageNetPrice.value} /> : null}
                            </>}
                          </td>;
                        })}
                      </tr>
                    ))}
                    {selectedMajor ? (
                      <tr>
                        <th scope="row">
                          {selectedMajor}
                          <small>Degree field · share of all awards</small>
                        </th>
                        {selected.map((college) => {
                          const evidence = majorEvidenceFor(
                            college,
                            selectedMajor,
                          );
                          return (
                            <td key={college.unitId}>
                              {evidence ? (
                                <span className="comparison-value">
                                  <strong>
                                    {percentFormatter.format(evidence.share)}
                                  </strong>
                                  <small>
                                    {evidence.periodLabel} · {evidence.evidence}
                                  </small>
                                </span>
                              ) : (
                                <span className="comparison-missing">
                                  Not listed
                                  <small>
                                    No bachelor&apos;s or associate field indicator in this set
                                  </small>
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="comparison-mobile-stack">
                {selected.map((college) => (
                  <article
                    className="comparison-mobile-card"
                    key={college.unitId}
                  >
                    <header>
                      <div>
                        <CollegeLogo college={college} variant="comparison" />
                        <span className="page-evidence-label">
                          {college.city}, {college.state}
                        </span>
                        <h3>
                          <Link href={`/colleges/${college.slug}`}>
                            {compactName(college)}
                          </Link>
                        </h3>
                        <small>{college.ownership} · {college.institutionLevel}</small>
                      </div>
                      <Link
                        className="comparison-remove"
                        href={comparisonHref(
                          selected.filter(
                            (item) => item.unitId !== college.unitId,
                          ),
                          selectedMajor,
                        )}
                        aria-label={`Remove ${compactName(college)} from comparison`}
                      >
                        Remove
                      </Link>
                    </header>
                    <dl>
                      {comparisonRows.filter((row) => !row.publicOnly || college.ownership === "Public").map((row) => {
                        const observation = row.observation(college);
                        const sourceDetail = row.costKind === "fees" && observation
                          ? college.costs.feeBasis === "allowance" ? "Cost-of-attendance fee allowance (budget estimate)" : "Reported required fees"
                          : undefined;
                        return <div key={row.label}>
                          <dt>{comparisonLabel(row, [college])}</dt>
                          <dd>
                            <ObservationValue
                              observation={observation}
                              showDefinition={row.label === "Completion / graduation rate"}
                              sourceDetail={sourceDetail}
                            />
                            {row.label.startsWith("Historical average net price") ? <NegativeNetPriceNote value={college.observations.averageNetPrice.value} /> : null}
                          </dd>
                        </div>;
                      })}
                      {selectedMajor ? (
                        <div>
                          <dt>{selectedMajor} degree field</dt>
                          <dd>
                            {majorEvidenceFor(college, selectedMajor) ? (
                              <span className="comparison-value">
                                <strong>
                                  {percentFormatter.format(
                                    majorEvidenceFor(college, selectedMajor)!
                                      .share,
                                  )}
                                </strong>
                                <small>
                                  {majorEvidenceFor(college, selectedMajor)!
                                    .periodLabel} · {majorEvidenceFor(college, selectedMajor)!.evidence} · share of all awards
                                </small>
                              </span>
                            ) : (
                              <span className="comparison-missing">
                                Not listed
                              </span>
                            )}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <ComparisonNotice>
              Admission rates are institutional snapshots, not odds for an
              individual student. Net price applies to the reported federal
              aid cohort; earnings and graduation measures describe still
              different cohorts.{" "}
              Tuition and fee values are before aid. A fee row may be a required charge or a campus budget allowance; housing, meals, books and other living costs are separate.
              Federal in-district tuition can differ from other in-state rates; verify current charges with each college.
            </ComparisonNotice>

            <div className="comparison-actions">
              <Link
                className="page-primary-action"
                href={explorerContinuationHref(selected, selectedMajor)}
              >
                Add another college
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="page-text-link" href="/methodology">
                How to read this table
              </Link>
              {selected.length === 1 ? (
                <a
                  className="page-text-link"
                  href={selected[0].website}
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit official college site
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
