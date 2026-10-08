# M11 — tuition clarity and product polish

October 7, 2026. Active checkout: `/Users/kamarthapusri/Projects/CollegeSearch`. Implemented with GPT-5.6-Sol workers and an independent review; release verification is recorded below.

## Finding ledger

1. Discovery cards and profile overview emphasize historical aid-recipient net price, which students can mistake for published annual tuition. Lead with tuition and required fees, explicitly retain period/residency/living-cost boundaries, and move aid-adjusted net price to secondary context. Preserve factual provenance.
2. The landing hero has excess separation between text and photography, while the header pushes navigation away from the brand and hides icons at common laptop widths. Tighten the composition, align usable controls, strengthen navigation, preserve carousel timing/credits and reduced-motion behavior.
3. Admissions leads with an oversized yellow explanatory block and excessive top spacing. Integrate concise context into the heading without suggesting personal admission odds.
4. My colleges mixes saved-college and deadline layouts at different vertical positions. Use accessible Saved colleges / Deadlines tabs; preserve storage, research notes, drafts and deep links.

## Implemented fixes

- Tuition and required fees now lead discovery, profile and saved-card costs. Public-college discovery uses explicitly labeled out-of-state tuition; profiles and comparisons retain the source-specific resident/in-district charge. Cost filters/sort use tuition, while existing `price` URLs still mean historical net price. Reporting years remain visible. Aid-adjusted historical averages remain available in evidence/profile/compare views, with their actual federal aid cohort.
- Stanford's 2026–27 undergraduate tuition is $22,577 per quarter, or $67,731 for three quarters. The recurring required health service fee is $281 per quarter ($843 annually), making the existing sourced tuition-and-required-fees observation $68,574. Housing, meals, books and other living costs are additional. Sources checked: [Stanford tuition rates](https://studentservices.stanford.edu/tuition-rates/2026-2027-undergraduate-tuition-rates), [Stanford announcement](https://news.stanford.edu/stories/2026/02/undergraduate-tuition-rates-2026-2027), [Stanford fees](https://bulletin.stanford.edu/academic-polices/tuition-fees/fees). No catalog amounts or source records were invented or replaced.
- Landing copy and photography share one compact composition. Navigation sits beside the brand with visible blue icons, mobile sign-in no longer wraps, and the carousel retains 3.5-second timing, arrows, attribution and reduced-motion behavior.
- Admissions replaces the large warning block with a concise note and an expandable explanation. Controls and top spacing are tighter. Personal admission probabilities are still not implied by historical institution rates.
- My colleges has keyboard-accessible Saved colleges / Deadlines tabs, hash links and browser history support. Hidden panels remain inert; notebooks and the initialized planner stay mounted to preserve drafts.
- Admissions no longer ships all 3,912 detailed records on initial load. It starts with 12 featured records plus valid selections and searches a bounded 24-result endpoint. Search includes cancellation, stale-response guards, retry/error states, city/state labels and a fix for equivalent queries (such as adding a trailing space) stranding loading state.
- My colleges loads complete compact identities only when deadlines or research backup is opened. It validates completeness before mounting the planner, so an incomplete response cannot prune stored tasks. The deadline chooser renders at most 40 ordinary choices while retaining saved/current selections and supports names, aliases, cities and states.
- Server-rejected comparison IDs are removed without losing newer selections. The “All key metrics reported” filter now requires tuition; previously 47 of 1,731 qualifying records lacked that new headline metric.
- Applied compatible patches to `sharp` 0.35.5 and transitive `source-map-js` 1.2.2. Fresh installation and production dependency audit report zero known vulnerabilities. Full development audit still reports eight entries tracing to the existing `braces` advisory; npm proposes incompatible tooling downgrades, which were not applied. This is an explicit remaining development-tooling issue, not a zero-finding full audit.

## Measurements and verification

Local development responses before/after: Admissions decoded HTML 3,107,579 → 102,883 bytes; compressed 245,834 → 27,952 bytes (88.6% reduction). Initial My colleges decoded HTML 803,997 → 88,179 bytes; its complete identity directory is fetched separately when needed. These are response-size measurements, not claims about real-user load-time percentiles.

Local browser checks: desktop 1440px and phones 390px/320px; no horizontal overflow; tuition/location filtering and reset; featured ordering; Stanford/Berkeley comparison; invalid comparison URL cleanup; save/remove; Admissions UCLA search, selection and whitespace-equivalent query; mobile filter dialog and Escape focus return; tab Home/End keys; notebook and deadline drafts retained through tab changes and reload; bounded deadline chooser; complete identity loading and backup controls. Root-created QA drafts/saves were restored; the pre-existing completed deadline was preserved.

Read-only HTTP checks passed for catalog pagination, combined filters, saved detail lookup, preference matching, malformed/oversized request rejection, and the new `scripts/verify-product-polish.mjs` tuition/Admissions/identity boundaries.

Final local verification: **503/503 tests passed**, including the crawl of all 3,912 college profiles and internal links. Both Vinext and native Next production builds, TypeScript, ESLint and diff checks passed. An obsolete comparison-label assertion was updated to require the precise “required fees” wording; the final full run is clean. Logs are in ignored `work/m11-*-final.log`.

Code commit `e6a7255` is deployed to [CollegeSearch](https://collegesearch-steel.vercel.app/explore) in READY production deployment `dpl_44AyhczDETfnDLXsf51hhiv99m3Y`. The Vercel connector's scope request returned 403; the CLI's existing credentials successfully verified the exact project/team and deployed the clean checkout. The stable alias is attached. Build duration was 1m48s; no catalog publication step ran.

Hosted `verify-product-polish.mjs` and the existing full HTTP smoke passed. Browser checks confirmed the new hero, 1440/1024/390/320px layouts, Admissions search/add and source context, Saved/Deadlines tab switching and lazy load, mobile navigation, and Stanford's $68,574 headline with its year and living-cost exclusion. The fresh live browser tab recorded no console warnings or errors. This is guest-flow validation, not signed-in account certification. Screenshots are in ignored `outputs/m11/` (`landing-desktop.png`, `landing-mobile.png`, `admissions-desktop.png`, `admissions-mobile.png`, `my-colleges-desktop.png`).

## Scope and remaining release gates

The app remains free; no billing, database mutations, account changes or provider activation were included. The existing public AI, hosted email/account journeys, observed scheduled retention and human student-pilot gates from M10 remain open. No production-ready or live-model claim is made by this UI release. Failure/retry branches have unit/code coverage; a browser network-failure simulation was not added in this pass. External parent-lockfile warnings remain informational and do not prevent either build.
