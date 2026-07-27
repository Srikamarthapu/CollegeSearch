import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink, Scale } from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import {
  collegesByUnitIds,
  compactName,
  formatObservation,
  majorEvidenceFor,
  percentFormatter,
  type College,
  type Observation,
} from "@/app/lib/college-data";

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
};

const comparisonRows: ComparisonRow[] = [
  {
    label: "Headline admit rate",
    observation: (college) => college.observations.admitRate,
  },
  {
    label: "Applicants",
    observation: (college) => college.observations.applicants,
  },
  {
    label: "Admitted",
    observation: (college) => college.observations.admits,
  },
  {
    label: "Enrolled",
    observation: (college) => college.observations.enrollees,
  },
  {
    label: "Undergraduate enrollment",
    observation: (college) => college.observations.undergraduateEnrollment,
  },
  {
    label: "Average net price",
    observation: (college) => college.observations.averageNetPrice,
  },
  {
    label: "Graduation rate",
    observation: (college) => college.observations.graduationRate,
  },
  {
    label: "Median earnings",
    observation: (college) => college.observations.medianEarnings,
  },
  {
    label: "In-state tuition",
    observation: (college) => college.observations.tuitionInState,
  },
  {
    label: "Out-of-state tuition",
    observation: (college) => college.observations.tuitionOutOfState,
  },
];

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

function ObservationValue({
  observation,
}: {
  observation: Observation | null;
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
      <small>
        {observation.reportingYear} · {observation.publisher}
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
  const selectedMajor = first(query.major)?.trim() || undefined;
  const hasMixedAdmissionEvidence =
    new Set(
      selected.map(
        (college) =>
          `${college.observations.admitRate.publisher}:${college.observations.admitRate.reportingYear}`,
      ),
    ).size > 1;

  return (
    <>
      <SiteHeader />
      <main className="page-shell comparison-page">
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
              Evidence table
            </span>
            <h1>Compare the record, not a ranking.</h1>
            <p>
              Place up to four colleges side by side. Every cell carries its
              own reporting year and publisher so unlike cohorts stay visible.
            </p>
          </div>
          <Link className="page-secondary-action" href="/explore">
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

            {hasMixedAdmissionEvidence ? (
              <ComparisonNotice>
                Headline admissions values in this table come from different
                publishers or years. UC campuses use official Fall 2025 UC
                counts; other colleges use 2024 federal institution data. Read
                the source line beneath each rate.
              </ComparisonNotice>
            ) : null}

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
                          <Link href={`/colleges/${college.slug}`}>
                            {compactName(college)}
                          </Link>
                          <small>
                            {college.city}, {college.state}
                          </small>
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
                    {comparisonRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        {selected.map((college) => (
                          <td key={college.unitId}>
                            <ObservationValue
                              observation={row.observation(college)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {selectedMajor ? (
                      <tr>
                        <th scope="row">
                          {selectedMajor}
                          <small>Share of recent degree completions</small>
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
                                  <small>{evidence.evidence}</small>
                                </span>
                              ) : (
                                <span className="comparison-missing">
                                  Not listed
                                  <small>
                                    No completion share in this evidence set
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
                        <span className="page-evidence-label">
                          {college.city}, {college.state}
                        </span>
                        <h3>
                          <Link href={`/colleges/${college.slug}`}>
                            {compactName(college)}
                          </Link>
                        </h3>
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
                      {comparisonRows.map((row) => (
                        <div key={row.label}>
                          <dt>{row.label}</dt>
                          <dd>
                            <ObservationValue
                              observation={row.observation(college)}
                            />
                          </dd>
                        </div>
                      ))}
                      {selectedMajor ? (
                        <div>
                          <dt>{selectedMajor} degree share</dt>
                          <dd>
                            {majorEvidenceFor(college, selectedMajor) ? (
                              <span className="comparison-value">
                                <strong>
                                  {percentFormatter.format(
                                    majorEvidenceFor(college, selectedMajor)!
                                      .share,
                                  )}
                                </strong>
                                <small>Recent degree completions</small>
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
              different cohorts.
            </ComparisonNotice>

            <div className="comparison-actions">
              <Link className="page-primary-action" href="/explore">
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
