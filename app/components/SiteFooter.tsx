import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "./BrandMark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand-block">
        <Link className="brand footer-brand" href="/">
          <BrandMark />
          <span className="brand-wordmark">
            CollegeSearch
            <small>Your college field guide.</small>
          </span>
        </Link>
        <p>
          Explore your options. Make a list. Take the next step.
        </p>
      </div>
      <div className="footer-links">
        <Link href="/explore">Explore colleges</Link>
        <Link href="/majors">Explore fields</Link>
        <Link href="/match">Build a match list</Link>
        <Link href="/chances">Read admit-rate context</Link>
        <Link href="/saved">Saved colleges</Link>
        <Link href="/plan">My deadlines</Link>
        <Link href="/account">Account settings</Link>
        <Link href="/methodology">Methodology</Link>
        <Link href="/data-sources">Data sources</Link>
        <Link href="/data-health">Data health</Link>
        <Link href="/privacy">Privacy</Link>
        <a
          href="https://collegescorecard.ed.gov/data/"
          target="_blank"
          rel="noreferrer"
        >
          College Scorecard
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
      <p className="footer-disclaimer">
        Admissions context is educational, never a guarantee. Verify current
        programs and policies with each institution. College marks identify
        schools and do not imply university endorsement.
      </p>
    </footer>
  );
}
