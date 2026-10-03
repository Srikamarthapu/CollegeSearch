# CollegeSearch production-readiness audit: data and evidence

Audit date: 2026-09-10. Checkout: `/Volumes/Seagate /CollegeSearch`, HEAD `d46557be9c30198603a8910f1442a09004d35e6a`, with existing working changes and the root agent's concurrent brand rename. This agent changed no repository files. `git diff --exit-code -- data scripts` passed. All downloads, generated releases, and audit files are under this directory.

## Assessment

The source model is careful and the committed federal/UC data reproduce from today's official downloads. However, live institutional verification is failing for six of 26 registered artifacts, blocking the complete refresh pipeline. Data operations need repair before claiming that all first-party sources are currently verified. A fingerprint mismatch does not itself prove a displayed number is wrong: checked values in the changed Caltech, Pomona, and UT Austin records still agree with current sources. Georgia Tech's replacement URL serves the exact pinned file.

No confirmed numerical inaccuracy was established in this bounded audit. It was not an independent manual re-transcription of every one of the 163 overlay observations. The current dataset remains a curated, historical research cohort, with limitations that matter for a production college-planning product.

## Current verification

| Check | Result | Evidence |
|---|---|---|
| `npm run data:verify-offline` | PASS: 24 overlay colleges, 163 observations, 26 artifacts; 28 tests | `offline-verification.log` |
| `npm run data:verify-overlays` | FAIL: first stopped at Georgia Tech HTTP 404 | `live-overlay-verification.log` |
| Every overlay independently fetched, validated, and hashed with repository functions | 20 pass / 26; 6 failures | `all-overlay-artifacts.json`, `all-overlay-artifacts.log`, `audit-artifacts.mjs` |
| Official UC Fall 2026 campus importer, output redirected into `/tmp` | PASS: 9 campus records; all counts, periods, hashes, and rates match committed records excluding `accessedOn` | `uc-snapshot-import.log`, `current-uc/uc-admissions-latest.json` |
| Official UC Accountability 2026 workbook importer, output redirected into `/tmp` | PASS: 9 Fall 2025 records; same data and workbook hash excluding `accessedOn` | `uc-accountability-import.log`, `current-uc/uc-admissions-2025.json` |
| Official June 2026 Scorecard importer, output redirected into `/tmp` | PASS: 50 colleges; complete generated dataset matches committed content excluding `accessedOn` | `scorecard-import.log`, `current-federal/colleges.json` |
| Semantic comparison of all three generated files | No differences except refreshed `accessedOn` fields | `current-source-comparison.json` |

The Scorecard reimport reused the committed reviewed overlays and committed UC inputs; it independently redownloaded the federal archive. UC inputs were separately regenerated and compared. Therefore a successful reimport is not new manual approval of the six failed overlay files.

