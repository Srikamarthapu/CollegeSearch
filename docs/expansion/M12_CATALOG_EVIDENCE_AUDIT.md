# M12 — catalog evidence and cost source audit

Audit run: October 7, 2026, local time (reports timestamped October 8 UTC). The pinned federal audit found no value or identity mismatches across the 3,912-record catalog. The result establishes fidelity to the June 10, 2026 College Scorecard archive; it does not establish that historical values are current prices or that this is a complete directory of every U.S. postsecondary institution.

## Federal catalog reproduction

The audit compared `data/colleges.json` and `data/college-catalog.json` to the official institution ZIP at `work/scorecard-current/Most-Recent-Cohorts-Institution_06102026.zip`. The archive SHA-256, manifest source hash, and catalog source hash all match: `f56a181b000ca4914e924c16b6b81dcc656e25aeb2ac68ab7d271ac0f29ffd58`. The selected roster contains 3,912 currently operating institutions in the 50 states, D.C., and U.S. territories, under the release's two-year/four-year, degree, and ownership rules. All 3,912 UNITIDs match both the archive and reviewed manifest; the 482 branch UNITIDs remain distinct records.

Every directly sourced Scorecard value matched the pinned CSV, including explicit unavailable values. The `primary + alternate` column reflects where each federal observation is stored after institutional overlays; every Scorecard record in both collections was checked, even when an institution source is displayed as primary. Median earnings has two federal periods for all 3,912 colleges, so it has 7,824 checks.

| Metric | Federal checks (primary + alternate) | Numeric matches | Unavailable matches | Mismatches |
| --- | ---: | ---: | ---: | ---: |
| Admission rate | 3,884 + 28 | 1,837 | 2,075 | 0 |
| Undergraduate enrollment | 3,889 + 23 | 3,872 | 40 | 0 |
| Average net price | 3,912 + 0 | 3,583 | 329 | 0 |
| Graduation rate | 3,890 + 22 | 3,597 | 315 | 0 |
| Median earnings | 3,912 + 3,912 | 7,154 | 670 | 0 |
| Tuition, in-district source field | 3,901 + 11 | 3,286 | 626 | 0 |
| Tuition, out-of-state source field | 3,901 + 11 | 3,286 | 626 | 0 |

