# CollegeSearch expansion progress

## October 4, 2026 — M0 planning

Goal: 100+ verified colleges, Supabase structured/hybrid retrieval, a free NVIDIA-hosted NIM conversational adviser, private history, measured usage controls, and final design/release audit. Stripe/AI Plus is deferred by the user's latest instruction.

Active checkout: `/Users/kamarthapusri/Projects/CollegeSearch`, branch `codex/production-foundation`, baseline `dfc4b8a`. External-drive checkout is older and untouched.

Completed:
- Read the full supplied objective and incorporated subsequent free-only direction.
- Inspected current catalog, app routes/auth, live database schema/policies/migration history, and hosting configuration.
- Confirmed 50 distinct institutions, fixed saved-college DB allowlist, source/period/definition-aware federal and reviewed institutional evidence.
- Live DB count at inspection: 0 accounts / 0 saved rows; no vector extension. Preserve all user data during migration regardless of baseline count.
- Confirmed Vercel Pro already in use, Supabase Free; no NVIDIA configuration in hosted environment.
- Wrote implementation plan and requirement-by-requirement acceptance ledger before edits.

Checks / findings:
- Initial npm audit: 15 advisories (1 critical, 10 high, 4 moderate); remediate relevant dependencies and verify.
- Existing system Supabase binary exits 137; `npx supabase@2.119.0 --version` works. Docker is available; do not touch unrelated running project containers.
- NVIDIA hosted API trial forbids production use; a free real-user app does not remove this gate.
- Current Stripe connector exposes a different sandbox; user chose a separate sandbox and then deferred all Stripe work. No billing objects/config were changed.

Next:
1. Remediate dependency findings with targeted compatible updates and verify builds/tests.
2. Implement reviewed catalog manifest and expand/import >=100 verified institutions.
3. Rehearse additive database schema and identity-preserving catalog migration in isolated local DB.
4. Build retrieval/adviser interfaces and tests; run live NVIDIA evaluation once a key is securely configured.

Open dependencies (not a reason to stop independent work): NVIDIA evaluation key, model/embedding selection after measurement, and public-production permission. Numeric free allowance will follow evaluation. Milestone M0 closed after the checks below passed; M1 catalog expansion is authorized to proceed.

M0 verification progress:
- Supabase security advisor returned no findings for the existing hosted schema.
- Isolated PostgreSQL 17.6 container `collegesearch-goal-db-20261004` is running without a published port or network. pgvector 0.8.2 is available. No unrelated Docker services were changed.
- Applied the existing saved-college migrations to that isolated database. Auth claim helpers in the image predate current Supabase; local fixtures were aligned to the hosted `auth.uid()`/`auth.jwt()` definitions before testing.
- Real SQL role tests passed: owner insert/read, other-user insert/read/delete denial, unknown institution rejection, revoked/missing session denial, anonymous denial, and retained saved row. Fixtures rolled back. Logs: `work/m0-saved-rls.log`; this is database policy evidence, not a hosted Auth browser test.
- User will add NVIDIA key later. Created ignored mode-600 `.env.local` with empty `NVIDIA_API_KEY=`; no key received. Live model/embedding evaluation remains pending, independent implementation continues.
- Dependency remediation is assigned to `billing_implementation_plan` agent (reassigned after Stripe deferral); owns only package manifests and diagnostics. Catalog implementation waits for M0 foundation checks; its audit is in `work/catalog-expansion-audit.md`.

## M0 exit — foundation verified

- Compatible Next/ESLint and Cloudflare tooling updates applied; targeted URI/brace-expansion overrides retained. Production dependency audit: zero findings. Eight development audit entries remain from one unpatched `braces@3.0.3` advisory; no unsafe major downgrade taken.
- Typecheck, Next/Vercel build, Vinext build, lint, all 336 tests, and diff whitespace checks passed. Existing saved-college SQL ownership/session checks also passed in the isolated database.
- Full disposition: `M0_FOUNDATION_RESULTS.md`; raw logs remain under ignored `work/m0-*`.
- Remaining issues: unpatched development advisory, external lockfile build warning, unavailable NVIDIA key/live evaluation/production permission. Changes are local, not yet deployed.
- Next milestone: M1 reviewed 100-college manifest, official import, regional identity fixes, profile/action/brand fallbacks, and data regression checks. Existing IDs/slugs and source semantics must remain stable.

## M1 in progress — catalog and evidence

- Official Scorecard data page still links the June 10, 2026 institution archive; archive hash matches the published release. Resolved 50 additions against actual source rows: 12 CSU, 15 major public, 13 regional public, 10 private nonprofit. All are unique current main-campus U.S. institutions. Candidate evidence is in ignored `work/college-catalog-candidates.json`; reviewed manifest/import in progress.
- Preserved original 50 UNITID/slug pairs in `tests/fixtures/original-college-identities.json` for a regression boundary independent of the expanding manifest.
- Generalized app collection copy and route/matching assertions. Runtime evidence checks now reject wrong units/status, invalid dates, unregistered/mismatched source references, negative/out-of-range/fractional-count values and duplicate slugs. Meaningful corruption and honest-missing-data tests pass (4 focused tests).
- Native Next type generation followed by typecheck passes. Running Vinext after Next replaces generated route declarations, so regenerate native types before standalone Next typechecking; this is a generated-artifact ordering issue, not an app-source failure.
- New-college official action-link review and sourced-logo fallbacks are in progress. No expanded data has been published to the live app/database.

M1 semantic corrections found during review:
- Federal `TUITIONFEE_IN` is documented as in-district; institutional resident tuition remains distinct. Private profiles/comparison now use one published standard tuition amount, with direct source links in comparison. Tuition excludes living costs; source-aware labels and visible context preserve that distinction.
- Scorecard two-digit CIP distance flags aggregate at least one detailed program. Correcting previous copy that incorrectly implied an entire broad field was online-only; preserve online-offering evidence on mobile comparisons without excluding possible campus options.
- Current usage snapshot: 35% remaining (account-wide; concurrent work can contribute). No reset used.

## M1 data exit — proceed to database integration

Catalog import and source audit complete at 100 institutions. Both builds/typecheck/lint pass; browser core flows and 320/390px checks pass. Full suite: 350/351, with the single expected integration failure at the existing fixed 50-ID database save constraint. `M1_CATALOG_RESULTS.md` records evidence and remaining issues before M2. Resource-link agent is finishing independent official-link verification; unverified destinations remain unavailable. No expanded app deployment before M2 fixes the saved-college constraint and retests it.
