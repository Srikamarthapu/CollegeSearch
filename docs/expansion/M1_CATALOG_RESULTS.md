# M1 catalog result — October 4, 2026

The local public dataset now contains 100 unique, source-verified institutions. The original 50 UNITIDs and profile slugs are unchanged. The mix is 74 public / 26 private nonprofit; regions are West 49, South 17, Midwest 17 and Northeast 17. A reviewed manifest records selection reasons, exact source identities and the pinned federal artifact. Future additions use that manifest and the transactional refresh pipeline.

## Evidence

- `npm run data:refresh`: passed; all 26 institutional artifacts checked, nine finalized UC rows and nine latest UC rows imported, 100 federal institution records, four generated files published atomically.
- Independent federal source-value audit: 100 identities, 800 direct federal observations and 1,152 broad program pairs matched the pinned source archive; zero mismatches. Nonfederal observations remain covered by reviewed institutional/UC evidence, not mislabeled as federal checks.
- Next production build, typecheck and lint passed. Vinext build passed. Focused catalog/evidence/tuition/refresh checks passed.
- Full suite after count-dependent assertions were corrected: **350 passed / 1 failed**. The remaining test correctly catches the database's old fixed 50-ID save constraint. This is the planned M2 migration gate; the expanded app must not deploy until it is fixed and retested.
- Real Chrome flows passed for new public/private college search, comparison with dated sources, guest saving, My colleges reload recovery and profile navigation. 320px/390px search and profiles had no horizontal overflow. No runtime errors or missing logo requests. Screenshots were inspected.
- Generated dataset: 2,019,333 bytes; client explorer projection: 215,577 bytes, still within the existing per-college payload budget. Full profile-only provenance is not copied to the explorer client.

## Corrections made

Runtime and pre-publication checks now reject malformed evidence, mismatched registered sources, invalid values/statuses/units/dates and duplicate identities. Region mapping covers all 50 states plus DC and rejects unknown state codes. Federal in-district charges are distinguished from independently sourced in-state charges. Private college profiles show one standard tuition-and-fees amount. The distance-learning flag now means at least one program within a broad field can be completed remotely, without labeling the entire field online-only. Mobile comparisons preserve that qualification.

Three changed official page fingerprints stopped publication. The five affected Caltech/Pomona facts were reread against current tables and footnotes, with no numerical/cohort changes, before new fingerprints were approved. `M1_SOURCE_REVIEW.md` records the review.

## Remaining work before release

1. M2: add the catalog/evidence database schema, seed it, replace the fixed saved-college constraint without losing existing rows, and run real SQL and hosted checks. The one remaining suite failure stays visible until that integration is proven.
2. Official action links now cover exactly 100 colleges: admissions 93 verified, deadlines 87, programs 95, calculators 89. Unverified destinations are explicitly unavailable; 22 unresolved slots belong to new colleges. The original 50 action rows are preserved. See M1_RESOURCES.md. College facts do not depend on these navigation links.
3. Repeat the changed-resource/UI checks on the integrated final build. The screenshots already checked are local evidence, not deployment proof.
4. M3/M4: adviser/provider integration, private history/limits, real model evaluation after the owner adds a key, and final design/release audit. No deployment or public AI activation occurred in M1.
