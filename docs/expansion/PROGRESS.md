# CollegeSearch expansion progress

## Current milestone — M9, October 4, 2026

The live catalog retains **3,912** source-audited institutions, 38 broad fields, and 3,094 sourced college marks. Original 100 identities are preserved. M8 was committed/pushed as `0058565` and deployed READY. M9 simplifies filters, defaults to familiar featured colleges, fixes delayed-pagination and failed-search stale-result bugs, and restores a visible adviser entry with honest availability. All 465 tests passed; the final native Next build, TypeScript and ESLint passed after the error-state repair. Local desktop/mobile, delayed-response and failure/retry checks passed. M9 deployment is pending. See [M9 explorer review](M9_EXPLORER_REVIEW.md), [M8 adviser validation](M8_ADVISER_VALIDATION.md) and [M7 catalog/release evidence](M7_PROGRESS.md).

M8 evaluated actual runtime retrieval and a predeclared 21-question keyword/vector/hybrid benchmark. Vector/hybrid returned a relevant top-five passage for 17/18 supported questions; that is not answer accuracy. Initial provider runs exposed real relevance errors; the final focused replay passed all ten selected cases, five unknown/topic boundaries and two complete named comparisons. The full 32-case final matrix was not rerun. The disposable embedded database was removed, preserving the baseline and all hosted records.

Public AI and hosted embeddings remain disabled because NVIDIA's API Catalog trial does not permit production use. Production provider permission/allowance, broader human-reviewed quality, hosted account/email journeys and an observed scheduled retention firing remain open. Stripe remains deferred. Only the authorized October 4 reset was applied by the user; other resets were untouched. Older sections below are historical snapshots, including their then-current counts and pending work.

## October 4, 2026 — M0 planning

The M0/M1 sections below preserve their milestone-time notes. The current M1–M4 closeout and remaining release gates are recorded at the end; that closeout supersedes earlier `pending` and `in progress` wording.

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

## M1 implementation snapshot — catalog and evidence (historical)

- Official Scorecard data page still links the June 10, 2026 institution archive; archive hash matches the published release. Resolved 50 additions against actual source rows: 12 CSU, 15 major public, 13 regional public, 10 private nonprofit. All are unique current main-campus U.S. institutions. Candidate evidence is in ignored `work/college-catalog-candidates.json`; reviewed manifest/import in progress.
- Preserved original 50 UNITID/slug pairs in `tests/fixtures/original-college-identities.json` for a regression boundary independent of the expanding manifest.
- Generalized app collection copy and route/matching assertions. Runtime evidence checks now reject wrong units/status, invalid dates, unregistered/mismatched source references, negative/out-of-range/fractional-count values and duplicate slugs. Meaningful corruption and honest-missing-data tests pass (4 focused tests).
- Native Next type generation followed by typecheck passes. Running Vinext after Next replaces generated route declarations, so regenerate native types before standalone Next typechecking; this is a generated-artifact ordering issue, not an app-source failure.
- New-college official action-link review and sourced-logo fallbacks are in progress. No expanded data has been published to the live app/database.

M1 semantic corrections found during review:
- Federal `TUITIONFEE_IN` is documented as in-district; institutional resident tuition remains distinct. Private profiles/comparison now use one published standard tuition amount, with direct source links in comparison. Tuition excludes living costs; source-aware labels and visible context preserve that distinction.
- Scorecard two-digit CIP distance flags aggregate at least one detailed program. Correcting previous copy that incorrectly implied an entire broad field was online-only; preserve online-offering evidence on mobile comparisons without excluding possible campus options.
- At this review, usage was 35% remaining (account-wide; concurrent work can contribute). No reset used; the latest snapshot is recorded in the closeout below.

## M1 first exit snapshot — pre-M2 (historical)

Catalog import and source audit complete at 100 institutions. Both builds/typecheck/lint pass; browser core flows and 320/390px checks pass. Full suite: 350/351, with the single expected integration failure at the existing fixed 50-ID database save constraint. `M1_CATALOG_RESULTS.md` records evidence and remaining issues before M2. Resource-link agent is finishing independent official-link verification; unverified destinations remain unavailable. No expanded app deployment before M2 fixes the saved-college constraint and retests it.

