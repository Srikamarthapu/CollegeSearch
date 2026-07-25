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

The committed starting cohort is generated from the U.S. Department of
Education College Scorecard API:

```bash
node scripts/import-scorecard.mjs
```

The importer requests 2024 institution metrics and the available 2020
ten-years-after-entry earnings cohort, validates the 50 expected IPEDS UNITIDs,
checks rate ranges, and writes `data/colleges.json`. It uses the public
`DEMO_KEY` by default; set `DATA_GOV_API_KEY` to use a dedicated data.gov key.

Official UC admissions and discipline dashboards are linked separately in the
product because their cohorts and definitions should not be silently merged
with the national baseline.

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

The test suite builds the production worker, checks the rendered product shell,
and validates cohort uniqueness, coverage, source lineage, UC inclusion, metric
ranges, and major-evidence labels.

## Current scope

This is the fully functional discovery foundation requested for the first
project milestone. Account synchronization, the preference quiz, and the
Admissions Chances Explorer described in the longer PRD remain later phases.
Local saves are deliberately anonymous and stay on the current device.