The [official Scorecard data page](https://collegescorecard.ed.gov/data/) still identifies June 10, 2026 as its latest update, verified today. Thus the older federal metric periods below should not be described as a failed federal refresh.

## Findings requiring remediation

### DATA-01 — P1: the full live refresh is currently blocked by six source verification failures

`scripts/refresh-data.mjs:60` requires successful overlay verification before any UC or Scorecard import or publication. `scripts/verify-institution-overlays.mjs:260-289` rejects invalid responses, changed hosts, and changed fingerprints. That behavior is correct, but the registered artifacts need maintenance.

| Source | Current reproduction | Registration |
|---|---|---|
| Georgia Tech CDS | Registered URL returns HTTP 404. The current official page links a URL containing `/sites/default/files/`, which returns HTTP 200 and the exact approved SHA-256 `598830d23246891448e3859e3ae961274984cd31161980280d2293737af25a68`. | `data/institution-overlays.json:194-208` |
| Illinois CDS | Old `www.dmi.illinois.edu/...xlsx` returns HTTP 301 to `https://dair.illinois.edu` (the homepage). Verifier rejects the new host. Merely adding the host would not restore a workbook. The current DAIR CDS page links 2025-26 via Box. | `data/institution-overlays.json:220-234` |
| UT Austin CDS | HTTP 200 PDF, hash changed from `29ed60a5...` to `d453f39a...`. The inspected admissions, enrollment, and graduation values are unchanged, but pagination moved; stored source-field page references no longer align. | `data/institution-overlays.json:507-529`, observation references `2534-2629` |
| Caltech enrollment | HTTP 200 HTML, hash changed from `b0e833e7...` to `7b598530...`. Current page still reports Fall 2025-26 undergraduate total 971. | `data/institution-overlays.json:612-637` |
| Caltech costs | HTTP 200 HTML, hash changed from `034972cb...` to `a197add4...`. Current 2026-27 tuition 68,574 plus fees 2,655 still equals the stored 71,229. | `data/institution-overlays.json:643-669` |
| Pomona costs | HTTP 200 HTML, hash changed from `43d02e1a...` to `b84319b9...`. Current 2026-27 tuition 71,660 plus fees 420 still equals the stored 72,080. | `data/institution-overlays.json:675-700` |

Current official source paths: [Georgia Tech CDS](https://irp.gatech.edu/common-data-set), [replacement Georgia Tech artifact](https://irp.gatech.edu/sites/default/files/CDS/CDS_2025-2026_FINAL_R4_03JUN2026.pdf), [Illinois CDS](https://dair.illinois.edu/access-data/common-data-set/), [Caltech enrollment](https://registrar.caltech.edu/records/enrollment-statistics), [Caltech costs](https://www.finaid.caltech.edu/Costs), [Pomona costs](https://www.pomona.edu/administration/finance-office/student-accounts/tuition-and-costs).

Remediation: update proven moved URLs; independently review the replacement Illinois artifact and changed UT/HTML artifacts; update exact page lineage and approval records; rerun every live source and the complete refresh. Retain the integrity checks. Do not silently repin changed artifacts.

Evidence details: `gatech-current-url.json`, `illinois-redirect-headers.txt`, all artifact JSON/logs, downloaded files in `artifacts/`. The changed UT Austin source PDF is `artifacts/ut-austin-cds-2025-26.pdf`; current p13 gender counts and p14 residency totals were visually inspected. Admissions totals remain 90,690 applicants, 20,154 admits, 9,900 enrollees. Current enrollment B1 is p5, and graduation tables are pp8-9. Other UT fields were checked by extraction; this is not a full-document manual approval.

### DATA-02 — P2: Data health does not expose verification failures or last live-check results

`app/data-health/page.tsx:105-128` renders source `accessedOn`, revision state, and cohort solely from committed release metadata. `:138-143` describes future coverage expansion as known refresh work. It has no verified-at, HTTP/fingerprint status, failed-source list, or source-review queue. The scheduled `.github/workflows/live-data-verification.yml` only runs a fail-fast command weekly; no persisted result feeds this page.

Reproduction: today the verifier fails while the data-health implementation continues to present the same approved/snapshot metadata and coverage counts. This does not make the historical access dates false, but the page is a source inventory rather than a live operational health view.

Remediation: publish a dated verification report and distinguish last approved evidence from current source availability, with actionable per-source failures. Preserve a usable last-known-good release while alerting maintainers to review work.

### DATA-03 — P2 interpretation gap: preference scores omit important population comparability

`app/match/page.tsx:36-54` projects observations into value, period, and publisher only. `app/match/scoring.ts:13-17` cannot carry the population definition or `comparabilityKey`. `:326-342` scores the raw graduation rate across these current populations:

- 28 federal first-time, full-time degree/certificate-seeking Fall 2018 cohorts.
- 21 institutional bachelor's degree-seeking Fall 2019 cohorts.
- 1 Northwestern adjusted freshman Fall 2018 cohort.

The score breakdown at `app/match/MatchTool.tsx:598-613` displays points and weight without these differences. Dates appear on cards, but comparability caveats do not. Historical enrollment scoring also mixes degree/certificate-seeking counts, total undergraduate counts, and degree-seeking counts.

Price scores at `app/match/scoring.ts:251-276` use the public-college in-state Title IV average for all students. `app/match/MatchTool.tsx:403-418` calls the input an annual cost preference and gives a general family-cost caveat, but does not identify the in-state aid-recipient cohort. Example: Georgia Tech receives maximum price alignment at a 15,000 preference because the historical in-state average is 12,116; the tool has no residency input. This is not evidence that a nonresident family can attend within that budget. The methodology page correctly explains that limitation at `app/methodology/page.tsx:183-189`, but the scored decision point loses it.

Remediation: carry population definitions into scoring UI, disclose when periods or populations differ, use comparable federal alternates where a standardized cross-school score is intended, and keep cost comparison explicitly a historical cohort comparison with a direct official calculator path. Do not invent individualized net prices.

Current scope note: all 50 earnings observations use the same four-years-after-completion population, same pooled 2017-18/2018-19 cohort, and 2022-23 earnings adjusted to 2024 dollars. A claim that today's earnings scores mix dollar years or cohorts would be incorrect. The loss of provenance in the type is a future-maintenance risk for earnings, not a reproduced current mismatch.

## Product/data capability gaps, separate from defects

These are explicit starting-release limitations, not reasons to fabricate broader coverage or unsafe admissions predictions.

| Capability | Current state | What a stronger student tool still needs |
|---|---|---|
| College coverage | Exactly 50 institutions, 17 states; 27 in California; 34 public and 16 private nonprofit | Broader, deliberately selected coverage with visible inclusion/exclusion criteria; reliable exact-campus support |
| Majors | Exactly 12 broad CIP families, dated 2024-2025 bachelor indicator plus award share; fixed map in `scripts/import-scorecard.mjs:65-104` | Reviewed exact programs, degree levels, direct-admit/change-of-major constraints and program source links; keep absent/missing distinct |
| Admissions | 9 preliminary Fall 2026 UC headlines, 19 reviewed Fall 2025 institutional headlines, 22 Fall 2024 federal baselines | Verified current policy/deadline records and appropriately scoped residency/program evidence; historical rates cannot substitute for this |
| Academic evidence | No verified comparable GPA or test-score ranges; acknowledged in `app/chances/ChancesTool.tsx:129-131` | Cohort-defined academic context if obtained; no unsupported personal-odds model |
| Tuition and required fees | 11 colleges have 2026-27 institutional values; 39 retain 2024-25 federal values | Current official costs by applicable residency/program/cohort, fuller cost-of-attendance context and direct calculator links |
| Net price | All 50 use 2023-24 aid cohort; public observations are in-state Title IV recipients | Strong point-of-use cohort labels and official net-price calculator workflow; no misleading family-specific inference |
| Earnings | All 50 use 2022-23 measurements for older completer cohorts, with real definitions | Continue exact cohort/dollar-year disclosure; major-level career information would require distinct reliable evidence |
| Application research | Notebook checklist asks students to verify majors, run a calculator, and confirm deadlines (`app/lib/research-notebook.ts:3-7`) | Structured dated records and useful official deep links so students can complete these tasks without reconstructing the source search themselves |

Coverage counts and all current metric-period distributions are in `coverage-summary.json`. Differences between graduation headlines and comparable federal alternates are in `graduation-comparability.json`; they are not errors, since the populations and periods differ.

## Reproduction commands

Run the verification commands from the checkout. All import commands below write only to the audit directory.

```sh
npm run data:verify-offline
npm run data:verify-overlays
node /tmp/collegesearch-prod-data-2026-09-10/audit-artifacts.mjs
DATA_OUTPUT_DIR=/tmp/collegesearch-prod-data-2026-09-10/current-uc node scripts/import-uc-admissions-snapshots.mjs
DATA_OUTPUT_DIR=/tmp/collegesearch-prod-data-2026-09-10/current-uc node scripts/import-uc-accountability.mjs
DATA_OUTPUT_DIR=/tmp/collegesearch-prod-data-2026-09-10/current-federal node scripts/import-scorecard.mjs
```

## Limits

Read-only data/source audit of the current local checkout. Build, UI/browser flow, account/security, deployment, and live GitHub workflow state are owned by the other audit agents. No complete `data:refresh` was run because it would mutate the checkout and its first preflight is already proven to fail. The three importers were instead run safely with redirected outputs. Source checks reflect this host and time; the stored logs are the reproducible evidence. Remote artifacts can change again.
