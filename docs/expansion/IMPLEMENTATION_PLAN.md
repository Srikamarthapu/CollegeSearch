# CollegeSearch catalog and free adviser implementation plan

Prepared October 4, 2026, before implementation. This plan follows the supplied goal and the user's subsequent instruction: **put Stripe aside, keep the app free, and use NVIDIA-hosted NIM models.** Stripe, AI Plus, checkout, subscriptions, and real charges are deferred, not launch requirements for this iteration. The catalog, evidence, conversational adviser, privacy, usage controls, and final design audit remain in scope.

## Verified starting point

- The active source is the latest deployed checkout at `codex/production-foundation`, starting commit `dfc4b8a`. The mounted external-drive checkout is older (`c1ee730`) and will remain untouched.
- Next.js 16.3.5, React 19, Supabase Auth/Postgres, and Vercel are implemented. Preserve the campus-pin branding, blue/navy palette, responsive explorer, comparison, source profiles, and unified My colleges workspace.
- The published JSON contains 50 colleges and 50 unique UNITIDs/slugs: 34 public and 16 private nonprofit; 32 West, 7 Northeast, 6 Midwest, and 5 South. California accounts for 27. This is a curated collection, not nationwide coverage.
- The repeatable federal/UC import pipeline already retains observation-specific sources, periods, cohorts, definitions, source hashes, missing values, and reviewed institutional overlays. Current catalog IDs and aliases are split across scripts; counts and some assertions assume exactly 50.
- The live CollegeSearch Supabase project is healthy on the Free plan. It has only `public.saved_colleges`, protected by owner RLS and a restrictive active-session policy. A read-only October 4 inspection found zero accounts and zero saved rows. Preserve all existing and newly arriving accounts/saves regardless of this initial count. The database contains an explicit 50-ID check constraint; vector search is not installed.
- The current Vercel team is already on Pro. Production environment names show Supabase configuration only; no adviser/model/Stripe credentials are configured. No secret values were printed or copied into this plan.
- Research notebooks and tracked dates are browser-local, separate for guests and verified accounts. Adding chat history must not silently upload those records.
- No AI chat, model calls, vector retrieval, AI quotas, or billing currently exists. An initial dependency audit reports 15 advisories (1 critical, 10 high, 4 moderate), including a patch available for Next. These are findings to assess and remediate, not proof of a reachable exploit.

## Architecture and database changes

### Catalog and evidence

Create a reviewed catalog manifest keyed by IPEDS UNITID, recording canonical campus identity, stable slug, curated aliases, inclusion rationale, and selection category. Retain every existing ID and slug. Expand to at least 100 verified U.S. institutions with a substantial mix of public flagships, remaining practical CSU/regional options, and private institutions across regions and admission-rate bands. Use source identities and campus metadata to validate each candidate; never infer identity from a similar name.

Keep the current committed dataset as the public app's reproducible release artifact and use the same release to populate Supabase. Browsing should remain functional if the adviser or database is unavailable. The importer will derive the cohort from the manifest, validate the exact intended set, preserve source lineage, and fail before publication on duplicates, missing identities, unsupported values, or unreviewed changed overrides. New institutions use supported federal observations until an official institution-specific source has been reviewed; missing program-level admit rates remain missing.

Add tables, without replacing existing Auth or saved-college data:

| Table | Purpose / access |
|---|---|
| `college_catalog` | Stable UNITID identity, campus, location, ownership, setting, published release, inclusion rationale. Public read for published records; server-managed writes. |
| `college_sources` | Source URL, publisher, checked date, reporting period, artifact/content hash, locator, verification status and review notes. Public read for published evidence. |
| `college_facts` | Institution-linked exact values with measure, unit, population, definition, period, status and source reference. Query numeric filters with SQL, not vector similarity. |
| `college_passages` | Institution-linked descriptive/program evidence, source locator, period, content hash, keyword index and model-versioned embedding. Never mix student content into this table. |
| `adviser_conversations` / `adviser_messages` | Owner-scoped personal history, retrieval/citation references, timestamps and retention expiry. Require a verified non-anonymous account and an active session. |
| `adviser_usage_periods` / `adviser_requests` | Server-enforced free allowance, atomic reservations, idempotency and content-free token/latency records. Users may read their own allowance; cannot grant themselves quota. |

Seed `college_catalog` with all old identities before replacing the fixed saved-college check with a foreign key. Validate old rows first, apply changes transactionally, and compare account/save counts before and after. Do not reset the database or recreate Auth. Verify migrations against an isolated local Postgres/Supabase-compatible database, then apply reviewed additive changes to the existing project. Preserve the existing active-session function and saved-list mutation behavior.

### Retrieval and answer generation

Use structured queries for exact facts, tuition residency, cost definitions, numeric filters, and comparisons. Combine Postgres full-text search and pgvector similarity for descriptive passages with reciprocal-rank fusion, following [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search). Every retrieved item carries UNITID, source identity, reporting period, applicable population, verification state and citation locator. Filter unpublished, conflicting or unusably stale evidence according to explicit source policies.

The adviser extracts student preferences, asks useful missing questions, retrieves evidence, and produces schema-validated responses. Model selection and answer selection cannot invent IDs, URLs, statistics, admission odds or unsupported programs. Profile links, exact values, reporting labels and source links render from validated records. Explanations must refer to the evidence and state trade-offs; when facts are missing, ask or say so. Test cross-college contamination, unsupported majors, personal-chance questions, affordability questions, conflicting sources, prompt injection, and follow-up refinements.

