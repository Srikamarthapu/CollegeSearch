# M1 federal source-value audit

**Run date:** 2026-10-04
**Dataset:** `data/colleges.json` (100 colleges)
**Source archive:** [College Scorecard June 10, 2026 institution release](https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip)
**Archive SHA-256:** `f56a181b000ca4914e924c16b6b81dcc656e25aeb2ac68ab7d271ac0f29ffd58`

## Result

The independent audit passed. It found the same archive fingerprint in the ZIP, `data/college-catalog.json`, and the Scorecard source registration in `data/colleges.json`. Both the manifest and generated data contain the same 100 UNITIDs. All campus identity checks and direct federal metric comparisons passed with no mismatches.

| Check | Result |
| --- | ---: |
| Catalog and dataset campus identities | 100 |
| Primary Scorecard observations checked | 605 |
| Alternate Scorecard observations checked | 195 |
| Direct numeric observation comparisons | 800 |
| Broad PCIP award-share / CIP availability pairs checked | 1,152 |
| UC and institution-published observations excluded from Scorecard comparison | 208 |
| Scorecard-bound fields classified as derived or not direct | 0 |
| Errors | 0 |

The 208 excluded observations are intentionally not presented as Scorecard-verified. They use registered UC, Common Data Set, registrar, or other first-party evidence, which this institution ZIP cannot substantiate. Their source values need their own source-specific review.

## Reproduction

From the repository root, run:

```sh
node scripts/audit-catalog-federal-evidence.mjs --report work/m1-federal-value-audit.json
```

The CLI also accepts `--archive`, `--dataset`, and `--manifest` for alternate inputs. It exits `0` on a clean audit, `1` when the compared records disagree, and `2` if it cannot run because an input is missing or malformed. The complete output from the passing run is in the ignored `work/m1-federal-value-audit.json` file.

The implementation is independent of the importer. It opens the supplied ZIP, finds exactly one institution CSV, reads the raw row for each selected UNITID, and resolves the field named by each observation's `sourceField`. It does not import importer mappings or copy computed values. It checks the archive hash against both source registries and checks release dates and artifact URLs. It also checks that manifest and generated UNITID sets match, rejects duplicate UNITIDs/slugs, and compares the official campus name, state, control, city, OPEID/OPEID6, MAIN, NUMBRANCH, and CURROPER fields with the reviewed catalog and generated college.

For each primary and alternate observation registered to the Scorecard source, the audit compares a direct CSV field's value with the generated numeric value (or `null` for a suppressed/unavailable source cell). An explicitly labeled formula such as “Derived … divided by …” is reported as not a direct field rather than compared to a single CSV column. An unknown non-direct field fails the audit. This release had no Scorecard-bound derived observations.

For each broad field pair named by `release.metricPeriods.fieldEvidence.sourceFields`, the audit reads the `PCIPxx` award share and its paired `CIPxxBACHL` availability code from the same UNITID row. It verifies that the generated major entry exists only when the source indicates availability and reports a share, that the share matches the PCIP value and falls in the 0–1 range, and that the availability code is recognized. Code `2` is checked against `deliveryMode: "includes-distance-program"`; code `1` remains `"delivery-not-specified"`. The check also rejects copy that describes a code-2 broad field as exclusively online.

The delivery interpretation follows the official [College Scorecard Institution Data Documentation](https://collegescorecard.ed.gov/files/InstitutionDataDocumentation.pdf), Academics section, PDF page 9, footnote 12. The broad two-digit CIP category groups multiple programs; the distance code indicates that at least one program within that broad category can be completed through distance education. It does not establish that every program in the field is online or that on-campus options are absent. The observed numeric share remains a percentage of the institution's awards across that broad field, not a program-specific admission or outcome rate.

## Audit integrity check

To verify that the checker rejects a changed observation, I copied the dataset to `/tmp`, added `1` to a Scorecard-sourced `ADM_RATE`, and ran the same command with `--dataset /tmp/college-search-federal-audit-negative.json`. The audit exited `1` and reported the exact UNITID, `ADM_RATE` field, changed generated value, and source value. No repository data was altered by this negative check.

## Limits

This is a value and identity comparison against one pinned archive. It does not prove the federal source's underlying collection is error-free. It does not validate the cohort, period, units, definition, finality, presentation, or source truth for UC and institution-published metrics; nor does it replace the overlay artifact verifier or browser review. The audit confirms numeric lineage for the federal fields it checks, while interpretation and user-facing context remain separate review responsibilities.
