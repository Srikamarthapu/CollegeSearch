import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SiteFooter } from "@/app/components/SiteFooter";
import { DeadlinePlanner } from "@/app/components/DeadlinePlanner";
import { collegeActions } from "@/app/lib/college-actions";
import { colleges } from "@/app/lib/college-data";

export const metadata: Metadata = {
  title: "My deadlines | CollegeSearch",
  description: "Keep your college application, aid, recommendation, and visit dates together with the sources you checked.",
};
export default function PlanPage() {
  const options = colleges.map(({ unitId, name }) => {
    const actions = collegeActions(unitId);
    return {
      unitId, name,
      deadlineSourceUrl: actions?.deadlines.status === "verified" ? actions.deadlines.url : undefined,
      admissionsSourceUrl: actions?.admissions.status === "verified" ? actions.admissions.url : undefined,
    };
  });
  return <>
    <SiteHeader />
    <main id="main-content" className="page-shell plan-page">
      <nav className="page-breadcrumbs" aria-label="Breadcrumb"><Link href="/">CollegeSearch</Link><span aria-hidden="true">/</span><span aria-current="page">My deadlines</span></nav>
      <header className="plan-intro"><span className="page-eyebrow">A little planning, more room to breathe</span><h1>Make space for your next step.</h1><p>Keep application dates, financial aid, recommendations, and campus visits in one place. Choose a college to open its official resources, then record the date for your own application cycle.</p><Link href="/saved">Back to my shortlist →</Link></header>
      <DeadlinePlanner colleges={options} />
    </main>
    <SiteFooter />
  </>;
}
