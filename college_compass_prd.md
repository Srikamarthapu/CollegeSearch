# CollegeSearch — Product Requirements Document

**Product name:** CollegeSearch
**Product type:** Responsive web application  
**Primary audience:** High-school students applying as first-year college applicants  
**MVP coverage:** 50 verified U.S. four-year colleges, including all nine undergraduate University of California campuses  
**Long-term coverage:** All U.S. four-year colleges supported by reliable public data  
**Status:** Product definition v1.0  
**Owner:** Fern  

---

## 1. Executive summary

CollegeSearch helps high-school students discover, evaluate, and build a balanced list of colleges using reliable public data rather than rankings, rumors, or unexplained recommendations.

A student should be able to arrive with only a possible major, a rough academic profile, and a few preferences. Within five minutes, the student should leave with:

- A short list of colleges worth researching
- A clear explanation of why each college may fit
- Comparable admissions, cost, academic, and outcome data
- A realistic selectivity category for each college
- The source and reporting year behind every important number

The first release combines three products in one experience:

1. **College and major discovery:** Search, filter, inspect, and compare colleges.
2. **Personalized matching:** Complete a preference quiz and receive explainable college matches.
3. **Admissions Chances Explorer:** Compare an academic profile with available admissions data and receive transparent selectivity bands, not fake precision.

Optional accounts allow students to save colleges, comparisons, quiz preferences, and an academic profile. The core experience remains usable without signing in.

AI is not part of the first release. A future grounded assistant will use the same normalized database and source records rather than generating facts from memory or an unrestricted web search.

---

## 2. Product mental model

The product is best understood as **three student tools powered by one evidence system**.

```text
Official federal and university data
                ↓
      Ingestion, validation, lineage
                ↓
     Versioned college evidence layer
                ↓
 ┌────────────────┬─────────────────┬────────────────────┐
 │ Search/Compare │ Preference Match│ Admissions Context │
 └────────────────┴─────────────────┴────────────────────┘
                ↓
       Optional account and saves
                ↓
    Future source-grounded AI assistant
```

### 2.1 Evidence layer

The database is the product’s source of truth. Every number is stored as an observation with a source, definition, cohort, and reporting year. The application never treats a college as one timeless row of numbers.

### 2.2 Discovery layer

Students search by college, major, location, selectivity, cost, graduation rate, enrollment, and outcomes. They can inspect a profile or compare up to four colleges.

### 2.3 Decision layer

The quiz creates a personalized match score based on the student’s stated priorities. The Admissions Chances Explorer separately provides admissions context. A school can be a strong personal match while still being a reach.

### 2.4 Persistence layer

Anonymous students can use the full product and save temporary state in the browser. Optional Supabase accounts synchronize saved colleges and preferences across devices.

### 2.5 Future conversation layer

A future AI assistant will be an interface over the evidence layer. It will retrieve structured rows and source notes, cite them, and explicitly say when information is missing.

---

## 3. Product principles

### 3.1 Evidence before persuasion

No metric appears without a source and reporting year. Missing data is shown as missing, not replaced with an estimate.

### 3.2 Personal fit, not a universal ranking

The product may calculate a **personal match score**, but it must not publish a universal “best colleges” ranking. The same college can rank differently for different students because their priorities differ.

### 3.3 Explain every recommendation

Every match and admissions category must show the factors that produced it. A student should be able to answer, “Why is this school here?”

### 3.4 Major data must be labeled precisely

The interface must clearly distinguish:

- Overall institution admit rate
- Broad-discipline admit rate
- Exact major admit rate
- Program availability
- Degrees recently awarded in a field
- Field-of-study earnings

One category must never be presented as another.

### 3.5 No fake admissions precision

The first release must not output claims such as “You have a 37% chance of admission.” Public data does not capture essays, recommendations, school context, institutional priorities, or the complete application review process. The product will instead return transparent bands with a confidence level and factor breakdown.

### 3.6 Useful without an account

Students should not have to surrender personal information before seeing value.

### 3.7 Beautiful, calm, and trustworthy

The product should feel more polished than a government data portal and more credible than a flashy admissions-marketing site.

---

## 4. Goals and non-goals

### 4.1 MVP goals

1. Publish a verified cohort of 50 four-year colleges, including all nine undergraduate UC campuses.
2. Let students search and filter colleges and majors quickly.
3. Provide clear college profiles with comparable core metrics.
4. Let students compare two to four colleges side by side.
5. Generate personalized, explainable matches from a preference quiz.
6. Provide a transparent Admissions Chances Explorer for first-year applicants.
7. Support optional accounts and saved lists.
8. Attach source, year, cohort, and definition metadata to every important metric.
9. Establish an ingestion architecture that can expand to all U.S. four-year colleges without rebuilding the product.
10. Deploy a production-ready responsive website through Vercel with Supabase as the backend.

