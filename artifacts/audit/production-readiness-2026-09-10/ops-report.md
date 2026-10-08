# CollegeSearch production auth, privacy, and operations review

Date: 2026-09-10. Scope: read-only review of the current checkout at `/Volumes/Seagate /CollegeSearch`, including authentication, browser storage, SQL ownership, deployment config, CI, dependency advisories, and local production response boundaries. No checkout edits, dependency installation, deployment, provider configuration, database mutation, or real account creation occurred. Root handled the rename, build, full tests, lint, browser QA, Git state, and hosted Sites inspection independently.

## Decision

The current local browser-only build has functioning session/configuration gates and strong response-level boundaries in the focused checks. It is not verified for an account-enabled public release. The pinned dependency audit is also no longer clean. No cross-account data disclosure or deployed RCE was demonstrated in this bounded review.

## Validated deficiencies and release gates

### OPS-1 — P1: Refresh vulnerable pinned dependencies before satisfying the release audit gate

Evidence: `package.json:26` pins Next 16.3.0 and `package.json:51` forces sharp 0.35.0. `npm audit --json` on the current lockfile reports 11 affected package entries: 1 critical, 9 high, 1 moderate. New findings include Next and sharp; this supersedes the older August evidence of a clean production-dependency audit. `.github/workflows/ci.yml:54` requires `npm audit --omit=dev`; root independently ran that production audit and reported the same issue category.

The package-manager severity is not a demonstrated application exploit severity. Verified primary upstream descriptions and applicability:

- [Next Windows filesystem advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36): affects Windows-hosted Next routing. This repository builds a Vinext Cloudflare Worker; the local review is on macOS. No applicable Windows production execution path was found.
- [Next AVIF optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4): relates to sharp/libheif decoding AVIF. Upstream marks Next 16.3.3 as patched; the audit's offered supported update is 16.3.4.
- [sharp/libheif advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c): processing untrusted input with sharp before 0.35.4 is affected, under specified native-runtime conditions. `worker/index.ts:33` routes `/_vinext/image` through `env.ASSETS.fetch` and Cloudflare `env.IMAGES` at lines 36–39, with no sharp call on that route.
- Vinext's installed `parseImageParams` rejects absolute, protocol-relative, backslash-host, and non-path sources. Five representative malformed/remote sources returned 400 without calling the asset fetch stub. HTML and SVG returned 400 without image transformation. The endpoint permits local assets with recognized raster content types, including AVIF; that fact does not make it a sharp endpoint.
- Existing image-size advisories remain build-tool debt through Vinext. `tests/build-input-security.test.mjs` passed, confirming the app contains no direct binary image imports or file-based binary metadata under the guarded app tree. This guard does not fix the upstream package.
- Other audit entries are baseline-browser-mapping, browserslist, fast-uri, js-yaml, and propagated Cloudflare/vinext tooling entries. Their untrusted-input reachability was not exhaustively assessed.

Action: update Next and its matching eslint config together after compatibility review, remove the vulnerable sharp override or pin an appropriate patched version, and refresh eligible transitive dependencies with the lockfile. Rerun the complete checks. Do not apply `npm audit fix --force` or the audit's proposed Cloudflare downgrades blindly.

Evidence files: `npm-audit-all.json`, `image-route-boundary.json`, `image-build-input-test.log`.

### OPS-2 — P1 for an account-enabled launch: hosted identity and row-ownership execution remain unverified

Current local state is confirmed unconfigured. Only `.env.example` exists at the root, containing placeholders for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both variables are absent from the current process. `supabase/.temp` has only `cli-latest`, with no linked-project metadata. `app/lib/supabase/config.ts:56` makes missing configuration explicit and `app/auth/callback/route.ts:10` safely routes callbacks to the configuration error page. These are supported disabled-state behaviors, not auth crashes.

`AUTH_SETUP.md:53` and `SUPABASE_DATABASE_SETUP.md:53` correctly distinguish static policy tests from real database evidence. The installed Supabase CLI is 2.106.0. Docker's daemon could not be reached, so its server version is unavailable. No local Supabase database was running, and no two-user RLS exercise occurred. The Docker client is installed.

Required hosted verification remains: final origins/redirects; Google provider credentials; email confirmation/recovery and SMTP delivery; session renewal; anonymous access denial; two separate users reading/inserting/deleting only their own rows; guest import consent; offline retry and concurrent tabs against real remote state. Static checks and stubs do not establish those outcomes.

Root independently reported the hosted Sites deployment has no configured runtime environment entries, revision 0. That does **not** prove its old published JavaScript lacks build-time public configuration. Its current release and remote Supabase settings were not inspected by this subagent. Do not report hosted auth as definitely absent based only on local variables or empty runtime settings.

Action: keep account features visibly unavailable until configuration and the documented local/production verification matrix are complete. The browser-only product can remain a separate release scope.

### OPS-3 — P2 before a public account launch: account deletion and privacy operator details have no usable handoff

