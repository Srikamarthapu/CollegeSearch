# Production-readiness cycle 2 — 2026-08-09

This folder records the before/after browser evidence for the second foundation
pass. Images `01`–`12` are the states reviewed before implementation; images
`13`–`25` are the verified production-build states after implementation.

## Issues found and resolved

- Short aliases and misspellings no longer fan out to unrelated records. `Cal`
  resolves to Berkeley, `Caltech` resolves to Caltech, `stanfrd` resolves to
  Stanford, and field/location phrases tolerate a one-edit typo.
- Saved colleges now have a dedicated, device-local review page with removal
  and two-to-four-college comparison controls.
- The previously missing Fields, Match, Chances, Account, Privacy, and Data
  Health routes now have complete, student-facing foundations.
- Match scores expose their weights, exclude missing evidence, and never use an
  admit rate as a fit signal. Admit-rate context is kept separate and does not
  produce personalized probabilities or reach/target/safety labels.
- A zero-signal Match worksheet now stays unranked instead of presenting ten
  meaningless `0/100` scores. The desktop control rail also scrolls internally
  when it is taller than the viewport, so every weight remains reachable.
- Account prompts now state that saved colleges stay in the current browser and
  are not synced to a signed-in account.
- The mobile navigation now traps keyboard focus while open, wraps in both Tab
  directions, and returns focus to its trigger when dismissed.
- Every explorer-card metric links its publisher and period. College profiles
  expose publisher, cohort, and definition for every metric, including tuition
  and enrollment.
- Comparison add/change links preserve the selected colleges and field.
- Stanford and MIT now use manually reviewed 2025-2026 Common Data Set records for Fall
  2025 admissions/enrollment, their stated completion cohorts, and 2026-2027
  tuition. Federal records remain visible as standardized alternates.
- The primary earnings measure now correctly describes earnings four years
  after completion; distance-only bachelor-field evidence is retained and
  labeled instead of silently discarded.
- The refresh pipeline now limits network bodies, archive expansion, request
  duration, and accepted ZIP entries, then writes each generated evidence file
  atomically.
- The explorer no longer ships the full profile dataset to the browser. The
  largest client chunk fell from 673,349 bytes to 223,724 bytes and the build
  no longer emits a 500 kB chunk warning.
- Unused D1/Drizzle scaffolding and its vulnerable development-only dependency
  chain were removed. A regression test keeps Vinext's unpatched build-time
  image parser away from app image inputs.

## Verification completed

- Production build passed without an oversized-client-chunk warning.
- ESLint, TypeScript (`tsc --noEmit`), and `git diff --check` passed.
- All 24 automated tests passed, covering build-input safety, compact client
  projection, search aliases, decision-tool guardrails, security headers,
  routes, source lineage, UC snapshots, and ASU/Stanford/MIT overlays.
- `npm audit --omit=dev` reports zero production dependency vulnerabilities.
- Every core route returned HTTP 200; the custom unknown route returned the
  intended HTTP 404 page.
- Browser QA covered alias/fuzzy search, local save and review, Fields search
  and detail, Match filters, Chances selection/URL updates, comparison
  continuity, Stanford and UC profiles, account/privacy boundaries, and the
  Data Health ledger.
- At 320 px, Explore, its modal filter workflow, the compact navigation, and a
  UC profile showed no horizontal overflow. Dialog focus moved to the close
  control; mobile-navigation Tab/Shift+Tab wrapping and Escape focus return were
  verified; and the fresh browser console had zero warnings or errors.
- The current official-source audit matched all nine Fall 2026 preliminary UC
  admission snapshots and all 50 federal records to their recorded artifacts.

## Honest release boundaries

- First-party admission records cover 12 colleges: nine UC campuses plus ASU,
  Stanford, and MIT. The remaining 38 admission headlines are exact Fall 2024
  federal baselines from the June 2026 Scorecard artifact, not current-cycle
  college-reported figures.
- Supabase project values, redirect allowlists, Google OAuth, email delivery,
  password policy, CAPTCHA/rate limits, and live end-to-end auth still require
  provider configuration and verification.
- A public launch also needs the operator contact, effective date, retention
  schedule, and deployment-specific provider list identified on the Privacy page.
- Saved-list sync, academic profiles, applicant-specific modeling, and account
  deletion are deliberately not active in this foundation.
- Vinext currently depends on `image-size@2.0.2`, whose HEIF/ICNS/JXL parsers
  have no patched release. It is build-only and not remotely reachable in this
  app; the regression guard forbids the relevant app build inputs until an
  upstream patch is available.