### 4.2 Non-goals for the MVP

- Transfer-applicant support
- Exact individual admission probabilities
- AI chat or generated college facts
- Essay review or application editing
- Application submission or deadline management
- Scholarship matching
- Social feeds, student reviews, or messaging
- A universal college ranking
- Native iOS or Android applications
- Full current-course catalogs
- Automatic scraping of data that is not clearly available for public reuse

---

## 5. Target users

### 5.1 Primary user: major-first explorer

A student knows one or two possible majors but does not know which colleges offer strong, affordable, realistic options.

**Job to be done:** “Show me colleges that offer what I want to study and help me understand the tradeoffs.”

### 5.2 Primary user: admissions-focused planner

A student has a college list but does not understand how selective each school is or how their academic profile compares with published information.

**Job to be done:** “Help me build a balanced list without pretending you can predict the decision.”

### 5.3 Primary user: undecided student

A student has preferences about location, campus size, cost, and environment but is unsure about a major.

**Job to be done:** “Help me discover colleges based on what matters to me, even if I am still exploring academically.”

### 5.4 Secondary user: counselor or teacher

A counselor uses the site with students to compare options and explain data limitations.

**Job to be done:** “Give me a source-transparent tool I can trust while advising students.”

---

## 6. Scope and college coverage

### 6.1 Published MVP cohort

The public product will initially expose **50 verified colleges**:

- All nine undergraduate UC campuses
- A representative set of California State University campuses
- California private colleges, including Stanford and other common destinations
- National public universities
- National private universities
- A deliberate range of selectivity, price, size, geography, and institution type

The initial cohort must not consist only of elite institutions. It should include realistic options across multiple admissions bands.

The exact list must live in a configuration file or database table keyed by IPEDS `UNITID`, not in page components. This allows the cohort to be changed after input from the school’s counselors without changing application code.

### 6.2 Staged national foundation

The ingestion pipeline should be capable of loading all four-year institutions into staging tables from the beginning. Only reviewed institutions receive `publication_status = 'published'` in the MVP. Expansion therefore becomes a validation and publishing task rather than a redesign.

### 6.3 Coverage requirements

For all 50 published colleges:

- Name, location, institution type, official website, and enrollment must be available.
- Overall first-year admit rate must be present or explicitly marked unavailable.
- Major evidence must be present for common bachelor’s fields.
- Every Tier 1 metric must show a source and reporting year.
- Any missing or suppressed metric must use a distinct missing-data state rather than displaying zero.

---

## 7. Core information architecture

| Route | Purpose |
|---|---|
| `/` | Landing, universal search, major entry points, and calls to start the quiz |
| `/explore` | Search results, filters, sorting, and result cards |
| `/majors` | Browse and search normalized majors and broad fields |
| `/majors/[slug]` | Major overview and colleges connected to that field |
| `/colleges/[slug]` | Full college profile |
| `/compare` | Side-by-side comparison for two to four colleges |
| `/match` | Preference quiz and personalized results |
| `/chances` | Admissions Chances Explorer |
| `/saved` | Saved colleges and comparisons; prompts for sign-in only when synchronization is needed |
| `/account` | Optional profile and preferences |
| `/methodology` | Definitions, formulas, limitations, and source hierarchy |
| `/data-sources` | Source releases, update dates, and data coverage |
| `/privacy` | Privacy practices and account deletion information |
| `/auth/*` | Sign-up, sign-in, verification, and sign-out |
| `/admin/data-health` | Protected import status, validation issues, and publication controls |

---

## 8. Functional requirements

## 8.1 Landing and discovery

The landing page should immediately communicate the product’s value and provide three starting actions:

- Search a college
- Explore a major
- Find colleges for me

A fourth, visually secondary action should open the Admissions Chances Explorer.

### Required behavior

- The universal search accepts college names, aliases, abbreviations, majors, cities, and states.
- Autocomplete separates colleges from majors.
- Common aliases such as “UCLA,” “UCSD,” “Cal,” and “USC” resolve correctly.
- The page includes a concise trust statement: official data, visible sources, and no guaranteed admissions predictions.
- The page may feature selected colleges or major categories, but it must not imply a ranking.

---

## 8.2 College search and filtering

### Search inputs

Students can search by:

- College name or alias
- Major or broad field
- City or state
- Plain-language combinations such as “computer science in California” when the parser can resolve them safely

### Filters

The MVP should support:

- Major offered or recently evidenced
- State or region
- Public or private control
- Overall admit-rate range
- Average net-price range
- Tuition range
- Undergraduate enrollment range
- Graduation-rate range
- Median-earnings range
- Campus setting
- UC-only shortcut
- Data-completeness toggle

### Sorting

