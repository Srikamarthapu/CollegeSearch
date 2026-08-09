import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FileCheck2,
  Landmark,
} from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import {
  collegeBySlug,
  colleges,
  compactName,
  formatObservation,
  isUniversityOfCalifornia,
  observationSourceKind,
  percentFormatter,
  selectivityLabel,
  type Observation,
} from "@/app/lib/college-data";

type ProfilePageProps = {
  params: Promise<{ slug: string }>;
};

type MetricDefinition = {
  label: string;
  observation: Observation | null;
};

function MetricRecord({ label, observation }: MetricDefinition) {
  return (
    <div className="profile-metric-record">
      <dt>{label}</dt>
      <dd>
        <strong>
          {observation ? formatObservation(observation) : "Not reported"}
        </strong>
        {observation ? (
          <span>
            {observation.periodLabel} · {observation.finality}
          </span>
        ) : (
          <span>No comparable value in this release</span>
        )}
      </dd>
    </div>
  );
}

function EvidenceNote({
  observation,
  label,
  definition,
}: {
  observation: Observation;
  label: string;
  definition?: string;
}) {
  return (
    <article className="profile-evidence-note">
      <div className="profile-evidence-heading">
        <span>{label}</span>
        <strong>{formatObservation(observation)}</strong>
      </div>
      <p>{definition ?? observation.definition}</p>
      <dl>
        <div>
          <dt>Period</dt>
          <dd>{observation.periodLabel}</dd>
        </div>
        <div>
          <dt>Finality</dt>
          <dd>{observation.finality}</dd>
        </div>
        <div>
          <dt>Cohort</dt>
          <dd>{observation.cohort}</dd>
        </div>
        <div>
          <dt>Field</dt>
          <dd>
            <code>{observation.sourceField}</code>
          </dd>
        </div>
        <div>
          <dt>Publisher</dt>
          <dd>
            <a
              href={observation.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {observation.publisher}
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function generateStaticParams() {
  return colleges.map((college) => ({ slug: college.slug }));
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const college = collegeBySlug(slug);

  if (!college) {
    return { title: "College not found · CollegeSearch" };
  }

  return {
    title: `${compactName(college)} evidence profile · CollegeSearch`,
    description: `Admissions, cost, completion, and degree evidence for ${college.name}, with reporting periods and source lineage.`,
  };
}

export default async function CollegeProfilePage({
  params,
}: ProfilePageProps) {
  const { slug } = await params;
  const college = collegeBySlug(slug);

  if (!college) notFound();

  const isUc = isUniversityOfCalifornia(college);
  const admissions = college.observations.admitRate;
  const federalAlternate = college.alternateObservations.admitRate;
  const admissionSource = observationSourceKind(admissions);
  const hasOfficialAdmission = !admissionSource.isFederal;
  const undergraduateEnrollment = college.observations.undergraduateEnrollment;
  const averageNetPrice = college.observations.averageNetPrice;
  const graduationRate = college.observations.graduationRate;
  const enrollmentIsFederal =
    observationSourceKind(undergraduateEnrollment).isFederal;
  const netPriceIsFederal = observationSourceKind(averageNetPrice).isFederal;
  const graduationIsFederal = observationSourceKind(graduationRate).isFederal;
  const admissionMetrics: MetricDefinition[] = [
    { label: "Admit rate", observation: admissions },
    { label: "Applicants", observation: college.observations.applicants },
    { label: "Admitted", observation: college.observations.admits },
    { label: "Enrolled", observation: college.observations.enrollees },
    { label: "Yield", observation: college.observations.yieldRate },
  ];
  const outcomeMetrics: MetricDefinition[] = [
    {
      label: enrollmentIsFederal
        ? "Certificate/degree-seeking undergraduates"
        : "Undergraduate enrollment",
      observation: undergraduateEnrollment,
    },
    {
      label: "Average net price",
      observation: averageNetPrice,
    },
    {
      label: graduationIsFederal ? "150% completion rate" : "Graduation rate",
      observation: graduationRate,
    },
    {
      label: "Median earnings",
      observation: college.observations.medianEarnings,
    },
    {
      label: "In-state tuition",
      observation: college.observations.tuitionInState,
    },
    {
      label: "Out-of-state tuition",
      observation: college.observations.tuitionOutOfState,
    },
  ];
  const orderedMajors = [...college.majors].sort(
    (left, right) => right.share - left.share,
  );

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="page-shell profile-page">
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/explore">
            <ArrowLeft size={15} aria-hidden="true" />
            Explore
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{compactName(college)}</span>
        </nav>

        <header className="profile-masthead">
          <div className="profile-masthead-copy">
            <CollegeLogo college={college} variant="profile" />
            <span className="page-eyebrow">
              <Landmark size={15} aria-hidden="true" />
              {college.ownership} · {college.setting}
            </span>
            <h1>{college.name}</h1>
            <p className="profile-location">
              {college.city}, {college.state} · UNITID {college.unitId}
            </p>
            <p className="profile-deck">
              Current official records where available, plus clearly dated
              federal context. Every value keeps its own reporting period.
            </p>
          </div>

          <div className="profile-masthead-actions">
            <Link
              className="page-primary-action"
              href={`/compare?colleges=${college.unitId}`}
            >
              Start a comparison
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a
              className="page-secondary-action"
              href={college.website}
              target="_blank"
              rel="noreferrer"
            >
              Official college site
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        </header>

        <aside className="profile-source-banner" aria-label="Primary source">
          <FileCheck2 size={20} aria-hidden="true" />
          <div>
            <strong>
              {isUc
                ? "Official UC admissions record"
                : hasOfficialAdmission
                  ? "Official college record"
                  : "Historical federal record"}
            </strong>
            <p>
              Headline admit rate: {admissions.periodLabel}{" "}
              {admissions.publisher}. Accessed {admissions.accessedOn}.
            </p>
          </div>
          <a href={admissions.sourceUrl} target="_blank" rel="noreferrer">
            Inspect source
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </aside>

        <section
          className="profile-section profile-admissions-section"
          aria-labelledby="admissions-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">01</span>
              <h2 id="admissions-heading">Freshman admissions evidence</h2>
            </div>
            <p>
              {selectivityLabel(admissions.value)} is a descriptive band, not
              a prediction of any student&apos;s outcome.
            </p>
          </div>

          <dl className="profile-metric-grid">
            {admissionMetrics.map((metric) => (
              <MetricRecord key={metric.label} {...metric} />
            ))}
          </dl>

          <EvidenceNote observation={admissions} label="Headline admit rate" />

          {hasOfficialAdmission && federalAlternate ? (
            <aside className="profile-source-comparison">
              <div className="profile-source-comparison-intro">
                <span className="page-evidence-label">Why two rates appear</span>
                <h3>
                  {isUc
                    ? "Official UC and federal values are not interchangeable."
                    : "Official college and federal values are not interchangeable."}
                </h3>
                <p>
                  CollegeSearch leads with the newer official record from{" "}
                  {admissions.publisher}. The federal rate remains visible as an
                  alternate observation because its cohort and reporting period
                  differ.
                </p>
              </div>
              <dl>
                <div>
                  <dt>{isUc ? "Official UC record" : "Official college record"}</dt>
                  <dd>
                    <strong>{formatObservation(admissions)}</strong>
                    <span>
                      {admissions.periodLabel} · {admissions.cohort}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Federal alternate</dt>
                  <dd>
                    <strong>{formatObservation(federalAlternate)}</strong>
                    <span>
                      {federalAlternate.periodLabel} ·{" "}
                      {federalAlternate.cohort}
                    </span>
                  </dd>
                </div>
              </dl>
            </aside>
          ) : null}
        </section>

        <section
          className="profile-section"
          aria-labelledby="outcomes-heading"
        >
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">02</span>
              <h2 id="outcomes-heading">Cost and outcome context</h2>
            </div>
            <p>
              Enrollment definitions vary: the federal baseline counts
              certificate/degree-seeking undergraduates, while official
              overlays may report total undergraduates. Current tuition is not
              the same measure as historical net price.
            </p>
          </div>
          <dl className="profile-metric-grid profile-outcome-grid">
            {outcomeMetrics.map((metric) => (
              <MetricRecord key={metric.label} {...metric} />
            ))}
          </dl>
          <div className="profile-evidence-notes">
            <EvidenceNote
              observation={averageNetPrice}
              label="Average net price"
              definition={
                netPriceIsFederal && college.ownership === "Public"
                  ? "For public colleges, this federal measure is the average annual price after grants and scholarships for first-time, full-time, degree/certificate-seeking undergraduates who pay in-state tuition and receive Title IV aid. It is not a personalized aid estimate."
                  : undefined
              }
            />
            <EvidenceNote
              observation={graduationRate}
              label={
                graduationIsFederal
                  ? "150% completion rate"
                  : "Graduation rate"
              }
              definition={
                graduationIsFederal
                  ? "Completion of a degree or certificate at a four-year institution within 150% of normal time for the reported first-time, full-time degree/certificate-seeking cohort."
                  : undefined
              }
            />
            <EvidenceNote
              observation={college.observations.medianEarnings}
              label="Median earnings"
            />
          </div>
        </section>

        <section className="profile-section" aria-labelledby="majors-heading">
          <div className="page-section-heading">
            <div>
              <span className="page-section-index">03</span>
              <h2 id="majors-heading">Broad bachelor&apos;s fields</h2>
            </div>
            <p>
              Each field has a federal bachelor&apos;s-program indicator for
              2024-2025. The percentage still covers all awards in that broad
              category, so verify the exact major and campus before applying.
            </p>
          </div>
          <ol className="profile-major-list">
            {orderedMajors.map((major) => (
              <li key={major.name}>
                <div className="profile-major-label">
                  <span>{major.name}</span>
                  <strong>{percentFormatter.format(major.share)}</strong>
                </div>
                <progress
                  max={1}
                  value={major.share}
                  aria-label={`${major.name}: ${percentFormatter.format(major.share)} of reported awards`}
                />
                <small>
                  {major.periodLabel} · {major.evidence}
                </small>
              </li>
            ))}
          </ol>
        </section>

        <aside className="page-next-step">
          <span className="page-evidence-label">Use the evidence carefully</span>
          <h2>Build a balanced list, then verify the current program.</h2>
          <p>
            Reporting years vary by metric, and institutional averages do not
            capture individual aid offers or program-level selection.
          </p>
          <div>
            <Link className="page-primary-action" href="/explore">
              Return to explorer
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="page-text-link" href="/methodology">
              Read the methodology
            </Link>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
