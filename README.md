# College Compass

College Compass is a source-transparent college discovery and comparison site
for first-year applicants. This starting release turns the product definition
in `college_compass_prd.md` into a usable, responsive experience with a verified
50-college cohort.

## What works

- Search by college name, alias, city, state, or broad major
- Filter by major evidence, location, college type, admit-rate band, and average
  net price
- Inspect evidence profiles with metric years, definitions, and official source
  links
- Compare two to four colleges with the comparison encoded in the URL
- Save colleges locally without creating an account
- Use the full experience on mobile, tablet, or desktop

The app intentionally distinguishes recent degree-completion evidence from a
verified current program. It also labels every displayed admission rate as
institution-wide unless an official source publishes a comparable program-level
rate.

## Data

Refresh the committed evidence files with:

```bash
npm run data:refresh
```

That command runs two source-specific importers in order:

1. `scripts/import-uc-accountability.mjs` downloads the official
   [UC Accountability Report 2026 Chapter 2 workbook](https://accountability.universityofcalifornia.edu/2026/documents/data-tables/chapter02data2026.xlsx).
   It reads sheet `2.1.1`, validates all nine undergraduate UC campuses, and
   writes the reported Fall 2025 freshman applicant, admit, and enrollee counts
   to `data/uc-admissions-2025.json`. Campus admit and yield rates are derived
   directly from those counts. The source URL, worksheet, access date, and
   workbook SHA-256 remain attached to the release. Campus rows count
   applications, so they must not be summed to infer unduplicated
   university-wide applicants.
2. `scripts/import-scorecard.mjs` requests the 50-college cohort from the
   official [U.S. Department of Education College Scorecard](https://collegescorecard.ed.gov/data/),
   validates the expected IPEDS UNITIDs and metric ranges, then writes
   `data/colleges.json`. It uses the public `DEMO_KEY` by default; set
   `DATA_GOV_API_KEY` to use a dedicated data.gov key.

These sources describe different cohorts and are intentionally kept distinct:

- UC headline admission rates use Fall 2025 freshman campus counts from the UC
  workbook. The 2024 College Scorecard admission observation is retained as
  alternate evidence for those campuses.
- Other colleges use the 2024 College Scorecard institution-wide admission
  observation.
- Enrollment, cost, tuition, completion, and academic-field evidence use 2024
  College Scorecard fields. Earnings use the available 2020 federal
  ten-years-after-entry cohort.

Major filters are **not** major-specific admission rates. They show the share of
recent federal degree completions in broad academic fields. That evidence does
not establish that a program currently accepts students, admits directly,
offers a particular concentration, or has the same selectivity as the college
overall. The official
[UC freshman admission-by-discipline dashboard](https://www.universityofcalifornia.edu/about-us/information-center/freshman-admission-discipline)
is linked for additional context but is not silently normalized into the
federal degree-share fields.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server.

## Verification

```bash
npm test
npm run lint
```

The test suite builds the production worker, checks the canonical rendered
routes, and validates cohort uniqueness, observation completeness, source
lineage, all nine UC Fall 2025 counts and derived rates, metric ranges, and
major-evidence labels.

## Current scope

This is the fully functional discovery foundation requested for the first
project milestone. Account synchronization, the preference quiz, and the
Admissions Chances Explorer described in the longer PRD remain later phases.
Local saves are deliberately anonymous and stay on the current device.