- Personal match, when a quiz profile exists
- Relevance
- College name
- Admit rate
- Net price
- Graduation rate
- Enrollment
- Earnings

### Result-card content

Each card shows:

- College name
- Location
- Public/private type
- Overall admit rate and year
- Average net price and year
- Graduation rate and year
- Undergraduate enrollment
- Major-match state when a major filter is active
- Save and compare controls
- A data-quality indicator when core fields are limited

### Search requirements

- Filters update the URL so results are shareable.
- Applied filters appear as removable chips.
- The mobile experience uses an accessible filter drawer.
- Empty states explain which filters caused the result and offer one-click ways to broaden it.
- Search should tolerate minor misspellings.

---

## 8.3 College profile

The college profile is the main evidence page.

### Header

- Official institution name
- Common aliases
- City and state
- Institution type
- Undergraduate enrollment
- Official website link
- Save and compare actions
- A compact “data updated” label

### Summary metrics

- Overall first-year admit rate
- Average net price
- Graduation rate
- Undergraduate enrollment
- Median earnings with a clearly named measurement window

Each summary metric must display or reveal:

- Reporting year
- Source
- Definition
- Population or cohort
- Missing or suppression status

### Admissions section

- Applicants, admits, enrollees, admit rate, and yield when available
- Five-year trend chart when sufficient historical data exists
- Published SAT/ACT ranges when available
- Published GPA information when available
- Test-policy note when manually verified for the current cycle
- Separate tabs or labels for overall, discipline, and exact-major data
- UC-specific first-year discipline views when available

The interface must never place an overall rate beside a major label in a way that implies it is major-specific.

### Academics and majors section

- Searchable list of normalized bachelor’s fields
- Evidence state for each field:
  - **Verified current offering**
  - **Recent degree completions indicate availability**
  - **Not found in current data**
- Exact program title where available
- Broad field and CIP mapping in the source drawer
- Recent completion count when available
- Field-of-study earnings when available and sufficiently reported

### Cost section

- Published tuition and fees
- Average net price
- Available income-band net price when supported
- Financial-aid indicators where available
- A clear distinction between sticker price and net price

### Outcomes section

- Graduation rate
- Median earnings, with measurement window and cohort
- Field-of-study outcomes when available
- Explicit suppression or missing-data explanations

### Campus section

- Location
- Campus setting
- Enrollment size
- Student demographics where available
- Student-to-faculty ratio where available

### Source panel

Every profile includes a source panel listing:

- Source name
- Release or access date
- Metric years represented on the page
- Data-quality notes
- Links to the original official source when permitted

---

## 8.4 Major explorer

The major explorer lets a student begin with an academic interest rather than a college.

### Major taxonomy

- Use CIP 2020 as the canonical program taxonomy.
- Support broad two-digit fields, intermediate families, and exact six-digit programs.
- Maintain a user-friendly alias layer so “CS,” “computer science,” and related terms resolve to the correct concept.
- Keep UC academic disciplines as a separate mapping layer; do not merge a UC discipline with an exact CIP major.

### Major page

A major page should include:

- Major name and plain-language description
- Related names and narrower programs
- Colleges in the published cohort with evidence for the field
- Overall institution admit rate
- Exact-major or discipline admit rate only when officially published
- Average net price
- Graduation rate
- Field-of-study earnings when available
- A note explaining what “offered” means for each result

### Major admission-rate behavior

The application must follow this order:

1. Show exact major admit data when an official source reports it for first-year applicants.
2. Otherwise show broad-discipline data when an official source reports it, labeled “discipline-level.”
3. Otherwise show the institution’s overall first-year rate, labeled “overall—not major-specific.”
4. Never estimate or reverse-engineer a major admit rate.

---

## 8.5 College comparison

Students can compare two to four colleges.

### Comparison groups

- Admissions
- Academic and major fit
- Cost
- Outcomes
- Campus characteristics
- Data freshness and completeness

### Interaction requirements

- The selected major can be applied across all compared colleges.
- Users can hide groups they do not care about.
- Differences may be highlighted, but green/red color alone must not imply good or bad.
- Metric years remain visible because colleges may have different latest years.
- Missing data stays visible and does not silently remove a row.
- Comparison state is encoded in the URL and can be shared.
- On mobile, use a sticky selector and an accessible horizontal or stacked layout.

---

## 8.6 Preference quiz and personalized matching

The quiz should take roughly three to five minutes and remain skippable.

### Inputs

- Intended major or “undecided”
- Preferred states or regions
- Maximum comfortable annual net price
- Public/private preference
- Preferred enrollment size
- Preferred campus setting
- Importance of graduation rate
- Importance of earnings
- Optional academic profile for admissions bucketing
- Flexibility for each preference

### Matching behavior

