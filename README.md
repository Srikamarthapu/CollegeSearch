# CollegeSearch

CollegeSearch is a source-transparent college discovery and comparison site
for first-year applicants. This starting release turns the product definition
in `college_compass_prd.md` into a usable, responsive experience with a verified
50-college cohort.

## What works

- Search by college name, alias, city, state, or broad major
- Filter by major evidence, location, college type, admit-rate band, net price,
  tuition, enrollment, graduation, earnings, campus setting, UC membership,
  data completeness, or local saves
- Inspect evidence profiles with metric years, definitions, and official source
  links
- Compare two to four colleges with the comparison encoded in the URL
- Build an explainable preference match and inspect one leading fit across each
  observed overall-admit-rate band without treating the bands as personal odds
- Compare up to four historical overall admit-rate records with alias- and
  typo-tolerant college selection
- Save colleges in the browser without an account, or sync a separate account
  list after Supabase is configured
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
importers as one recoverable refresh:

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
   any changed source before publication. PDF and XLSX artifacts use their
   byte-exact SHA-256. Stable HTML pages can also use a byte-exact hash; sources
   that require the explicitly approved HTML normalization remove only known
   volatile asset versions and edge-challenge markup. The review record remains
   bound to the approved fingerprint; verification never silently blesses
   changed content. A mismatch stops publication until the replacement is
   reviewed and pinned explicitly.

   The overlay schema also supports independently reviewed, metric-level
   provenance without changing existing single-source records. A single-source
   college keeps `sourceId` as its default. A multi-artifact college additionally
   declares every allowed id in `sourceIds`, and every observation must name its
   own `sourceId`. Validation rejects unknown, duplicate, undeclared, or unused
   sources and refuses to derive a rate from operands attributed to different
   artifacts. Each registered source still passes the same HTTPS host, media
   type, fingerprint, and manual-review checks independently.
4. `scripts/import-scorecard.mjs` downloads the Department of Education&apos;s
   official [June 2026 Most Recent Institution file](https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_06102026.zip),
   records its SHA-256, selects the exact 50 IPEDS UNITIDs, and checks their
   OPE identity, current operating status, and main-campus status. It applies
   manually reviewed institution observations from `data/institution-overlays.json`
   while retaining replaced federal records as alternates, then stages
   `data/colleges.json`. No API key is required.

An exclusive `data/.refresh.lock` is held across verification, import, publish,
and cleanup. Every importer writes into a same-filesystem staging directory,
and both the verifier and Scorecard importer use the same copied overlay
manifest. The refresh aborts if the live manifest changes before publication,
or if the staged JSON does not contain the exact 50 UNITIDs.

Before publication, the four current files are backed up. Each replacement is
an individually atomic same-filesystem rename; the multi-file sequence is
lock-protected and rollback-capable, but is not one filesystem-wide atomic
operation. A normal failure restores the previous files. If rollback itself is
incomplete, the command preserves the staging backups and a
`recovery-required` lock, prints their exact paths, and blocks another refresh
until the operator explicitly recovers the release.

These sources describe different cohorts and are intentionally kept distinct:

- UC headline admission rates use Fall 2026 campus snapshots. Fall 2025
  Accountability counts remain only for finalized enrollees and yield, and the
  federal admission observation remains alternate evidence.
- Twenty-one colleges have manually reviewed 2025-2026 Common Data Set
  artifacts: ASU Campus Immersion, Stanford, MIT, Duke, USC,
  Michigan–Ann Arbor, Washington–Seattle, Georgia Tech, Illinois
  Urbana-Champaign, Santa Clara, Chapman, Loyola Marymount, San Diego State,
  Cal Poly San Luis Obispo, UMass Amherst, NYU, Harvard, Yale, Princeton,
  UT Austin, and UNC Chapel Hill. Nineteen provide reviewed Fall 2025 CDS
  admission headlines. Duke's category subtotals do not support a complete,
  internally consistent total, and Yale's detail conflicts with its separate
  official profile, so both keep their Fall 2024 federal admission rate.
  Replaced federal values stay available as standardized alternates.
- A reviewed artifact does not automatically replace every metric. USC and
  Washington do not publish supported 2026-2027 costs in their reviewed files;
  Illinois and UMass label their cost tables 2025-2026; Santa Clara retains an
  unresolved availability marker; SDSU has a later revised fee source; and Cal
  Poly's current charges vary by program and admission cohort. NYU, Harvard,
  Yale, and UT Austin do not publish the complete tuition-plus-required-fee
  value needed by the card, while UNC explicitly marks 2026-2027 costs
  unavailable. Those colleges keep their period-labeled federal tuition
  records. Each overlay applies only the observations its reviewed artifact
  supports.
- Northwestern uses two independently reviewed, byte-pinned Data Book PDFs
  through metric-level lineage. Its Fall 2025 opening-census degree-seeking
  undergraduate headcount is 9,318; Northwestern marks that snapshot accurate
  as of October 15, 2025 but subject to correction until the Spring IPEDS
  submission. Its Fall 2018 six-year completion value is the exact derived ratio
  1,835 / 1,929 (95.1270088%), calculated from the published cumulative counts
  rather than the PDF's rounded 95% display. Northwestern admission and cost
  remain on the federal baseline, and both replaced federal observations remain
  available as standardized alternates.
