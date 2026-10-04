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