The match system first applies true hard constraints, such as a required major. It then computes a personalized fit score from the remaining preferences.

Recommended default weights:

| Component | Default weight |
|---|---:|
| Major fit | 35% |
| Affordability | 25% |
| Location | 15% |
| Graduation outcome | 10% |
| Campus size and setting | 10% |
| Earnings outcome | 5% |

If a component lacks both user input and reliable data, its weight is redistributed rather than treated as zero.

### Match output

- Personal match score from 0 to 100
- Top reasons for the match
- Important tradeoffs
- Missing-data warnings
- Ability to change weights and recalculate
- Results grouped into admissions bands when an academic profile exists:
  - Very High Reach
  - Reach
  - Competitive
  - More Favorable
  - Insufficient Data

Admissions band must not increase a college’s personal fit score. Fit and selectivity are separate concepts.

### Balanced-list view

The match page should encourage a balanced list by showing strong-fit schools across several admissions bands rather than returning only the highest-scoring or least-selective colleges.

---

## 8.7 Admissions Chances Explorer

The feature title may use familiar language such as “Admissions Chances,” but the interface must immediately clarify that it provides **context, not a guaranteed prediction**.

### Inputs

- First-year applicant mode, fixed for the MVP
- Unweighted GPA, when known
- Weighted GPA, optional
- SAT or ACT, optional
- State residency
- Intended major or discipline
- Course-rigor self-description, optional and explanatory only
- Colleges to evaluate

The product must not request ethnicity, disability, citizenship status, family income, date of birth, or other sensitive factors for the estimator.

### Output

For each college:

- Selectivity band
- Confidence level: high, medium, or limited
- Overall admit rate and year
- Academic-profile comparison when published ranges exist
- Major or discipline adjustment when an official comparable rate exists
- Residency adjustment when official data supports it
- A plain-language explanation of the main factors
- A list of important factors the model cannot observe

### Deterministic v1 methodology

1. **Base selectivity band** comes from the college’s overall first-year admit rate.
2. **Academic alignment** compares the student with published GPA and test ranges only when those ranges and current test-policy metadata are available.
3. **Major adjustment** is applied only from an official exact-major or broad-discipline first-year rate from a comparable year and cohort.
4. **Residency adjustment** is applied only from official residency-level data.
5. The result may move no more than one band from the overall-rate baseline based on academic alignment, and no more than one additional band from verified major/residency evidence.
6. The system never labels a college with an overall admit rate below 15% as “More Favorable.”
7. The system never presents a numeric individual probability.

### Suggested baseline bands

| Overall admit rate | Starting band |
|---|---|
| 10% or lower | Very High Reach |
| Above 10% through 25% | Reach |
| Above 25% through 50% | Competitive |
| Above 50% | More Favorable |

These thresholds are product defaults, not claims about an individual decision. They should be editable in configuration and fully documented.

### Confidence rules

- **High:** Current overall rate plus at least two relevant profile dimensions and verified major/residency context.
- **Medium:** Current overall rate plus at least one relevant profile dimension.
- **Limited:** Overall rate only, old data, or material source mismatch.

### Safety and trust requirements

- No celebratory “guaranteed” language.
- No discouraging language such as “do not apply.”
- Always allow the student to inspect the source and logic.
- Display a counselor/admissions-office reminder on limited-confidence results.
- Do not save academic inputs unless the student explicitly chooses to save a profile.

---

## 8.8 Optional accounts and saved data

### Anonymous mode

Without an account, students can:

- Search and compare
- Complete the quiz
- Run the Admissions Chances Explorer
- Save a temporary shortlist and preferences in browser storage

### Account mode

Students may create an account to:

- Synchronize saved colleges
- Save named comparisons
- Save quiz preferences
- Optionally save an academic profile
- Resume across devices

### Authentication

- Use Supabase Auth.
- Prefer email magic link or one-time code for the initial release.
- Google sign-in may be added later.
- Account creation must never block the initial product experience.

### Data merge

When an anonymous user signs in, local saved colleges and comparisons should merge into the account rather than disappear.

---

## 8.9 Methodology and data-transparency pages

The methodology section should explain:

- The difference between overall, discipline, and exact-major admit rates
- Why reporting years differ by metric
- How match scores are calculated
- How admissions bands are calculated
- Why exact probabilities are not shown
- What “major offered” or “recent completions” means
- How suppressed cells are handled
- How data conflicts are resolved
- How frequently each source is checked

The data-sources page should list every imported release and the colleges or metrics it affects.

---

## 8.10 Data administration

A protected data-health page should show:

- Current published release
- Latest successful import per source
- Rows inserted, changed, rejected, and suppressed
- Missing Tier 1 metrics by college
- Source conflicts requiring review
- Institutions awaiting publication
- Validation failures

