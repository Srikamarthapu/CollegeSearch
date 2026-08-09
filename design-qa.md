# CollegeSearch design QA

## Comparison target

- Source visual truth:
  - `artifacts/audit/production-readiness-2026-08-09/07-mobile-explore.png`
  - `artifacts/audit/production-readiness-2026-08-09/06-mobile-compare.png`
- Rendered implementation:
  - `artifacts/audit/production-readiness-2026-08-09/12-mobile-explore-after.png`
  - `artifacts/audit/production-readiness-2026-08-09/13-mobile-compare-after.png`
- State: signed-out production build, default Explore results, and ASU/Caltech comparison.
- Browser viewport: 390 × 844 CSS px. The in-app browser content capture is 375 × 812 px at device scale factor 1 because browser insets are excluded.
- Density normalization: source and implementation captures are both 375 × 812 px, so no resampling was needed.

## Full-view comparison evidence

The Explore and Compare before/after captures were inspected together at the same mobile viewport. The implementation preserves the editorial paper texture, forest/ochre palette, serif display hierarchy, logo treatment, borders, icons, and compact evidence labels. The intentional change is vertical density: search and the first result now appear in the Explore viewport, while comparison evidence begins in the initial Compare viewport.

Focused crops were not required because the relevant search, masthead, notice, and first-card details are legible at 1:1 in the full-view captures. The account fallback was separately inspected in `artifacts/audit/production-readiness-2026-08-09/14-auth-after.png`.

## Required fidelity surfaces

- Fonts and typography: Newsreader-style display hierarchy, compact sans-serif interface text, weights, wrapping, and line height remain consistent with the source.
- Spacing and layout rhythm: mobile mastheads and notices are tighter without crowding; search, filters, result count, and first evidence cards now form a clear sequence.
- Colors and visual tokens: paper, forest, burgundy, ochre, borders, and subdued evidence states remain consistent.
- Image quality and assets: existing official college logos remain sharp and correctly contained; no placeholder or code-drawn assets were introduced.
- Copy and content: data caveats are shorter and clearer, UC Fall 2026 is identified as preliminary, and the account fallback no longer exposes setup variable names.

## Comparison history

- Earlier P1 — mobile Explore buried the search below a large duplicate introduction. Fixed by compacting the masthead and trust strip and removing the duplicate mobile section intro. Post-fix evidence: `12-mobile-explore-after.png`.
- Earlier P1 — mobile Compare showed no institution evidence in the first viewport. Fixed by compacting the masthead and mixed-period notice. Post-fix evidence: `13-mobile-compare-after.png`.
- Earlier P2 — the unconfigured account dialog exposed developer environment-variable instructions. Fixed with a student-facing local-preview message. Post-fix evidence: `14-auth-after.png`.
- Earlier P2 — free-text search provided no visible action and Enter did not advance the flow. Fixed with a live match action plus scroll and focus transfer to the result summary; browser verification reached 26 matches and focused `results-summary`.

## Findings

No actionable P0, P1, or P2 visual differences remain for the scoped changes. The production build has one large client chunk warning; it is a performance follow-up rather than a visible fidelity defect.

## Implementation checklist

- [x] Mobile search visible in the initial Explore viewport.
- [x] Comparison evidence visible in the initial Compare viewport.
- [x] Keyboard search submission and focus transfer work.
- [x] Skip link and one main landmark are present.
- [x] Account fallback is student-facing.
- [x] Desktop and mobile layouts have no horizontal overflow.

final result: passed