The new discovery price is separately sourced from the [IPEDS 2024–25 Provisional Cost I archive](https://nces.ed.gov/ipeds/tablefiles/zipfiles/IPEDS_2024-25_Provisional.zip), where tuition and required fees are separate fields. `data/college-tuition.json` has 3,912 unique UNITIDs, all joined to the catalog, and each row retains all six `TUITION1/2/3` and `FEE1/2/3` source-field observations. The pinned ZIP SHA-256 is `cd38e8b430184cdb9a7a6679b40e7480dbc41335e1596f7f14d300cc638e35f3`; the database member SHA-256 is `98e9175e54ba719cf7f0bfcc8e043fac4d11babd1b73ba1701ebbdc23e5470f5`. Re-running the existing importer against that archive reproduced the checked-in release metadata, coverage, and all 3,912 records exactly; a structural deep-equality comparison also passed for the complete regenerated JSON and checked-in file. This is deterministic regeneration with the same importer, not a second Access database parser.

For each of the six Cost I fields, 3,384 values are numeric (3,381 reported and 3 marked derived from institution-level imputation); 528 are unavailable. The 528 comprise 472 records priced only by program with no annual rate, 19 records with unknown annual pricing, and 37 UNITIDs absent from the archive. No annual value was inferred. NCES marks the release provisional; the three imputed observations have only institution-level imputation flags, not field-level flags. The older Scorecard table above still reflects 3,286 numeric 2024–25 tuition-and-required-fee observations per field, or 626 unavailable. These counts differ because the source fields, definitions, and eligibility/coverage are different; neither count should be substituted for the other.

Current discovery and tuition-only sorting use the separate Cost I tuition observations in `college.costs`; they exclude `FEE1/2/3`. The preserved legacy tuition-and-fees values remain separately labeled as source-reported values. Neither dataset makes the 2024–25 amounts current 2026–27 prices.

The audit also matched 47,175 broad-field/program evidence rows to their source rows, checked 3,920 cases where both associate and bachelor's availability are reported, and validated completion-population metadata for 3,890 direct federal graduation observations. Nine negative average-net-price values remain intact: College Scorecard permits them when grant aid exceeds its attendance-cost measure. They are not numeric mismatches or current student quotes.

The Scorecard tuition field `TUITIONFEE_IN` means **in-district tuition and required fees**. The legacy `tuitionInState` object key does not make it a verified resident rate. The source-aware labels and definitions must remain in use; public-college rates may differ for other in-state residents. Likewise, the admission, completion, earnings, and net-price values refer to the specific periods and cohorts recorded with each observation. A byte/value match verifies source fidelity, not the suitability of comparing unlike cohorts.

The release contains 31,504 observation records, all joined to one of its 29 registered source IDs, and all 47,175 program-evidence records join to registered sources. No source IDs are missing or unknown. Of the 31,504 observations, 31,296 are direct Scorecard evidence and 208 are institution or UC additions; non-Scorecard records are excluded from the Scorecard numeric comparison. Some federal outcomes can be shared across campuses in the same OPEID6 reporting group, so a matching UNITID does not imply that every outcome was measured independently at that campus. The 3,912-record selection is the reviewed release population, not a claim to cover every training provider or non-Title-IV school.

## Registered source links and current content checks

`audit-catalog-source-links.mjs` deduplicates URLs across all used observations, alternates, program records, the IPEDS tuition sidecar, and the two current cost records. It checked 70 unique URLs from 32 registered evidence sources, with at most 120 requests and concurrency of three. In the October 8 UTC run, 68 returned HTTP 2xx and two Common Data Set landing pages returned HTTP 403 (Princeton and Michigan); there were no missing-page, server-error, other HTTP-error, or request-error outcomes. Their separately linked direct PDF artifacts were reachable and matched their registered artifact hashes.

The script read 1,260,742 bytes across 14 response bodies selected for recorded-hash or fact checks: 12 registered hashes matched and the two Berkeley page hashes changed. It also verified 45 UC numeric observation values against nine campus admissions pages and the 2026 UC accountability workbook, including published rounded admit rates and derived admit/yield arithmetic; all 45 matched, with no untested derived observations. The tuition sidecar's 23,472 observations all join to its registered IPEDS source, match their designated field and 2024–25 metadata, and agree with their numeric/unavailable status. Both sparse cost overrides join to catalog UNITIDs; all eight cost observations have valid source metadata and both budget row totals match. Per-campus website identity links were not crawled: the pinned archives and registered official evidence artifacts establish reported numbers, and repeatedly checking College Navigator for every UNITID would duplicate the same archive check. Thus, the 70/70 figure describes registered evidence URLs, not every college homepage.

Source-link reachability is only an HTTP observation. For 14 URLs the response body was compared by SHA-256; for 18 UC source records the content was parsed for the listed facts. The Cost I values were reproduced from the locally cached pinned archive; the source-link check confirmed the official archive URL responded but did not download the 68 MB body again. For the remaining reachable URLs, HTTP 2xx alone does not prove their page contents or every linked number.

## Institution overlays

The overlay validator accepted 24 colleges, 26 source artifacts, and 163 observations (123 reported and 40 derived), with no missing or unknown source IDs. The artifact verifier fetched all 26 sources successfully (HTTP 200); 23 current artifacts matched their registered bytes. Three HTML fingerprints changed, so the verifier correctly returns a failed fingerprint status even though those pages remain reachable. The visible current text still contains the values used by the affected records:

- [Caltech Registrar](https://registrar.caltech.edu/records/enrollment-statistics): 971 undergraduate students for Fall 2025.
- [Caltech's 2026–27 on-campus table](https://www.finaid.caltech.edu/Costs): $68,574 tuition and $2,655 mandatory fees, supporting the recorded $71,229 combined amount.
- [Pomona's 2026–27 page](https://www.pomona.edu/administration/finance-office/student-accounts/tuition-and-costs): $71,660 tuition and $420 student-body fees, supporting the recorded $72,080 combined amount.

These text checks do not erase the fingerprint differences or authorize new hashes. The recorded hashes were left unchanged pending an approved source refresh. A later refresh should re-review the official artifacts and update the hash and review evidence together. See [M11 product polish](M11_PRODUCT_POLISH.md) for the prior reviewed overlays and their original limits.

## 2026–27 cost override review

The separate `college-cost-overrides.json` records for Stanford and Berkeley were checked against their official pages and their annual row totals were recalculated. Those two budget rows cover only 2 of 3,912 colleges. The main institution overlay also contains 2026–27 combined tuition-and-fee observations for 11 colleges; those do not establish current full attendance budgets.

- [Stanford's official budget](https://financialaid.stanford.edu/undergrad/budget/index.html) gives $67,731 tuition and a $2,610 **Student Fees Allowance**, which the page describes as an estimate of actual fees. Its listed budget rows sum to $97,545. Travel varies and is additional; Cardinal Care insurance can add cost unless waived; new students have $775 in one-time orientation and document fees. The cost record correctly keeps the allowance separate from tuition and labels its fee basis `allowance`.
- Berkeley's [official 2026–27 registrar schedule](https://www.registrar.berkeley.edu/tuition-fees/fee-schedule/) lists per-semester tuition of $7,101, nonresident supplemental tuition of $19,635, and recurring student-services/campus/transit/instructional-resilience fees totaling $2,006. Annualized over fall and spring, this gives $14,202 resident tuition, $53,472 nonresident tuition, and $4,012 in recurring required fees. The new-student document fee and waivable health-insurance charge are outside that recurring-fee metric.
- Berkeley's [Financial Aid attendance budget](https://financialaid.berkeley.edu/how-aid-works/student-budgets-cost-of-attendance/) lists a $54,674 new-student, campus-residence-hall attendance budget. Its rows include $5,066 in waivable Student Health Insurance Plan coverage. The page says new out-of-state students add $39,270, so the corresponding listed budget is $93,944. These totals apply to that cohort and living arrangement; continuing cohorts and other arrangements differ.

`verify-reviewed-cost-budgets.mjs` returned HTTP 200 and passed eight visible-text checks for each of its three official source pages. The Stanford snapshot hash matched. Both Berkeley snapshot hashes have since changed, although the current pages still support the checked numeric text. Those hashes remain as recorded pending approved refresh; the successful text checks are not hash verification. The cost page labels amounts as estimates subject to change.

The cost component only supplies a full budget where a reviewed budget record exists; other profiles state that a complete budget has not been independently reviewed. Nothing in the reviewed cost files establishes that every college's current fees, insurance, housing, or attendance costs are updated. Tuition-only discovery has 2024–25 provisional IPEDS values for up to 3,384 colleges (with 528 unavailable per residency field); the two records in the cost-overrides sidecar are institution-specific 2026–27 tuition and budgets. Neither scope supports describing all college costs as current.

Stanford's older CDS overlay still stores $68,574 from $67,731 tuition plus $843 in reported required fees. The $843 is the $281-per-quarter Campus Health Service Fee for students living in the Bay Area, not the broader $2,610 Student Fees Allowance in Stanford's cost budget. The new override correctly uses $67,731 for tuition and carries the allowance separately. Preserve the source definition and avoid describing the two fee amounts as interchangeable.

During review, the component's subtotal copy was clarified to say that housing and living costs are excluded from the tuition-and-fee subtotal while the attendance budget includes the listed living-cost rows.

## Reproduction

Run from the repository root. Full machine-readable outputs are ignored under `work/m12-*`. The Access archive used for the reproduction command below can be downloaded from the Cost I ZIP above; its SHA-256 must equal the pinned digest before import. The reimport output is structurally compared with `data/college-tuition.json`.

```sh
node scripts/audit-catalog-federal-evidence.mjs --report work/m12-federal-audit.json
node scripts/audit-catalog-source-links.mjs --report work/m12-source-link-audit.json
node scripts/verify-institution-overlays.mjs --report work/m12-overlay-artifact-verification.json
node scripts/verify-reviewed-cost-budgets.mjs work/m12-cost-budget-review.json
NODE_PATH=/private/tmp/ipeds-reader/node_modules node scripts/import-ipeds-tuition.mjs --archive /tmp/ipeds-access.zip --output work/m12-ipeds-reimport.json --accessed-on 2026-10-07
node -e 'const assert=require("node:assert/strict"); assert.deepStrictEqual(require("./work/m12-ipeds-reimport.json"),require("./data/college-tuition.json")); console.log("IPEDS tuition reproduction matches checked-in JSON structurally");'
```

The importer uses the same implementation against the pinned Cost I archive; the structural comparison passed on this audit run. The federal audit requires the pinned Scorecard ZIP at the default path shown in its `--help`; its output is a source-value audit, not a network freshness check. The source-link and overlay checks use live official URLs, so their HTTP and fingerprint results may change over time. The cost-page check confirms current text patterns and reports whether the registered page snapshots still match.