Publication must be atomic: a failed import cannot partially replace the currently published release.

---

## 9. Data requirements

## 9.1 Tier 1 launch metrics

The following metrics are required for the primary product experience:

1. Overall first-year admit rate
2. Applicants, admits, and enrollees when available
3. Five-year admit-rate trend when available
4. Major or field availability
5. Exact-major or discipline admit rate when officially available
6. Tuition and fees
7. Average net price
8. Graduation rate
9. Undergraduate enrollment
10. Location and institution type
11. Median earnings with measurement window

## 9.2 Tier 2 supporting metrics

Display when reliable and available:

- Financial-aid indicators
- Net price by income band
- SAT/ACT ranges
- Published GPA information
- Test policy
- Campus setting
- Student demographics
- Student-to-faculty ratio
- Completion counts by field
- Field-of-study earnings
- Student debt

Retention rate is not required for the MVP.

## 9.3 Source strategy

### College Scorecard

Use bulk institution-level and field-of-study downloads as the primary national application dataset for cost, completion, admissions, enrollment, earnings, debt, and program-related observations.

### IPEDS

Use IPEDS as the canonical institution registry and source for stable `UNITID`, institutional characteristics, admissions, enrollment, completions, prices, aid, and graduation data. Store historical observations when needed for trends.

### University of California Information Center

Use official UC sources for UC-specific overall, broad-discipline, source-school, and other admissions breakdowns. Freshman discipline data must remain labeled as broad-discipline context and must not be represented as an exact individual-major rate.

UC Tableau data should be imported from officially downloadable crosstab exports and manually reviewed. The pipeline must record the selected dashboard sheet, filters, export date, and source page. Do not claim access to hidden raw data.

### Common Data Set and institution-published sources

Use official institution-published Common Data Set documents and admissions pages to fill carefully selected gaps for the 50-college cohort, especially GPA distributions, test policy, or data not centrally available. Each manually curated field must preserve the source document and year.

## 9.4 Source precedence

Source priority is metric-specific rather than universal.

1. Use the most directly authoritative source for the exact metric and cohort.
2. Prefer an official university-system or institution source for institution-specific granular admissions information.
3. Use College Scorecard or IPEDS for nationally comparable metrics.
4. Use institution-published Common Data Set material for reviewed gaps.
5. Never use an unsourced third-party admissions website for a headline metric.

When two sources disagree, preserve both observations, choose the display value through a documented rule, and surface a conflict for review.

## 9.5 Metric integrity rules

Every observation stores:

- Metric key
- Numeric or text value
- Unit
- Institution
- Reporting year
- Cohort or population
- Applicant type
- Program or discipline dimension, when applicable
- Source record
- Source field name
- Import timestamp
- Status: reported, derived, suppressed, unavailable, or stale

Derived values are permitted only for transparent arithmetic, such as `admits / applicants`, and must be marked derived.

## 9.6 Missing data states

The product distinguishes:

- Not publicly reported
- Not available for this year or cohort
- Suppressed for privacy or small sample size
- Not yet reviewed for the MVP
- Source conflict under review

None of these states should display as `0`.

## 9.7 Major availability states

Because recent completions do not always prove a program is currently accepting students, major evidence should use explicit statuses:

- `verified_current`: confirmed through an official current program source
- `recent_completions`: recent degrees were awarded in the field
- `historical_only`: evidence exists but is older than the freshness threshold
- `not_found`: no evidence in imported sources
- `unknown`: source coverage is insufficient

Search may include `verified_current` and `recent_completions` by default, but the distinction must remain visible.

## 9.8 Freshness

- Check federal data sources at least monthly for a new release; publish only when a release changes.
- Review UC admissions exports after the official dashboards update.
- Review manually curated admissions policies once per application cycle.
- Keep prior releases for reproducibility and rollback.
- Show metric-level reporting years rather than one misleading universal “data year.”

---

## 10. Data model

| Table | Purpose |
|---|---|
| `institutions` | Canonical college record keyed by `UNITID` |
| `institution_aliases` | Abbreviations, former names, and search aliases |
| `institution_publication` | Published/verified status and MVP cohort membership |
| `data_sources` | Publisher, source type, official location, and usage notes |
| `data_releases` | Versioned imports, release dates, hashes, and publication state |
| `source_documents` | Individual CDS files, UC exports, and supporting documents |
| `metric_definitions` | Units, descriptions, display formatting, and comparability rules |
| `metric_observations` | Versioned institution-level measurements with lineage |
| `majors` | CIP-based canonical major taxonomy |
| `major_aliases` | Student-friendly synonyms and search terms |
| `institution_programs` | Major evidence, degree level, completion count, and status |
| `uc_disciplines` | UC-specific broad discipline taxonomy |
| `major_discipline_map` | Mapping between majors and UC disciplines without treating them as identical |
| `admissions_observations` | Applicants, admits, enrollees, rates, cohort, program level, and residency |
| `admissions_profile_ranges` | GPA and test ranges with source and year |
| `admissions_policies` | Current reviewed test and application-policy metadata |
| `profiles` | Optional private student preferences and academic profile |
| `saved_colleges` | User-owned shortlist entries |
| `saved_comparisons` | User-owned named comparisons |
| `match_profiles` | Saved quiz preferences and weights |
| `data_quality_issues` | Validation errors, warnings, and review status |
| `import_logs` | Source import outcomes and rejected-row details |

