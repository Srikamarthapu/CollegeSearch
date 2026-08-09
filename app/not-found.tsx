import { ArrowRight, Compass } from "lucide-react";
import Link from "next/link";

import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="page-shell comparison-page">
        <section className="comparison-empty">
          <Compass size={31} aria-hidden="true" />
          <span className="page-section-index">404</span>
          <h1>That record is not in this edition.</h1>
          <p>
            The page may have moved, or the college is not part of the current
            reviewed cohort.
          </p>
          <Link className="page-primary-action" href="/explore">
            Explore the current cohort
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
