# M12 — Tuition-only discovery and cost evidence

## Product behavior

Discovery cards, saved cards, profile headlines, comparison and research CSV now use actual separately reported annual tuition, before aid. Fees, housing and living expenses are excluded. Public-college cards state the out-of-state basis; profiles and comparison also show in-state tuition. The default discovery cost filter and sort operate on this same tuition-only value. Old `price` (net price) and `tuition` (combined reported charges) URLs keep their historical meaning with explicit labels; new controls write `tuitionOnly` and `sort=tuition-only`.

The additive IPEDS tuition dataset carries all 3,912 catalog identities, including explicit null observations where annual charges are not separately supported. It is separate from the existing Scorecard and adviser knowledge release: source archives, source fields and reporting periods are not silently overwritten. A data refresh that changes catalog membership must refresh the tuition join as well; the application rejects missing evidence rows.

## Reviewed current costs

Official pages were read and their stated periods/cohorts checked on October 8, 2026 UTC (October 7 Pacific).

- Stanford: 2026–27 tuition **$67,731**, student fees **allowance $2,610**, housing and food $22,944, books $855, personal expenses $3,405; standard annual budget **$97,545 plus variable travel**. Insurance can add cost; new students pay $775 in one-time fees. The prior $68,574 combines tuition and only the campus health fee and is not a complete fee budget. The new tuition display and full budget supersede that partial presentation. [Official student budget](https://financialaid.stanford.edu/undergrad/budget/index.html).
- Berkeley: new 2026–27 cohort, annual tuition **$14,202 resident / $53,472 nonresident**, calculated from two semesters; recurring required fees **$4,012**, excluding waivable health insurance and one-time fees. [Registrar's official fee schedule](https://www.registrar.berkeley.edu/tuition-fees/fee-schedule/).
- Berkeley residence-hall budget: resident **$54,674**, nonresident **$93,944** after adding $39,270 supplemental tuition; includes $5,066 waivable health insurance. Other living arrangements/cohorts differ. [Official student budgets](https://financialaid.berkeley.edu/how-aid-works/student-budgets-cost-of-attendance/).

Exact source URLs, fields, definitions, cohort, observation status and hashes are stored in `data/college-cost-overrides.json`. Source snapshots are in ignored `work/m12-cost-sources/`. `node scripts/verify-reviewed-cost-budgets.mjs work/m12-reviewed-costs.json` checks the current official pages for the named amounts and verifies component totals. Berkeley HTML contains volatile content; full-page hash drift is reported rather than automatically approved. A live content check is not a promise that charges will never change.

## Coverage and limits

The comprehensive source comparison is documented in [the catalog evidence audit](M12_CATALOG_EVIDENCE_AUDIT.md). Matching historical government records does not imply that all 3,912 colleges have independently reviewed current-year prices or full attendance budgets. Stanford and Berkeley have the new reviewed full-budget panels; other profiles explicitly say that their full attendance budget has not been independently reviewed and link to the institution.

No provider, database, billing or account changes are part of this cost presentation update. The existing AI knowledge release remains dated and public AI remains disabled. Re-enabling it still requires the prior release gates and a new evidence release that incorporates these separate tuition records; legacy tuition-and-fee fields must not be renamed tuition-only.

## Validation

- Complete regression suite: **514/514 passed**, including all 3,912 profile routes. Two obsolete rendered-copy assertions were updated for the new cost presentation before the final passing run.
- Final evidence guard checks: **12/12 passed**; Vinext and native Next production builds, TypeScript, ESLint and whitespace checks passed.
- Local and hosted `verify-product-polish.mjs` passed, including Stanford tuition-only API values, low/high tuition filters, Stanford/Berkeley full budget figures, comparison, and existing Admissions/planner regressions.
- Browser review: tuition filters exclude/include Stanford correctly; tuition-only cards and the cost breakdown display correctly at desktop, 390px and 320px. No horizontal overflow or browser warning/error logs observed. Hosted Stanford budget and source link checked directly.
- Code **9d84eef** deployed to READY Vercel production **dpl_7vU3FDdaC4VTEr4zVmtoh6vGD2cr**. Public alias: https://collegesearch-steel.vercel.app. Logs and captures are under ignored `work/m12-*` and `outputs/m12/`.

These checks establish the changed browsing flows and source fidelity. They do not establish current tuition at every college, guaranteed individual costs, all homepages reachable, or general public-launch readiness.