### Important constraints

- `institutions.unitid` is unique.
- Admissions counts must satisfy `applicants >= admits >= enrollees` when all are present.
- Rates must be between 0 and 1 internally.
- Monetary values must be non-negative.
- Exact-major and discipline observations require an explicit `granularity` field.
- User-owned tables require Supabase Row Level Security.

---

## 11. Technical architecture

## 11.1 Stack

- **Frontend and server:** Next.js App Router with TypeScript
- **Styling:** Tailwind CSS and a documented token system
- **Core components:** shadcn/ui
- **Enhanced components:** Magic UI, 21st.dev components, and previously saved GitHub design-asset libraries when appropriate
- **Database:** Supabase Postgres
- **Authentication:** Supabase Auth
- **Authorization:** Supabase Row Level Security
- **Deployment:** Vercel
- **Validation:** Zod or equivalent schema validation
- **Charts:** shadcn-compatible Recharts components or an equivalent accessible chart library
- **Tables:** TanStack Table through a consistent shadcn implementation when needed
- **Testing:** Vitest, React Testing Library, Playwright, and accessibility checks

## 11.2 Application structure

```text
app/
  (marketing)/
  explore/
  majors/
  colleges/[slug]/
  compare/
  match/
  chances/
  saved/
  account/
  methodology/
  data-sources/
  admin/data-health/
components/
  ui/
  college/
  admissions/
  compare/
  match/
  charts/
lib/
  data/
  search/
  matching/
  admissions-context/
  supabase/
  validation/
  analytics/
scripts/
  import-scorecard/
  import-ipeds/
  import-uc/
  validate-data/
  publish-release/
supabase/
  migrations/
  seed/
```

## 11.3 Data ingestion pipeline

```text
Official download
      ↓
Immutable raw file + checksum
      ↓
Source-specific staging table
      ↓
Schema and range validation
      ↓
Normalization to UNITID/CIP
      ↓
Conflict and completeness checks
      ↓
Human review for flagged records
      ↓
Atomic publication of a data release
```

Required scripts:

- `import-scorecard`
- `import-ipeds`
- `import-uc-crosstab`
- `import-manual-source`
- `validate-data`
- `report-coverage`
- `publish-release`
- `rollback-release`

All imports must be idempotent.

## 11.4 Search

Use Postgres full-text search and `pg_trgm` for the first release. Index institution names, aliases, cities, states, majors, and major aliases. Do not add a paid external search service until the national dataset and traffic require it.

## 11.5 Rendering and caching

- Render college profiles on the server.
- Cache public profile and major queries by data-release version.
- Invalidate tagged caches after a successful publication.
- Keep search and matching dynamic.
- Do not call federal or UC sources directly from the browser during normal use.

## 11.6 Authentication and user data

- Use cookie-based Supabase sessions with Next.js.
- Keep the service-role key server-only.
- Apply RLS to every user-owned table.
- Anonymous local data should merge on sign-in.

## 11.7 Deployment

- GitHub is the source of truth for code.
- Vercel provides production and preview deployments.
- Supabase hosts Postgres and authentication.
- Environment variables are separated for local, preview, and production environments.
- Database migrations run before production publication.

---

## 12. Design and UX requirements

## 12.1 Visual direction

The design should combine the seriousness of a modern data product with the friendliness of a student-facing educational tool.

Desired qualities:

- Trustworthy
- Clear
- Modern
- Approachable
- Calm
- Data-rich without feeling crowded

Avoid:

- A generic gradient-heavy “AI app” appearance
- Excessive glassmorphism
- Decorative motion that slows research
- Dense government-dashboard styling
- A collage of components that visibly come from unrelated libraries
- Unexplained badges or scores

## 12.2 Design resources

Use the following when they improve the experience:

- UI/UX Pro Max skill for information architecture, interaction review, responsive behavior, and visual hierarchy
- shadcn/ui as the base component language
- Magic UI for restrained, high-value motion or presentation
- 21st.dev components where they fit the established system
- Previously saved GitHub design-asset libraries available to the project

Every imported component must be adapted to the same spacing, typography, radius, color, interaction, and accessibility tokens. License and attribution requirements must be reviewed before use.

