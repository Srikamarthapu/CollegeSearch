# CollegeSearch

CollegeSearch is a source-transparent college discovery and comparison site
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
- Identify every college with a source-recorded institutional mark instead of
  generated initials
- Use smooth, reduced-motion-aware Lenis scrolling with a restrained moving
  campus-atlas background
- Sign up, confirm an email, sign in, recover a password, sign out, or continue
  with Google after a Supabase project is connected
- Use the full experience on mobile, tablet, or desktop

The app intentionally distinguishes dated federal program-and-award evidence
from a verified current program. It also labels every displayed admission rate as
institution-wide unless an official source publishes a comparable program-level
rate.

## Data

Refresh the committed evidence files with:

```bash
npm run data:refresh
```

That command runs one source-integrity preflight and three source-specific
importers in order:

1. `scripts/import-uc-accountability.mjs` downloads the official
   [UC Accountability Report 2026 Chapter 2 workbook](https://accountability.universityofcalifornia.edu/2026/documents/data-tables/chapter02data2026.xlsx).
   It reads sheet `2.1.1`, validates all nine undergraduate UC campuses, and
   writes the reported Fall 2025 freshman applicant, admit, and enrollee counts
   to `data/uc-admissions-2025.json`. Campus admit and yield rates are derived
   directly from those counts. The source URL, worksheet, access date, and
   workbook SHA-256 remain attached to the release. Campus rows count
   applications, so they must not be summed to infer unduplicated
   university-wide applicants.
2. `scripts/import-uc-admissions-snapshots.mjs` checks all nine official UC
   campus admission pages, requires one shared reporting cycle, validates each
   displayed admit rate against applicants and admits, and writes both a dated
   archive and `data/uc-admissions-latest.json`. A SHA-256 is recorded for each
   page. Fall 2026 applicants, admits, and headline rates come from these
   current snapshots; they do not publish enrollees or yield.
3. `scripts/verify-institution-overlays.mjs` validates every manually reviewed
   institution override, recomputes each pinned artifact hash or normalized
   content fingerprint, checks its allowlisted host and file type, and rejects
   any changed source before the refresh writes data. The review record remains
   bound to the approved fingerprint.
4. `scripts/import-scorecard.mjs` downloads the Department of Education&apos;s
   official [June 2026 Most Recent Institution file](https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip),
   records its SHA-256, selects the exact 50 IPEDS UNITIDs, and checks their
   OPE identity, current operating status, and main-campus status. It applies
   manually reviewed institution observations from `data/institution-overlays.json`
   while retaining replaced federal records as alternates, then writes
   `data/colleges.json`. No API key is required.

These sources describe different cohorts and are intentionally kept distinct:

- UC headline admission rates use Fall 2026 campus snapshots. Fall 2025
  Accountability counts remain only for finalized enrollees and yield, and the
  federal admission observation remains alternate evidence.
- ASU Campus Immersion, Stanford, and MIT use manually reviewed 2025-2026
  Common Data Set records for Fall 2025 admission and enrollment, each
  institution's stated completion cohort, and 2026-2027 tuition plus required
  fees. Replaced federal values stay available as standardized alternates.
- Colleges without a reviewed official override use the latest available
  federal value, with its real period shown: Fall 2024 admission/enrollment,
  2023-2024 net price, 2024-2025 tuition, the Fall 2018 completion cohort, and
  pooled 2017-18 and 2018-19 completer earnings measured in 2022-23 and
  adjusted to 2024 dollars. The older ten-years-after-entry earnings field,
  measured in 2020-2021, is retained only as alternate evidence.
- Broad field filters require a 2024-2025 federal bachelor&apos;s-program
  indicator, including code `2` when the field is offered exclusively through
  distance education. The displayed percentage remains that CIP family&apos;s
  share of all institution-wide awards, so it is not an exact current major
  catalog.

Major filters are **not** major-specific admission rates. They only include
broad fields with a federal bachelor&apos;s-program indicator and pair that signal
with an institution-wide award share. That evidence does not establish that a
specific program currently accepts students, admits directly, offers a
particular concentration, or has the same selectivity as the college overall.
The official
[UC freshman admission-by-discipline dashboard](https://www.universityofcalifornia.edu/about-us/information-center/freshman-admission-discipline)
is linked for additional context but is not silently normalized into the
federal degree-share fields.

Institution marks are used for identification, not endorsement. Their exact
asset, source URL, and copyright/trademark usage note are recorded in
`data/college-logo-sources-01-25.json` and
`data/college-logo-sources-26-50.json`, and are inspectable on the Data sources
page.

## Authentication setup

Copy `.env.example` to `.env.local` and add only these browser-safe values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Google's OAuth Client ID and Client Secret are configured inside the Supabase
dashboard, never in a `NEXT_PUBLIC_*` variable. The full email, Google, redirect,
SMTP, and verification checklist is in `AUTH_SETUP.md`. No service-role key is
needed for this auth foundation.

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
npm run data:verify-overlays
```

The test suite builds the production worker, checks the canonical rendered
routes, and validates cohort uniqueness, observation completeness, source
lineage, all nine UC Fall 2026 headline snapshots, finalized Fall 2025 UC yield,
the official ASU, Stanford, and MIT overlays, metric ranges, and broad-field
evidence labels.

## Current scope

This milestone ships the discovery, comparison, account-integration foundation,
and transparent preference-matching workspace at `/match`. Match scores use only
the selected fit signals, keep missing evidence out of the denominator, and
never use overall admit rate as a fit signal or admission prediction. Local
saves remain deliberately device-local; syncing them into user-owned,
RLS-protected Supabase rows comes next. AI agents and any future personalized
admissions-model work remain later phases and must preserve the app's current
evidence limits.
