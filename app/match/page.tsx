import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { colleges } from "@/app/lib/college-data";
import { MatchTool } from "./MatchTool";
import type { MatchCollege } from "./scoring";
import { toMatchCollege } from "./college-record";
import styles from "./match.module.css";

export const metadata: Metadata = {
  title: "Preference match · CollegeSearch",
  description:
    "Build an explainable college shortlist from your preferences without confusing fit with admission likelihood.",
};

const matchColleges: MatchCollege[] = colleges.map(toMatchCollege);

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