The 350/351 result was captured before M2 replaced the fixed-ID constraint. It is superseded by the latest 394/394 suite and the M2 SQL results below. Official resource review and expanded data verification have since completed; unavailable links remain explicitly unavailable.

## October 4, 2026 — M1–M4 closeout and release status

**M1 — reviewed 100-college catalog.** The release evidence identified as `eff0e19` contains 100 unique current U.S. main-campus institutions, preserves the original 50 UNITIDs/slugs, and includes the reviewed selection manifest and source provenance. The independent federal audit matched all 100 identities, 800 direct Scorecard observations and 1,152 broad CIP pairs with zero mismatches. Live artifact verification passed 26/26 sources. Official admissions/deadline/program/calculator destinations were checked for all institutions; uncertain entries remain unavailable. See `M1_CATALOG_RESULTS.md`, `M1_FEDERAL_VALUE_AUDIT.md`, `M1_RESOURCES.md`, and `M1_SOURCE_REVIEW.md`.

**M2 — knowledge schema and retrieval.** M2 and release-staging migrations are applied to hosted Supabase project `ptdbmseeooboqbpyvcgw`. All 96 bounded credential-free SQL batches applied and published release `sha256:20a224a56e54e8fda0f37b791bab45db4ac890c38f7ce57afe98c9a5d4838da4` at `2026-10-04 10:45:44.888478 UTC`: 100 colleges, 29 sources, 144 bindings, 4,464 facts and 1,252 passages. Account/save counts were 0/0 before and after. The public retrieval adapter passed six read-only hosted scenarios against reviewed artifact records; this proves structured/keyword retrieval, not semantic-vector quality. The release has zero real embeddings. In the isolated Docker rehearsal, three synthetic legacy saves survived; RLS, active-session boundaries, source binding, exact filters, lexical retrieval, release staging/publication, stale-release guards, transactional rollback and embedding-preserving reseed passed. See `M2_SQL_VERIFICATION.md` and `M4_HOSTED_RELEASE.md`.

**M3 — private adviser schema and integration.** The M3 migration is applied to the same hosted project. Separate local SQL tests passed for owner isolation, session revocation, atomic quota reservation, retries/idempotency, deletion, account cascade, title cleanup and expiry/purge; the concurrent delete/completion race completed without deadlock and erased private content correctly. Hosted unauthenticated requests to adviser and retention endpoints returned 401; an authorized retention request returned 200 and deleted 0 rows. The Vercel nightly 04:17 UTC schedule is configured but has not been observed firing. There are still no hosted accounts, so signed-in Auth/email/history tests remain pending. See `M3_SQL_VERIFICATION.md`, `M3_REVIEW.md`, `M3_PROVIDER.md`, and `M4_HOSTED_RELEASE.md`.

**M4 — design and release checks.** Rendered local desktop/mobile review and the adviser fixture passed consent, grounded source cards, retry/draft preservation, quota-disabled send, saved-answer refresh failure, provider-off history/delete, and narrow 320px layout checks. The latest full suite passed 394/394; Vinext/native Next builds, typecheck and lint passed, and the hosted Next build succeeded. The Vercel production deployment is READY: `dpl_GqJZyomPsnqpviChTi78dHy25Ahx`, commit `db94a38`, at `https://collegesearch-steel.vercel.app`. Live `/explore`, `/adviser`, `/my-colleges`, and `/brand/campus-pin-32.png` checks returned 200; the explorer showed all 100 colleges. Live desktop and 390px adviser views had no horizontal overflow and the guest AI-in-preparation state was clear. Captures `14-live-explore-desktop.jpg`, `15-live-adviser-desktop.jpg`, and `16-live-adviser-390.jpg` are under `outputs/m4-audit`. No browser warnings/errors or deployment-specific errors in the prior 15 minutes were observed. Hosted security review had zero warnings/errors and two intentional service-only RLS informational notices. Signed-in hosted Auth/email verification remains pending. See `M4_DESIGN_AUDIT.md`, `M4_CHECKS.md`, and `M4_HOSTED_RELEASE.md`.