- Purdue West Lafayette remains deliberately deferred. Its official
  [Common Data Set page](https://www.purdue.edu/idata/products-services/common-data-set)
  advertises a 2025-2026 workbook, but the linked
  [XLSX artifact](https://www.purdue.edu/idata/wp-content/uploads/2026/04/CDS-2025-2026.xlsx)
  currently returns an HTML anti-automation challenge instead of an OOXML
  workbook to the live verifier. A separately indexed first-party PDF route now
  returns 404. The verifier continues to require the approved MIME type, ZIP
  signature, required OOXML entries, and exact hash, so Purdue is not registered
  until a stable first-party artifact passes those checks. Its period-labeled
  federal admission, enrollment, graduation, and tuition records remain intact.
- Caltech uses two reviewed, byte-pinned first-party pages for its Fall 2025
  undergraduate total of 971 and 2026-2027 tuition plus mandatory annual fees
  of $71,229. Pomona's byte-pinned 2026-2027 tuition page supplies $72,080 in
  tuition plus generally applicable fees. Caltech's Class of 2030 announcement
  publishes only 428 admits, and Pomona's publishes only 876 admits; neither
  includes the matching applicant total needed for a coherent admission row.
  Pomona's current Tableau CDS export is also byte-unstable. Both colleges
  therefore retain the complete Fall 2024 federal admission baseline instead of
  mixing cohorts, while all replaced federal enrollment or tuition values remain
  available as standardized alternates.
- Columbia and the University of Virginia remain deliberately deferred. Their
  newest first-party evidence is split across artifacts with
  different periods or institutional scopes. The overlay pipeline now supports
  metric-level, multi-artifact lineage, but capability alone is not evidence:
  these schools stay on their period-labeled federal baselines until each
  candidate artifact, institution scope, and observation is independently
  reviewed and pinned without overclaiming.
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

Account-synced saves also require the committed `saved_colleges` migration.
Apply it and complete the live anonymous/two-user RLS matrix documented in
`SUPABASE_DATABASE_SETUP.md` before enabling sync on a public deployment.

The production shell enforces a per-request nonce Content Security Policy.
Hydration and generated font blocks receive the matching nonce, scripts cannot
use inline event handlers, framing is denied, and browser Auth connections are
limited to the validated `NEXT_PUBLIC_SUPABASE_URL` origin. Public Supabase
deployments must use an origin-only HTTPS URL; only explicit loopback origins
may use HTTP for local development. See `AUTH_SETUP.md` for the CDN/no-store and
browser verification gates that remain manual once a real project is connected.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server.

## Verification

```bash
npm run typecheck
npm run data:verify-offline
npm test
npm run lint
npm audit --omit=dev
```

The test suite builds the production worker, checks the canonical rendered
routes, and validates cohort uniqueness, observation completeness, source
lineage, all nine UC Fall 2026 headline snapshots, finalized Fall 2025 UC yield,
  all 26 reviewed first-party artifacts and their deliberate exclusions,
transactional refresh rollback, metric ranges, and broad-field evidence labels.

Pull requests and pushes to `main` run the same checks in
`.github/workflows/ci.yml` with the lockfile on Node.js 22. The PR gate is
deliberately network-independent after dependency installation: it validates
the committed overlay schema, generated-release invariants, tests, and build,
but does not regenerate reviewed data from live university sites. It also
fails if those deterministic checks alter a tracked file.

`.github/workflows/live-data-verification.yml` separately checks every pinned
first-party artifact against its approved hash each Monday and on manual
dispatch. A changed or unavailable upstream artifact fails that monitoring run
for human review; it never rewrites or silently approves evidence. Neither
workflow needs repository secrets.

After the first successful GitHub run, protect `main` in the repository
settings and require the **Verify application and committed evidence** status
before merging. Deployment approval and environment protection remain host
configuration rather than repository code.

## Current scope

This milestone ships the discovery, comparison, account-integration foundation,
and transparent preference-matching workspace at `/match`. Match scores use only
the selected fit signals, keep missing evidence out of the denominator, and
never use overall admit rate as a fit signal or admission prediction. Its
selectivity-mix check groups the leading fit in each descriptive historical
rate band without changing the score or calling any college a target or safety. Local
saves remain browser-only while signed out. In a configured deployment, a
currently verified account can maintain a separate list in user-owned,
RLS-protected Supabase rows. Browser-only saves are never uploaded at sign-in;
the student must explicitly import them. UUID-scoped caches, per-college retry
records, and browser account locks keep offline and multi-tab changes separated
by account. Hosted Auth/provider configuration and the live two-user RLS matrix
remain manual launch gates. AI agents and any future personalized admissions-
model work remain later phases and must preserve the app's current evidence
limits.
