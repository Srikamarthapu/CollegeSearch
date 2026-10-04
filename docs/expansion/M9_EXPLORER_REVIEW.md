# M9 — explorer filters and adviser visibility

October 4, 2026. Local implementation and verification complete; deployment pending.

## Findings and fixes

1. **Filter overload.** Replaced the permanent filter sidebar and overlapping preset controls with three common choices (field, location, annual net price), removable applied-filter chips, and one grouped drawer. Optional admissions/outcomes criteria are collapsed until needed. The drawer keeps its reset/results footer outside its scrolling body.
2. **Unhelpful default order.** Featured browsing now starts with UC Berkeley, UCLA and Stanford, followed by 27 familiar starting points and the rest of the collection. This is an editorial order, not a measured popularity or quality ranking. Search relevance and explicit alternate sorts remain available. Explicit alphabetical URLs now serialize `sort=name` so they survive reload.
3. **Pagination stuck after a filter change.** Loading state now belongs to the request/filter key, and late responses cannot append to a newer search. A controlled 3.5-second response delay verified a location change while loading more, followed by 48 unique Texas results from the new search.
4. **Stale results after a failed filter request.** A failed first-page request now hides the previous count, cards and load-more button, with a Retry search action. An injected HTTP 503 verified zero stale cards/append controls; retry returned the nine Alaska colleges correctly. A failed load-more request still preserves the matching first page.
5. **Ambiguous acceptance-rate ranges.** Labels now say “Over 10% to 25%,” matching the numeric boundary that includes 10.5% and 10.8%. Enrollment band logic is shared and invalid bands fail closed.
6. **Hidden adviser entry.** Added a desktop research rail and a visible mobile adviser link. The unavailable state says “In preparation,” routes the primary action to working preference matching, and retains a secondary adviser status/history link. Only a server-computed availability boolean crosses to the client.
7. **Responsive regressions found during review.** The research rail remains visible at 1024 px. Corrected inherited CSS that hid the mobile adviser link and moved card bookmarks beneath the school name on tablets.

## Verification

- Full test suite: 465 passed, zero failed/skipped; Vinext build passed. After the final error-state repair, native Next production build, TypeScript and ESLint passed again.
- Browser checks: combined engineering/California/net-price filters (114 results), grouped-filter synchronization, reset, 10–25% UC filter (Berkeley/UCLA), explicit alphabetical reload, Featured restoration, delayed pagination, injected failure/retry, and keyboard Escape/focus return.
- Design review: desktop 1440 px, laptop 1024 px, mobile 390 px and 320 px; no horizontal overflow at checked widths. Drawer controls/footer stayed usable. No blocking accessibility finding remained in the focused review. Expected injected 503 was isolated to the local QA proxy.
- Logs are under ignored `work/m9-*`; screenshots are under `outputs/m9-explorer/`. The local proxy never calls the model or modifies the database.

## Where the 3,912 records came from

The base source is the U.S. Department of Education's [College Scorecard institution release](https://collegescorecard.ed.gov/data/), June 10, 2026. The pinned archive SHA-256 is `f56a181b000ca4914e924c16b6b81dcc656e25aeb2ac68ab7d271ac0f29ffd58`. The selected roster includes 2,486 four-year and 1,426 two-year institutions; 482 are separate branch UNITIDs. It is not a claim of 3,912 bachelor's universities or every U.S. postsecondary institution.

The independent source-value audit was rerun for M9: 3,912 identities, 31,296 direct observation values (including 4,681 unavailable values), 47,175 broad-field records and 3,890 federal completion cohorts matched, with zero errors. The 208 non-Scorecard observations are separately sourced reviewed overlays and were excluded from that federal comparison. Reproduce with `node scripts/audit-catalog-federal-evidence.mjs --report work/m9-federal-audit.json` using the pinned archive.

“Verified” here means faithfully matched to a recorded official source. It does not mean every school was independently contacted, every field has the same year/cohort, or the records are current in real time. Missing/suppressed data stays missing; institutional admit rates are not major-specific; broad federal fields are not exact live major lists. Each metric retains its source, reporting period and definition. See [M7 catalog evidence](M7_CATALOG_BENCHMARK.md) and the app's `/data-sources` page.

## Remaining release boundaries

The catalog release is unchanged. No hosted database publication, billing change or provider activation is included. Public AI remains unavailable: NVIDIA's free Developer Program endpoints are for prototyping/testing; its [current FAQ](https://docs.api.nvidia.com/nim/docs/product) distinguishes that access from production use. Production-permitted provider access, broader adviser quality review, hosted Auth/email journeys and observed scheduled retention remain open as recorded in M8.
