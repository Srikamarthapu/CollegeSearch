import { Compass, ExternalLink } from "lucide-react";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand-block">
        <Link className="brand footer-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <Compass size={18} strokeWidth={1.8} />
          </span>
          <span className="brand-wordmark">
            College Compass
            <small>Evidence edition</small>
          </span>
        </Link>
        <p>
          Official evidence for the college list only you can build.
        </p>
      </div>
      <div className="footer-links">
        <Link href="/explore">Explore colleges</Link>
        <Link href="/methodology">Methodology</Link>
        <Link href="/data-sources">Data sources</Link>
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
        programs and policies with each institution.
      </p>
    </footer>
  );
}
