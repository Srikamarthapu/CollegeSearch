# CollegeSearch functional audit — September 2026 redesign

Read-only audit of the existing source and focused regression contracts. Findings describe the source at the beginning of this redesign; implementation may subsequently change. No hosted services were tested or modified.

## Existing strengths to retain

- Search supports canonical aliases, one-edit misspellings, broad-field synonyms, and combined field/location intent (`app/lib/college-search.ts`, `tests/college-search.test.ts`).
- Explorer filters correctly exclude missing observations when a numeric threshold is active, and enrollment bands have non-overlapping boundaries (`app/lib/explorer-filters.ts`).
- Broad-field availability remains separate from an exact major and college-wide admissions. Comparison cells carry period and source rather than implying equivalent cohorts.
- Preference scoring stays neutral until the student activates an actual criterion, excludes absent evidence from its denominator, and never uses admit rate as a fit signal (`app/match/scoring.ts`).
- Local and account saves have explicit scope and availability states. Unavailable account data must never appear as an empty shelf or zero saved-only search results. Saved comparison selections cannot cross account scopes.
- Mobile navigation contains focus, makes background surfaces inert, locks body scroll, handles Escape, and restores focus. Keep those behaviors through visual changes.

## Prioritized implementation opportunities

### 1. Preserve the student's work across exploration (high value)

`app/match/MatchTool.tsx:141` initializes preferences and active criteria exclusively with React state. There is no URL or storage restore, share control, or reset control. Reloading the preference worksheet loses the work, and the profile links offer no explicit return context. Add validated, versioned URL state for preferences and active criteria, a share/copy-link action, and a clear reset action. Prefer shareable non-sensitive preferences over inventing applicant profiling. Unknown query values must resolve to neutral defaults. Untouched suggested weights must remain inactive after restore.

`app/CollegeCompassApp.tsx:1029` writes `history.replaceState(null, ...)`, replaces all query parameters, and omits the current hash. Preserve `window.history.state` and `location.hash`; use one validated parser/serializer for mount and `popstate` restoration. Current hydration only runs on mount/dependency changes. Do not let a back/forward URL and displayed filters disagree.

### 2. Give saved colleges a useful next action (high value)

`app/saved/SavedColleges.tsx` currently saves college IDs and offers remove/compare, but cannot keep the student's research questions, visit impressions, or application-research progress. A small explicitly browser-local research notebook and per-college checklist would turn the shelf into working research. Clearly distinguish user-entered notes from verified college evidence; if stored locally, say so and never imply account synchronization. Useful checklist items are verify exact program, run the official net-price calculator, inspect current admissions policy, and plan a visit. Do not invent deadlines or program details.

### 3. Use the profile as a research guide (high value)

`app/colleges/[slug]/page.tsx` has strong metric provenance and save/compare/official-site actions, but no compact anchored navigation, student-oriented overview, or place for questions. The page asks readers to process long sequential evidence sections. Add section jumps for admissions, costs/outcomes, fields, and personal research; place the few key facts first and keep exact definitions in progressive disclosure. The official-site link is already verified by dataset; do not guess deeper admissions, aid, visit, or catalog URLs.

### 4. Fix inconsistent explorer controls (small reliable improvements)

- `app/CollegeCompassApp.tsx:133`: clearing `major` leaves `sort === "major"`; the select option is conditionally removed around line 1570 while the sorter silently falls through to college name around line 1076. Reset to `name` whenever no major is active, including query hydration. Rename the option to its actual measure, e.g. `Field award share: highest first`, because current `Field match: strongest first` could imply educational quality or personal fit.
- `app/CollegeCompassApp.tsx:1703`: load-more text always promises 12, including the last batch when fewer remain. Display `Math.min(12, results.length - state.visibleCount)` and keep result summary/loaded count clear.
- `app/CollegeCompassApp.tsx:1230`: applied admission-band chip says only `Acceptance-rate range`; show the actual selected percentage range so students can understand and remove the constraint without reopening filters.
- `app/CollegeCompassApp.tsx:779`: autocomplete active descendant is based only on index. Gate it on `open` and `activeIndex < items.length` to prevent stale IDs after closing a list or changing results. Guard keyboard selection with `items[activeIndex]`.

### 5. Lead with the student's task and reduce repetitive disclaimer blocks

The home page, profile, match, and admit-context screens repeatedly lead with evidence-process language and what the product cannot do. Keep every material limitation, but move detailed method descriptions into clearly labeled disclosure or source panels. Lead with finding a place, investigating cost, keeping a shortlist, and comparing tradeoffs. The admit-rate page can present selection and useful context sooner while maintaining visible `college-wide historical rate, not a personal probability` wording.

`app/match/MatchTool.tsx:103` labels every result under 65 as `Some preference alignment`, including score 0. Give zero explicit `No measured alignment` wording if zero-score results remain visible. `app/match/MatchTool.tsx:458` tells an empty required-field result only to change ownership; the recovery message should reflect both hard filters.

### 6. Make comparison easier to share and revisit

`app/compare/page.tsx` preserves selection when adding colleges and provides a valuable per-cell source table, but offers no explicit copy link or print/export action. A copy-link control is low effort because selected college IDs and broad field are already encoded in the URL. A carefully styled print view can support conversations with a parent or school counselor without claiming a machine-generated recommendation.

## Verification completed

Executed the following focused command successfully, 23 tests passed, 0 failed:

```sh
node --test tests/explorer-filters.test.ts tests/college-search.test.ts tests/decision-tools.test.mjs tests/chances-college-selector.test.ts tests/saved-comparison-selection.test.ts
```

No production build was launched by this audit agent. Source review is not a substitute for the root agent's browser verification after redesign.

## Existing contracts to protect in final verification

- `tests/final-trust-state-contracts.test.mjs`: saved-only unavailable states, named repeated buttons, safe auth failure presentation.
- `tests/mobile-navigation-contract.test.mjs`: modal behavior, focus restoration, inert cleanup.
- `tests/decision-tools.test.mjs`: zero/untouched weights neutral, missing evidence excluded, hard ownership/required-field behavior, historical bands descriptive only, sticky rail reachable.
- `tests/explorer-filters.test.ts` and `tests/college-search.test.ts`: actual evidence thresholds, spelling/alias/location intent.
- `tests/readability-contract.test.mjs`: supporting text never below 11 px; design should aim larger than that floor.
- `tests/route-integrity.test.mjs`: every 50 profile and 12 field route plus linked app routes resolve from the built server.

## Data boundaries

Do not relabel a bachelor-field indicator as a current exact-major catalog, a share of all awards as the share of bachelor students, historical average net price as an individual aid offer, or an overall admit rate as an applicant probability. Keep cohort, definition, reporting period, suppression, unavailable, and preliminary/final states visible at the appropriate depth. The historical memory entry was used only to locate these priorities; current claims above were verified against source/tests.
