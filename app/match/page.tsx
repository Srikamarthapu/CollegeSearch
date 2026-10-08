import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FitNavigation } from "@/app/components/FitNavigation";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { directoryFacets } from "@/app/lib/college-directory";
import { MatchTool } from "./MatchTool";
import styles from "./match.module.css";

export const metadata: Metadata = {
  title: "Preference match · CollegeSearch",
  description:
    "Build an explainable college shortlist from your preferences without confusing fit with admission likelihood.",
};

const { majorOptions, states: stateOptions, ownerships: ownershipOptions } = directoryFacets();

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
        <FitNavigation active="preferences" />
        <MatchTool
          majorOptions={majorOptions}
          stateOptions={stateOptions}
          ownershipOptions={ownershipOptions}
        />
      </main>
      <SiteFooter />
    </>
  );
}
