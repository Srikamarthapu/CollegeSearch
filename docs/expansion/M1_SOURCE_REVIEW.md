# M1 source-content recheck and correction ledger

Reviewed October 4, 2026 by Codex against the official source content. The publication transaction stopped on three changed raw HTML fingerprints. All five registered observations below were then re-read against the current tables, period labels and footnotes. This is a content review, separate from the subsequent automated artifact check.

| Source / UNITID | Registered facts before → after | Review and scope |
|---|---|---|
| [Caltech Registrar](https://registrar.caltech.edu/records/enrollment-statistics) / 110404 | Undergraduate enrollment: 971 → 971 | Fall 2025–26 total; 445 + 526 confirms the total. Graduate enrollment 1,398 remains separate. Page date October 24, 2025. |
| [Caltech financial aid](https://www.finaid.caltech.edu/Costs) / 110404 | Annual tuition + required fees, both stored legacy tuition keys: $71,229 → $71,229 | Full-time undergraduate 2026–27: $68,574 + $2,655. Excludes housing/meals, other attendance costs, optional insurance and the separate $600 entering-student orientation charge. |
| [Pomona Finance Office](https://www.pomona.edu/administration/finance-office/student-accounts/tuition-and-costs) / 121345 | Annual tuition + required fees, both stored legacy tuition keys: $72,080 → $72,080 | 2026–27: two semesters of $35,830 + $210, confirmed by annual tuition $71,660 and fees $420. Excludes deposit, housing/food, insurance and conditional charges. |

The publisher pages were opened for factual review, then independently downloaded through the existing allowlisted, size-limited verifier path. The downloaded hashes matched the three failure-report fingerprints. Raw HTML is retained under ignored `work/m1-source-review/` for this working review; the approved fingerprints and notes are committed in `data/institution-overlays.json`. No numerical observation, reporting period, population, source URL or hash-normalization policy was changed.

| Source ID | Previous SHA-256 | Approved SHA-256 |
|---|---|---|
| caltech-registrar-enrollment-2025 | `7b5985302b7530a771cc4ee1916c5b7c88cc32ecf28c5a633ad4beceb153beed` | `ab5302c31031ef6e6dce17ce8a288fc710e7ad58f8fcd9bae9a5ca505c0cecd0` |
| caltech-financial-aid-costs-2026-27 | `a197add41ecd482903c7174051a64564baeab99129aede51a541c192c3f0f3f5` | `c6cbc3387e3e4f0fd551c466c48d5e8ac7655a0265f6785f846d534685f0aa59` |
| pomona-tuition-costs-2026-27 | `02a995ecc74dfc0a5fa3287a05ff1dcf1d6c108cdcdbb4b7acbf2ca136cbb76b` | `c30784f56e76b398e8d83f3b4da61734430104946dc9fba608b73fef230378b7` |

Offline overlay validation passed: 24 institution overlays, 163 observations, 26 artifacts. A fresh full transactional refresh must still pass before this review becomes a published catalog release. Other source approvals keep their earlier factual-review dates even when their live fingerprint checks pass.

For later corrections, add a dated row with UNITID, metric, previous/new value and source, reporting population, reviewer and reason. Do not approve a changed hash solely because the URL responds. Update the affected source/observation only after source-content review, then rerun schema, source-value, live artifact and rendered checks before publication.