The conversation provides Open profile, Save college and Compare actions using existing identifiers and tools. Saving requires an intentional click. Keep comparison URLs limited to college IDs; do not put student information in URLs.

### NVIDIA, limits and privacy

Implement a server-only NVIDIA-hosted NIM adapter with configurable chat/embedding models, endpoint allowlisting, request/output caps, explicit timeouts, cancellation, bounded retries and helpful failures. Keep keys out of browser bundles, logs and repository history. Evaluate a small set of currently available models with the same representative student questions and evidence; record actual latency, token use, citation accuracy, instruction following and failure behavior before selecting the default and setting the allowance.

The NVIDIA API Catalog hosted service is a trial for testing/evaluation. Its [API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf) prohibit production use; the [NIM FAQ](https://docs.api.nvidia.com/nim/docs/product) includes service to real end users in its definition of production, even when the app is free. A free API key therefore does not establish public-production permission. Build and evaluate the hosted integration, but keep public activation behind verified production permission. Do not silently switch to a paid provider or buy a license. This gate remains explicit until the owner supplies appropriate permission or changes the provider requirement.

All features remain free. Use an authenticated monthly free allowance, shown with remaining requests and UTC reset date. The final number follows measurements, provider limits and abuse testing; no unlimited promise. Reserve capacity atomically before inference, commit once after successful persistence, release failed requests, expire abandoned reservations, and enforce per-account concurrency and overall provider budgets. Hitting a limit preserves the draft/history and leaves browsing, filtering, profiles, comparisons and ordinary saves usable.

Personal history requires an account. Proposed default: delete inactive conversation content after 90 days, with immediate per-conversation / all-history deletion and account-deletion cascading; document the exact implemented behavior and test it. Explain that adviser messages, bounded prior chat turns and relevant public evidence go to NVIDIA. Do not automatically send browser notebooks, activities, GPA, account email, or saved lists. Minimize unnecessary identifiers and prompt logging. Use a clear consent step before the first AI request and a visible history/deletion control.

## Milestones and exit evidence

| Milestone | Work | Must prove before moving on |
|---|---|---|
| M0 — Plan and safe foundation | Record current source/DB/service state, preserve old IDs, remediate relevant dependency advisories, establish local DB test environment. | Plan saved first; clean baseline/rollback reference; dependency findings disposition; build/type/lint and appropriate regression checks. |
| M1 — Verified 100+ catalog | Reviewed manifest, balanced additions, reproducible import, source/period semantics, honest missing/conflicting values, generalized tests/copy. | At least 100 unique verified U.S. UNITIDs; existing 50 IDs/slugs preserved; every displayed fact supported by source artifact/field; cohort/duplicate/range/staleness/broken-link checks; profiles and comparisons render correctly. |
| M2 — Database and retrieval | Add/seed catalog/evidence/passages; replace fixed saved-ID check safely; hybrid retrieval and exact query path. | Migration rehearsal plus live verification; saved-account preservation; public read/private writes; representative retrieval test set; institution/source boundaries proven. |
| M3 — Free conversational adviser | NIM adapter/evaluation, account-only chats, useful follow-ups, grounded recommendations and actions, allowance and deletion UI. | Real provider evaluation and selected model; factual/citation rubric; failure/timeout/retry behavior; usage races/idempotency; two-user RLS/isolation; account deletion and retention; browse tools never paywalled. |
| M4 — Design, accessibility and release | Screenshot-first product/design audit, improve issues, responsive/keyboard/error-state verification, operational documentation and deployment. | Desktop/mobile end-to-end tests; near-end audit ledger with each issue disposition; verified hosted behavior; production-permission and privacy gates explicitly resolved before public AI activation. |

Each milestone ends with a dated test summary and remaining-issues list in `PROGRESS.md`. `ACCEPTANCE.md` tracks the full objective; passing one suite does not establish overall completion. A missing key or external permission can leave a milestone incomplete while independent implementation continues.

## Costs and unresolved decisions

| Item | Current estimate / decision |
|---|---|
| Public college data | Federal public downloads require no API key or data purchase; normal hosting/bandwidth still applies. |
| Supabase | Existing project is Free. No new paid project or branch is planned. Free has a 500 MB database limit; track passage/vector/history size. [Pro starts at $25/month](https://supabase.com/pricing), with additional project compute possible; do not upgrade automatically. |
| Vercel | Existing team already uses Pro. [Published Pro base is $20/month plus usage](https://vercel.com/pricing); incremental project cost depends on shared usage. No plan change is needed now. |
| NVIDIA hosted trial | Trial availability/credits are not a production SLA or production-use license. No paid inference or self-hosted GPU expense is authorized. Record measured token/latency usage; confirm the account's actual trial quota. |
| Stripe / AI Plus | Deferred by explicit October 4 instruction. No products, checkout, portal, webhooks, subscription entitlements or real charges will be added in this iteration. |

Open dependencies: configure a project-scoped NVIDIA key securely for evaluation; confirm currently available model/embedding IDs and actual trial limits; resolve hosted production permission before public adviser activation. Proposed retention and allowance defaults must be clearly reflected in the product and can be adjusted without a schema rewrite. Existing email-delivery/account onboarding readiness and known dependency findings must be rechecked for the final release; a working demo alone is not proof of readiness.

## Execution rules

Use the latest local checkout and existing production-foundation branch; do not modify the older external-drive checkout. Keep secrets in ignored environment files/host settings. Commit source and concise evidence, not private user content or secret-bearing logs. Stage schema and catalog changes so previous saves remain valid throughout. The final audit must cover every non-deferred requirement, not just the features easiest to test.
