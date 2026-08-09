import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { colleges } from "@/app/lib/college-data";
import { MatchTool } from "./MatchTool";
import type { MatchCollege } from "./scoring";
import styles from "./match.module.css";

export const metadata: Metadata = {
  title: "Preference match · CollegeSearch",
  description:
    "Build an explainable college shortlist from your preferences without confusing fit with admission likelihood.",
};

const matchColleges: MatchCollege[] = colleges.map((college) => ({
  unitId: college.unitId,
  slug: college.slug,
  name: college.name,
  city: college.city,
  state: college.state,
  ownership: college.ownership,
  setting: college.setting,
  majors: college.majors.map((major) => ({
    name: major.name,
    share: major.share,
    periodLabel: major.periodLabel,
  })),
  admitRate: {
    value: college.observations.admitRate.value,
    periodLabel: college.observations.admitRate.periodLabel,
    publisher: college.observations.admitRate.publisher,
  },
  netPrice: {
    value: college.observations.averageNetPrice.value,
    periodLabel: college.observations.averageNetPrice.periodLabel,
    publisher: college.observations.averageNetPrice.publisher,
  },
  graduationRate: {
    value: college.observations.graduationRate.value,
    periodLabel: college.observations.graduationRate.periodLabel,
    publisher: college.observations.graduationRate.publisher,
  },
  medianEarnings: {
    value: college.observations.medianEarnings.value,
    periodLabel: college.observations.medianEarnings.periodLabel,
    publisher: college.observations.medianEarnings.publisher,
  },
  enrollment: {
    value: college.observations.undergraduateEnrollment.value,
    periodLabel: college.observations.undergraduateEnrollment.periodLabel,
    publisher: college.observations.undergraduateEnrollment.publisher,
  },
}));

const majorOptions = [...new Set(colleges.flatMap((college) => college.majors.map((major) => major.name)))].sort();
const stateOptions = [...new Set(colleges.map((college) => college.state))].sort();

export default function MatchPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className={`${styles.page} page-shell`}>
        <nav className="page-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/explore">
            <ArrowLeft size={15} aria-hidden="true" />
            Explore
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Preference match</span>
        </nav>
        <MatchTool
          colleges={matchColleges}
          majorOptions={majorOptions}
          stateOptions={stateOptions}
        />
      </main>
      <SiteFooter />
    </>
  );
}