## 12.3 Core design patterns

- Global search with grouped autocomplete
- Metric cards with visible year labels
- Source drawers or popovers
- Sparklines and simple trend charts
- Sticky compare controls
- Filter chips
- Explainable score breakdowns
- Clear empty and missing-data states
- Skeleton loading states that match final layout

## 12.4 Responsive requirements

- All core flows work at 320px width and above.
- No essential metric requires hover.
- Charts have a text/table alternative.
- Comparison remains usable on a phone.
- Filters are keyboard accessible.
- Tap targets meet accessible sizing expectations.

## 12.5 Accessibility

Target WCAG 2.2 AA.

- Full keyboard operation
- Visible focus states
- Correct landmarks and headings
- Form labels and error descriptions
- Sufficient contrast
- Reduced-motion support
- No reliance on color alone
- Screen-reader descriptions for charts and match scores
- Automated and manual accessibility testing before launch

---

## 13. Privacy, security, and responsible use

### Privacy

- Collect the minimum personal data necessary.
- Do not require date of birth or high-school name.
- Do not store academic inputs unless the student explicitly saves a profile.
- Do not send GPA or test scores to analytics.
- Provide account and saved-data deletion.
- Publish a plain-language privacy notice suitable for students.

### Security

- Use RLS for all user-owned records.
- Keep privileged keys server-side.
- Validate all inputs.
- Rate-limit authentication and computational endpoints.
- Use secure headers and content-security policy.
- Sanitize imported text.
- Maintain dependency scanning and lockfile review.

### Responsible admissions guidance

- No guarantees.
- No “do not apply” recommendations.
- No use of protected characteristics in admissions estimates.
- No hidden use of student data for model training.
- Prominent methodology and limitations.

---

## 14. Analytics and product success

Analytics must be privacy-conscious and must not include academic-profile values.

### Core events

- Search submitted
- Filter applied
- College profile viewed
- Source detail opened
- College saved
- Comparison created
- Quiz completed
- Match weight changed
- Admissions context completed
- Account created

### MVP success measures

1. At least 90% of usability-test participants can find and compare three relevant colleges without assistance.
2. At least 80% can correctly distinguish an overall admit rate from a major or discipline rate after using the product.
3. A typical student can create a shortlist within five minutes.
4. Every displayed Tier 1 metric has a source and year.
5. At least 45 of the initial 50 colleges meet the Tier 1 completeness threshold; the rest have explicit gaps.
6. Search returns useful results for common aliases and major synonyms.
7. No critical accessibility or data-integrity defects remain at launch.

---

## 15. Testing and quality assurance

### Unit tests

- Source-field transformations
- Rate calculations
- Major alias resolution
- Match-score components
- Admissions-band shifts
- Confidence rules
- Missing and suppression states

### Data tests

- Unique `UNITID`
- Valid CIP formats
- Admissions count consistency
- Rates within range
- Non-negative cost values
- Valid reporting years
- No exact-major label on discipline data
- No stale manual policy presented as current
- Core-metric coverage report for published institutions

### Integration tests

- Search with combined filters
- Major-to-college lookup
- Profile source resolution
- Compare URL sharing
- Local-save to account merge
- RLS isolation between users
- Atomic data release publication

### End-to-end tests

- Search and save a college
- Compare four colleges
- Complete a quiz and adjust weights
- Run the Admissions Chances Explorer
- Sign up and recover anonymous saves
- Inspect a metric source
- Delete an account

### Accessibility and visual QA

- Automated accessibility checks
- Keyboard-only walkthrough
- Screen-reader review of major flows
- Reduced-motion review
- Mobile, tablet, and desktop visual checks
- No overflow in compare tables or charts

---

## 16. Acceptance criteria by feature

| Feature | Launch acceptance criteria |
|---|---|
| Data foundation | 50 colleges published; every Tier 1 value has lineage; failed imports cannot corrupt the live release |
| Search | College and major aliases work; filters are shareable; common queries return in under one second under normal load |
| College profile | Admissions, academics, cost, outcomes, and sources render correctly; missing data is explicit |
| Major explorer | Major results distinguish verified offering, recent completions, overall rate, discipline rate, and exact-major rate |
| Compare | Two to four colleges can be compared and shared; years and missing values remain visible |
| Match quiz | Results include score, reasons, tradeoffs, and editable weights; selectivity is shown separately |
| Admissions Chances Explorer | Produces bands, confidence, and explanations; never outputs exact individual odds or guarantees |
| Accounts | Account is optional; saves synchronize; local state merges; RLS prevents cross-user access |
| Accessibility | Core flows satisfy WCAG 2.2 AA checks and keyboard testing |
| Deployment | Production and preview deployments work on Vercel; environment separation and rollback are documented |

