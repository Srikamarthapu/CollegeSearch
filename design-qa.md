# CollegeSearch refinement design QA

## Final result

passed

## Source visual truth

- User home/header reference: `/var/folders/8w/t8c81jyx39s8szjv3wk71tt00000gn/T/codex-clipboard-05a11718-d3ba-4055-83d5-6ba9c2eaaaea.png` (2382 x 591 pixels; supplied crop density unknown)
- User explore reference: `/var/folders/8w/t8c81jyx39s8szjv3wk71tt00000gn/T/codex-clipboard-eead6e59-d56d-4d54-881f-a08e342fcceb.png` (2489 x 811 pixels; supplied crop density unknown)
- User search-label detail: `/var/folders/8w/t8c81jyx39s8szjv3wk71tt00000gn/T/codex-clipboard-4b89fdec-3e52-47ed-8ecb-78af8b69dd0a.png` (177 x 143 pixels; supplied crop density unknown)
- Normalized implementation-before home: `artifacts/audit/refinement-before/01-home-top.png`
- Normalized implementation-before explore: `artifacts/audit/refinement-before/02-explore-results.png`

The user references identify the problematic regions. The formal before/after comparison uses browser captures from the same route, viewport, state, and density so visual changes are not caused by source-image scaling.

## Implementation evidence

- Desktop home: `artifacts/audit/refinement-after/01-home-top.png`
- Desktop explore: `artifacts/audit/refinement-after/02-explore-results.png`
- Mobile home: `artifacts/audit/refinement-after/03-mobile-home.png`
- Mobile explore: `artifacts/audit/refinement-after/04-mobile-explore.png`
- Refreshed source ledger: `artifacts/audit/refinement-after/05-data-sources-2026.jpg`
- Refreshed desktop explorer: `artifacts/audit/refinement-after/06-explore-data-2026.jpg`
- Refreshed mobile explorer check: `artifacts/audit/refinement-after/07-mobile-explore-data-2026.jpg`
- Home full-view comparison: `artifacts/qa/refinement/home-before-after.png`
- Explore full-view comparison: `artifacts/qa/refinement/explore-before-after.png`
- Focused search-controls comparison: `artifacts/qa/refinement/search-controls-before-after.png`

## Normalization and state

- Desktop CSS viewport: 1368 x 900 at device pixel ratio 1.
- Desktop screenshot: 1353 x 890 pixels after the in-app browser scrollbar and viewport inset.
- Mobile CSS viewport: 390 x 844 at device pixel ratio 1.
- Mobile screenshot: 375 x 834 pixels after the in-app browser scrollbar and viewport inset.
- Home state: signed out, empty search, top of `/`.
- Explore state: signed out, empty search, all filters cleared, `College name: A–Z`, first result visible on `/explore`.

## Comparison history

### Pass 1 — findings

- P1, header and evidence card: the nearly opaque utility header and solid forest evidence ledger formed two dashboard surfaces that visually detached from the atlas-backed page.
- P1, trust hierarchy: the full-width three-cell trust strip repeated the evidence ledger and delayed the college-search task.
- P1, search controls: the fixed `Search this cohort` label column wrapped into three lines and looked like a broken layout.
- P1, filters: the dark filter header and circular dash appeared to be a collapse control even though it was not interactive.
- P2, language: terms such as `cohort`, `evidence ledger`, `admit-rate band`, `complete core data`, and `open evidence record` made the product read like an analyst tool rather than a student tool.

### Fixes applied

- Extended the atlas beneath a lighter translucent header, simplified the brand lockup, softened Sign in, and added a visible active-route state with `aria-current`.
- Rebuilt the evidence ledger as a translucent paper source summary with one consistent year system and direct student-facing labels.
- Reduced the trust strip to one concise source statement and one `How the data works` action inside the page grid.
- Removed the visible search-label column and allowed the search field to span the result area.
- Restyled the filter panel as a quiet supporting surface, removed the false zero-state badge, enlarged radio targets, and removed release metadata unrelated to filtering.
- Rewrote headings, filter labels, sort choices, metrics, compare state, and college-detail links in plain language.

### Pass 2 — post-fix visual evidence

- The home comparison shows the header, source summary, search, and trust statement sharing the same paper/atlas system without a competing dark dashboard.
- The explore comparison shows a clear task order: heading, search, result count/sort, filters, then college cards.
- The focused comparison confirms the wrapped micro-label is gone and the search input now uses the full results width.
- No actionable P0, P1, or P2 issue remains in the compared regions.

### Pass 3 — data-trust refinement

- The source ledger now leads with the official June 2026 College Scorecard
  release date while keeping each metric&apos;s older underlying period visible.
- UC cards use official Fall 2026 campus snapshots; ASU uses the 2025-2026
  Common Data Set and 2026-2027 tuition plus required fees.
- Comparison warnings now name every row whose definition or reporting period
  differs, including enrollment, completion, and tuition—not only admissions.
- Broad-field filters require a federal bachelor&apos;s-program indicator and
  separately describe the displayed percentage as a share of all awards.
- The desktop explorer, source ledger, ASU profile, mixed-source comparison,
  and 390px mobile explorer were rechecked with no horizontal overflow.

## Required fidelity surfaces

- Fonts and typography: the Newsreader/Geist hierarchy is preserved; student-facing labels are clearer, the wrapped 10px search label was removed, and active navigation is visually distinct.
- Spacing and layout rhythm: desktop alignment remains on the 1240px page grid; header height is reduced to 70px; the explore preamble, trust treatment, and control spacing are less repetitive; no horizontal overflow was found.
- Colors and visual tokens: the existing paper, forest, ochre, and oxblood palette is preserved. Heavy forest blocks were replaced with translucent paper and restrained forest accents.
- Image quality and asset fidelity: the atlas texture and institutional logo assets remain unchanged. All visible images loaded at non-zero natural dimensions in the verified states.
- Copy and content: navigation, source summaries, search, filters, sorting, metrics, compare state, and college-detail actions now use direct language while keeping source periods and major-admission limits visible.

## Functional, responsive, and accessibility evidence

- Desktop search for `UCLA` returned one college and the expected autocomplete result.
- The Computing & Information Sciences filter showed only institutions with a
  2024-2025 federal bachelor&apos;s-program indicator and retained the simplified
  whole-college acceptance-rate warning.
- Mobile filter selection returned 27 California colleges and closed with visible count feedback.
- Email sign-in still opens the expected credential-setup state without crashing.
- Desktop and mobile captures showed no horizontal overflow.
- The active Explore navigation item exposes `aria-current="page"` and a visible underline.
- Focus indicators, live result counts, dialog labeling, reduced-motion handling, and pressed states remain in place.
- The verified browser console contained no warnings or errors.

## Residual evidence limits

- Screenshot review does not establish full WCAG compliance. Keyboard order, screen-reader announcements, zoom beyond the captured viewports, and live Supabase provider flows still require dedicated testing.