`app/privacy/page.tsx:147` states that self-service account deletion is not active and requires the deployment operator. Lines 153–155 explicitly say a launch still needs the operator contact, effective date, retention schedule, and deployment-specific provider list. `app/components/auth/AuthAccountControl.tsx` contains session/account display and sign-out, without a deletion action. No working operator contact is supplied by the privacy page. A signed-up student therefore has no in-product deletion request destination when the deployment enables accounts.

This is a concrete product/operations gap, not a legal compliance determination. Either provide a tested deletion/request process with a real contact and final provider/retention details, or keep account creation outside the released scope. An account deletion flow must also consider the disclosed browser recovery copies; deleting database rows alone does not erase local notebooks/profile data.

## Checks that passed

- Focused auth, auth-consumer, public config, verified session binding, Supabase save adapter, static SQL, account storage, sync, Web Locks, account-cycle, view-state, CSP, and CI contract tests: **79 passed, 0 failed**. These ran directly with Node 22.22.3 without triggering a duplicate build. Logs: `targeted-contract-tests.log`.
- Image build-input regression: **1 passed**. Logs: `image-build-input-test.log`.
- Seven image-route trust checks: **7 passed**, using the actual installed Vinext handler with stub asset/transformation dependencies. No malicious image file or public exploit request was used. Logs: `image-route-boundary.json`.
- Read-only HTTP checks against root's rebuilt `http://127.0.0.1:4173`: `/` twice, `/privacy`, `/saved`, `/auth/callback?next=%2F%2Fexample.com`, `/auth/recovery-callback`, `/auth/update-password`. Five documents returned 200; two unconfigured callbacks returned 307 to the same local configuration-error path. All had private/no-store caching, a CSP nonce, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`. Every inspected inline script/style matched the response nonce. Two fresh home responses had distinct nonces. No Set-Cookie header was present because this instance is unconfigured. Logs: `local-production-headers.json`.
- The schema at `supabase/migrations/20260810042855_create_saved_colleges.sql` enables RLS, revokes anonymous/public privileges, permits only authenticated select/insert/delete, checks `auth.uid()` ownership for each operation, rejects anonymous Auth JWTs, uses a catalog constraint limiting each user to 50 distinct college IDs, and cascades database saves on account deletion. No update grant, privileged database function, trigger, or view exists in this migration.
- `captureVerifiedSupabaseSession` checks server `getUser()` and local session identity agreement before fixing the token on an isolated data/mutation client. Untrusted user metadata is used only for display text. The account-state coordinator invalidates pending work when identity changes; tests cover stale result races.
- Guest saves, account recovery data, and local research notebooks use distinct browser scope semantics. The application profile is only described by current copy; it is not implemented. Privacy copy describes retained browser data after sign-out, explicit guest import, browser-only notes/profiles, downloadable CSV content, and shared preference URLs. No advertising or behavioral analytics SDK was found among direct dependencies or in the scanned app request paths.
- CI checks use immutable action SHAs, read-only repository permission, `persist-credentials: false`, a lockfile install, Node 22, typecheck, lint, offline evidence checks, full tests/build, production audit, and a clean tracked-file check. Live artifact verification has a separate weekly read-only workflow. Repository CI does not include a real Supabase database/auth integration job.
- Read current Supabase changelog and SSR session documentation; no code change was made. Relevant current guidance distinguishes verified claims/user reads from trusting cookie/session payloads. [Official SSR client documentation](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).

## Exact focused test command

```sh
node --test tests/auth-state-coordinator.test.ts tests/auth-consumer-state.test.ts tests/auth-consumer-contracts.test.mjs tests/supabase-public-config.test.ts tests/supabase-verified-session.test.ts tests/supabase-saved-colleges.test.ts tests/supabase-saved-colleges-schema.test.mjs tests/saved-college-storage.test.ts tests/saved-college-sync.test.ts tests/saved-college-lock.test.ts tests/saved-college-account-cycle.test.ts tests/saved-college-view-state.test.ts tests/security-policy.test.ts tests/ci-workflows.test.mjs
node --test tests/build-input-security.test.mjs
npm audit --json
docker info --format '{{.ServerVersion}}'
supabase --version
```

The sub-audit npm JSON contains all dependencies. The root also ran `npm audit --omit=dev --json`: three affected package entries remain (Next critical, sharp high, baseline-browser-mapping moderate), saved as dependency-audit-production.json. The npm audit shell call subsequently printed a JSON summary, so the shell exit code does not represent the audit subprocess exit. Root's independent production audit is the production-only check. No secrets were printed; environment checks returned names and presence/placeholder booleans only.

## Limits

This was a bounded readiness audit, not a full security scan. No live account, OAuth, email, database, cross-device sync, provider logs/advisors, hosted cookie rotation/CDN response, production operator workflow, real deployment rollback, or monitoring/alert delivery was exercised. Local HTTP checks cannot prove the hosted CDN honors no-store or that a published older release has the same CSP. The unused `app/chatgpt-auth.ts` helper has no app consumers and was not treated as an active alternative authentication path. The project metadata specifies no D1/R2 bindings; this is not evidence about a separately configured remote Supabase project. Root's build/browser/remote findings should be merged with this report rather than replaced by it.
