# Production-readiness audit — 2026-08-09

## Issues found and resolved

- Free-text search accepted a phrase but Enter did not visibly advance to results. It now shows a live match action, scrolls to results, and moves keyboard focus to the result summary.
- The mobile Explore introduction pushed search below the first viewport. Search, filters, the result count, and the first college are now visible much sooner.
- Mobile Compare spent the first viewport on explanation. The masthead and mixed-period notice are compact, and institution evidence now begins in the first viewport.
- Header and footer were nested inside the main landmark. The page now has a single main content landmark and a keyboard-visible skip link.
- The unconfigured account dialog exposed environment-variable names. It now explains the preview limitation in student language.
- UC Fall 2026 values were numerically current but not plainly labeled preliminary. Source metadata and student-facing copy now state that the figures are preliminary as of June 2026 and may change.
- The older ten-years-after-entry earnings measure was used as the headline. The current Scorecard four-years-after-completion measure is now primary; the historical field remains an alternate.
- Scorecard publication status and underlying IPEDS revision status were conflated. The published artifact and provisional 2024–25 fields now have separate status metadata.
- Production response headers now prevent framing, MIME sniffing, unnecessary browser permissions, and excessive referrer disclosure.
- Published production dependency advisories were resolved; `npm audit --omit=dev` reports zero vulnerabilities.

## Verification completed

- Refreshed UC Accountability, live UC campus snapshots, and College Scorecard data through the repository import pipeline.
- Verified the 50-college invariant, all nine undergraduate UC campuses, source registration, 2026 UC caveats, ASU official-source metadata, and the current earnings field.
- Full production build passed.
- ESLint passed.
- All seven rendered/runtime tests passed.
- `/`, `/explore`, `/data-sources`, `/methodology`, the comparison route, and a UC profile returned HTTP 200 from the production server.
- Browser-tested desktop search, mobile Explore, mobile Compare, account fallback, landmarks, console output, and horizontal overflow.
- Repository security scan found no source-backed reportable vulnerability in the reviewed baseline.

## Explicit launch boundaries

- Live Supabase credentials, Google OAuth, redirect allowlists, email delivery, password policy, throttling, and secure-password-change settings still require dashboard configuration and an end-to-end test.
- The ASU source has a verified official URL and SHA-256, but automatic newest-PDF discovery remains a follow-up.
- Six advisories remain in build-only tooling: Vinext's pinned image parser and Drizzle Kit's legacy development bundler chain. They are absent from the production dependency audit; upgrading them safely requires upstream or framework migration work.