---

## 17. Delivery phases

### Phase 0 — Product and data audit

- Finalize working name and brand direction
- Select the configurable 50-college cohort
- Audit exact fields in Scorecard, IPEDS, UC exports, and selected institution sources
- Finalize metric definitions and source precedence

### Phase 1 — Evidence foundation

- Create Supabase schema and migrations
- Build raw, staging, normalized, and publication layers
- Implement Scorecard and IPEDS imports
- Seed CIP taxonomy and major aliases
- Import and review UC data
- Produce data-health report

### Phase 2 — Discovery product

- Build landing page
- Build search, filters, and result cards
- Build college profiles
- Build major explorer
- Build comparison
- Build methodology and data-source pages

### Phase 3 — Personalized matching

- Build preference quiz
- Implement weighted fit calculation
- Add explainable match results
- Add balanced-list grouping

### Phase 4 — Admissions Chances Explorer

- Curate current admissions profile and policy data for the initial cohort
- Implement deterministic band logic
- Add factor and confidence explanations
- Test for misleading edge cases

### Phase 5 — Accounts and saves

- Add Supabase Auth
- Add RLS policies
- Add saved colleges, comparisons, preferences, and optional academic profile
- Add anonymous-to-account merge

### Phase 6 — Quality and launch

- Complete responsive polish using the approved component resources
- Run accessibility, security, data, and performance tests
- Complete counselor/student usability testing
- Deploy to Vercel
- Publish limitations and update process

---

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Exact major admit rates are rarely available | Show official exact rates only; otherwise label discipline or overall data clearly |
| UC Tableau exports are fragile or filtered | Use reviewed crosstab imports, preserve filter metadata, and keep source files |
| Different metrics refer to different years | Store metric-level years and show them beside values |
| “Major offered” is inferred from completions | Use evidence states and manually verify high-priority fields |
| Admissions estimates mislead students | Use bands, confidence, factor explanations, and no numeric probability |
| The initial cohort is biased toward elite schools | Require range across selectivity, cost, institution type, and geography |
| Mixing component libraries creates an inconsistent design | Establish tokens first and require every imported component to conform |
| User academic data creates privacy risk | Keep anonymous by default, minimize stored fields, and never send inputs to analytics |
| Source updates break transformations | Version raw files, validate schemas, run tests, and publish atomically |
| Earnings data is missing or suppressed | Show measurement window and explicit missing/suppression states |

---

## 19. Future roadmap

### Coverage expansion

- Expand from 50 verified colleges to all U.S. four-year colleges
- Add review queues and automated completeness scoring
- Add counselor-requested institutions first

### Transfer mode

- Separate first-year and transfer profiles, filters, admissions data, and chance logic
- Use official transfer-major information where available

### Grounded AI assistant

The future assistant should answer questions such as:

- “Which California colleges offer computer science under my budget?”
- “Why did this school rank highly for me?”
- “Compare UC Irvine and UC San Diego for biology.”

It must:

- Retrieve from the normalized database
- Cite source and reporting year
- Distinguish structured facts from qualitative guidance
- Refuse to invent missing metrics
- Never use unrestricted generation as the factual source

Structured queries should use SQL or typed retrieval. Vector search is only needed for narrative source documents and methodology text.

### Additional features

- Counselor workspace
- Shareable college lists
- Scholarship and aid search
- Application deadlines from official sources
- Deeper program outcomes
- Career-interest exploration
- School-specific curated collections

---

## 20. Definition of done

The MVP is complete when:

1. A student can use the product without an account.
2. At least 50 verified colleges are published, including all nine undergraduate UC campuses.
3. The student can search by college or major, filter results, inspect profiles, and compare up to four colleges.
4. The quiz returns explainable personalized matches and a balanced list.
5. The Admissions Chances Explorer returns transparent bands and confidence without exact probabilities.
6. Optional accounts save colleges, comparisons, and preferences securely.
7. Every Tier 1 metric has a source, year, definition, and cohort.
8. Major, discipline, and overall admissions data are never mislabeled.
9. Data imports are repeatable, validated, versioned, and reversible.
10. Core flows pass accessibility, security, data-integrity, and end-to-end tests.
11. The production site is deployed on Vercel and backed by Supabase.
12. Setup, data ingestion, methodology, limitations, and deployment are fully documented.

---

## 21. Product assumptions that are not blockers

- The exact 50-college list can be adjusted after consulting students or counselors; the product architecture does not depend on the names.
- The working title is temporary.
- Email magic-link or one-time-code authentication is the default account method.
- The first release uses admissions context bands rather than numeric probabilities.
- AI remains outside the MVP, but the data and query architecture must be ready for it.
- Vercel is the production hosting target and Supabase is the backend system of record.