**Remaining external gates:** perform signed-in hosted Auth/email/save/history journeys; observe the scheduled retention job fire; and complete a nonblank NVIDIA-key evaluation covering quality, latency, cost, full embedding/index coverage, a defensible free monthly allowance and provider retention. The local key placeholder is blank and there have been zero NVIDIA calls. Confirm an authorized NVIDIA production route before enabling public AI; the hosted trial restriction remains an activation gate. Stripe/AI Plus is deferred by the user.

Latest account-wide usage snapshot: 23% remaining. No reset has been used.

## October 4 — M5 continuation: full embedding pipeline

The previous goal turn made progress: committed the hosted release/audit evidence and verified live mobile/desktop behavior. A new requirement audit found that only the 24-passage embedding sample existed; full corpus generation/publication was still missing independently of the key.

Implemented restartable full-corpus generation with explicit evaluation opt-in, per-run request caps, exact release/model/version/content binding, checksummed checkpoints and complete-artifact validation. Added offline SQL export plus exact-byte verification, atomic full publication, identical retries and explicit model/version replacement. Twelve real SQL checks passed against all 1,252 synthetic vectors in a disposable local clone, preserving three legacy saves; the clone was removed afterward. No NVIDIA call or hosted vector write was made. Runtime query vectors now reject float32 overflow/underflow and zero vectors with keyword fallback.

All 405 integrated tests, lint and typecheck passed. See `M5_EMBEDDING_PIPELINE.md` and `M5_SQL_VERIFICATION.md`; the native Next production build passed. Isolated real Auth/browser checks are in progress. The user-provided-key dependency and NVIDIA production authorization remain unresolved; public AI remains disabled. Latest observed account-wide usage: 15% remaining; no reset used.

M5 committed as `5db819f` and deployed successfully to the existing Vercel demo. Deployment `dpl_6g3UTYvcdT6C95A3Q1qgSR9zA8dA` is READY (`collegesearch-duntyqrwy-swis-projects-066d8b1d.vercel.app`), aliased to `collegesearch-steel.vercel.app`. Live explorer/adviser returned 200 and unauthenticated adviser API returned 401. Public AI remains disabled; no vector index was uploaded. Account-wide usage snapshot now shows 11% remaining; no reset used.

## October 4 — M6 continuation: real local accounts and planner

Completed isolated real Supabase Auth/PostgREST and browser verification without changing product code. Six account integration checks passed: active session, owner save/read, cross-user denial, anonymous denial, immediate stale-token rejection after revocation, and owner-only account-deletion cascade. Local email confirmation was captured and followed through Mailpit using a disposable identity; this does not prove hosted mail delivery. Real adviser API history reads and disabled-mode zero-write behavior passed. Deleting a synthetic conversation erased its messages/cached response and preserved the saved college.

Browser sign-in opened the synthetic private history; a new-catalog college save (UNITID 110486), browser-local notebook, and personal planning date survived reload. The planner distinguished account-synced colleges from device-local notes/dates and marked the date student-entered/source not checked. Sign-out hid all account-specific planner data. A date input automation fill did not commit React state, but a normal keyboard change did; no product bug or code change was inferred. See `M6_AUTH_VERIFICATION.md`. Final live explorer capture is `outputs/m6-auth/04-live-explorer.jpg`.

The tested app remains deployed at commit `5db819f`; the 405-test/build evidence is unchanged because M6 changed documentation and test fixtures only. Remaining work needs a nonblank NVIDIA key/model evaluation, real corpus embeddings and semantic evaluation, measured allowances/provider retention, verified production permission, and hosted account/email release checks. The key placeholder is `/Users/kamarthapusri/Projects/CollegeSearch/.env.local`, mode 600 and Git-ignored. No NVIDIA request or reset has been used. Latest account-wide usage snapshot: 8% remaining.

Local test cleanup is complete: all M6 disposable users were removed, and the task-owned Supabase stack, Next preview, and database rehearsal were stopped while preserving database volumes. The NVIDIA key and production authorization have remained unavailable through the M4, M5, and M6 goal continuations. Independent implementation and isolated verification are now complete; further model/release acceptance requires the owner-supplied key and authorized provider route. Resume with the existing `.env.local` and the M3/M5 evaluation commands, then finish hosted account/email journeys before public launch.
