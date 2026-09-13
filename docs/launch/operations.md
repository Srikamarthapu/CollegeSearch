# CollegeSearch school pilot operations

Proposal reviewed September 13, 2026. Start with one supervised class of approximately 30 students, then widen to a grade after a successful session. These are planning assumptions, not measured traffic forecasts. There is no need for a queue, Kubernetes, a new analytics vendor, or an enterprise incident platform for this pilot.

## Release and evidence record

Before changing the audience, record the final origin, release owner and backup, exact committed source SHA (or preserved source archive hash), lockfile hash, deployed release/version ID, artifact hash, public data snapshot timestamp, reviewed source report, and hosted environment configuration revision. Record the prior **tested** rollback version and whether its assets, environment, database schema, and browser-storage schema remain compatible. Keep secrets out of the record. An older private preview is not automatically a safe rollback target.

`build/sites-vite-plugin.ts` copies hosting metadata into the build. It does not capture that release record, execute smoke checks, deliver alerts, or establish a rollback version. The Worker and its matching static assets must be promoted and rolled back together. The published release ID must be reconciled with the reviewed source/artifact through the actual host; a page title alone does not identify a code revision. If the host cannot expose an unambiguous version, add a small build-generated release ID to a public response/asset and compare it in release smoke checks. Do not derive release identity from the application's unchanged `0.1.0` package version.

## Repeatable HTTP checks

The supplied `pilot-probe.mjs` uses Node built-ins and needs no installation. It sends GET requests only, without cookies, credentials, signup, email, or database mutations. It does not follow redirects automatically. It retains status, timing and findings; it does not retain response HTML, cookie values, student profiles, or tokens.

Smoke includes two fresh home documents, explore, Berkeley's profile, compare, saved, match, planner, account, privacy, data health, both no-code auth callbacks, one compiled JS asset, the favicon, and one real image-optimizer request. It verifies CollegeSearch identity, HTTP/MIME, private/no-store document caching, nonce consistency/uniqueness, and expected callback behavior. The optimizer check exercises the Worker’s ASSETS/IMAGES path that stubbed route tests do not establish. There are 16 requests in a successful smoke run. Earlier dated 15-request reports predate planner inclusion.

Run these against the exact existing local production preview after the final build, then against the actual deployed origin. Substitute the real origin; the examples do not select or publish one:

```sh
node scripts/ops/pilot-probe.mjs --origin=http://127.0.0.1:4173 --profile=smoke --auth=configured --report=/tmp/collegesearch-local-smoke.json
node scripts/ops/pilot-probe.mjs --origin=https://REPLACE_WITH_DEPLOYED_HOST --profile=smoke --auth=configured --report=/tmp/collegesearch-hosted-smoke.json
```

Use `--auth=disabled` only for a deliberately browser-only release. A configured callback must redirect to the same-origin `missing-code` error; a disabled build must explicitly return the `configuration` error. Neither proves OAuth, email delivery, session renewal, the real deletion route, or account synchronization. A private hosting access wall will fail the identity check; do not disable it just to satisfy the script. Perform release checks through the approved audience/access method.

The probe's freshness result is separate from site availability. It reads the published verification timestamp/counts from `/data-health`, requires the current 26-artifact coverage, and flags a snapshot older than eight days, missing/malformed/future timestamps, or incomplete results. Eight days is a proposed weekly-check-plus-one-day policy. It does not call an older reporting cohort “fresh” or convert fingerprint integrity into manual factual review. Markup changes that remove the expected timestamp/counts fail visibly rather than silently passing.

## One realistic classroom burst

Run once on the approved preview; after a clean smoke run, run once on the intended hosted pilot release before a class begins. The classroom profile starts 30 anonymous clients 200 ms apart. Each reads four existing student pages with 1.5 seconds between views: 120 GETs maximum and at most 30 requests in flight. It stops issuing new work after five failures and records all attempted failures plus unattempted work. This deliberately compresses a class's navigation into a short burst.

```sh
node scripts/ops/pilot-probe.mjs --origin=http://127.0.0.1:4173 --profile=classroom --report=/tmp/collegesearch-local-classroom.json
node scripts/ops/pilot-probe.mjs --origin=https://REPLACE_WITH_DEPLOYED_HOST --profile=classroom --report=/tmp/collegesearch-hosted-classroom.json
```

Proposed first-pilot acceptance: all 120 expected document responses pass and p95 request-to-complete-body time is under 3 seconds from the measurement location. Record the location/network, wall-clock time, peak Worker errors, Worker CPU/request-limit signals, and relevant Supabase usage/errors over the same interval. These are initial operating targets, not promised service levels. A local pass does not establish hosted capacity; a hosted anonymous HTTP pass does not measure school Wi-Fi, browser rendering, asset waterfalls, auth refresh, or concurrent account writes.

Complete a small manual class rehearsal on school Wi-Fi with at least two representative student devices: open explore together, open a college, save/remove, compare, reload, edit a research note, export and restore a disposable backup. Two test accounts must exercise real account saves and identity changes; do not bulk-create accounts or load-test SMTP. For a 30-student signup session, verify configured sender/rate limits beforehand and stagger onboarding if necessary. Supabase’s default SMTP is restricted and is not a production delivery service; custom SMTP also has configurable limits that need checking for a class burst. [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp)

## Monitoring and alert delivery

For the supervised pilot, one owner watches the smoke result and hosting errors immediately before class, during the class, and after it. A second named person must know how to take over. Outside the supervised session, an hourly read-only smoke workflow is sufficient as an initial maintenance signal. For unattended student use, configure the school's existing uptime service (if available) to check the home title and successful response every five minutes. Do not treat GitHub scheduled workflows as a guaranteed timely outage pager: runs can be delayed or dropped, execute only on the default branch, and inactive public repositories can have schedules disabled. [GitHub schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

The existing Monday artifact-verification workflow already preserves failures and summaries. A green run or uploaded artifact is not alert-delivery evidence. Assign the primary and backup recipient, enable the intended failure notifications, and deliberately fail one harmless probe in a non-production/manual workflow. Record who actually received the message, on what channel, delivery time, acknowledgement, and the linked run/report. Also simulate a missing scheduled result: the owner must detect that no completed artifact check exists within eight days. Do not expose a webhook secret or post student data into an alert.

Initial operating triggers:

- Any wrong-site identity, public caching of nonce/account documents, or cross-account data exposure: stop the pilot immediately; use the incident/rollback path below.
- Two failed uptime observations a few minutes apart, repeated Worker 5xx, or broken JS/image assets: owner investigates immediately during class; rerun smoke after a fix or rollback.
- HTTP burst errors or p95 above 3 seconds: hold expansion, inspect Worker/provider limits and payloads, and repeat only after a specific fix.
- A source-verification failure: retain last approved college data, notify the data maintainer, review the changed primary source. Do not repin automatically or roll back unrelated application code.
- No completed weekly check within eight days, or an old published `/data-health` snapshot: maintainer investigates scheduler/publication lag. Show an age warning for the published snapshot; do not describe it as the latest scheduler result.

The optional `pilot-smoke.yml` is a proposal only and has not been installed or dispatched. If adopted, it stores a report on every run. Its repository variables and recipients require operator setup. It intentionally does not install a speculative alert vendor. Delivery remains a manual gate until the recipient test above passes.

## Rollback and recovery drill

1. Before class, retain a tested release bundle/version and its matching static assets. Record the exact host control/command that restores it, the operator who can use that control, the configuration revision and the expected URL/audience. The private Sites version deployment control was exercised to restore version 2 and then version 3. See `artifacts/launch-2026-09-13/rollback-exercise.json` for exact versions and health checks.
2. On an incident, pause further promotion and school onboarding. Record the time, symptoms, current release ID, failed smoke paths, and provider errors without credentials or student content. Ask students to retain their browser data and export if the app still functions; clearing storage is not a general repair step.
3. Restore the recorded known-good application version and matching assets through the actual host. Do not restore the database just because application code failed. Worker rollback does not roll back connected data resources; schema/configuration compatibility matters. [Cloudflare Worker rollback boundaries](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
4. Run hosted smoke, compare the host's active release ID to the rollback record, and exercise a guest save/notebook plus one test account. Confirm no other user's data appears, local recovery remains accessible, and the app's account configuration matches the intended mode. If there is no proven compatible earlier version, use a pre-tested current-source browser-only fallback and clear service-status copy; prepare it before class, not during an incident.
5. Record elapsed restoration time and what failed. Proposed pilot recovery target is 15 minutes to a functioning known-good student research surface. This target is unproven until the drill completes.

Database recovery is a separate exercise. Verify the actual Supabase plan, available backups, retention, last successful backup, authorized restore operator and restore-to-test procedure. Free-plan projects need an explicit export/off-site backup arrangement; paid-plan automatic backups and retention depend on the plan. Check an actual backup rather than inferring one from a paid subscription. [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups)

Restore a disposable test backup into an isolated test project, apply/verify the required migration/schema and grants, and run the anonymous/two-user ownership checks. Do not connect a restored clone to production SMTP or send notifications. A database restore can resurrect previously deleted users/rows; reconcile deletion requests before returning restored data to service. Students' browser-local notes and profiles are not in Supabase backups; verify the app's portable export/restore separately. Keep private backup files outside public CI artifacts and limit access to the actual maintainers.

On September 13, an isolated local PostgreSQL 17 rehearsal restored three synthetic Auth users, three sessions and four saves from a logical checkpoint. App schema, grants, four RLS policies and both migrations matched; six ownership, anonymous, revoked-session and deletion-reconciliation cases passed. A user deleted after the checkpoint reappeared on restore, then its exact deletion receipt removed it and its dependent rows. Only temporary resources were removed; existing Docker resources were preserved. See `artifacts/launch-2026-09-13/recovery-audit/database-restore/REPORT.md`. The target was tested through PostgreSQL roles/claims, with no Auth HTTP service, SMTP or hosted data. This proves local recovery mechanics only.

## Remaining manual gates

- Name the final release owner, backup, student support/contact route, pilot audience and intended hosted origin; reconcile these with privacy copy.
- Capture exact source/artifact/deployment/configuration IDs and a tested, compatible rollback target. Private application rollback/roll-forward was exercised. Repeat the readiness check when schema or browser-storage compatibility changes.
- Run final local and hosted smoke/classroom probes, then school-network/browser rehearsal. No live load traffic was generated by this sub-review.
- Verify recipient delivery and acknowledgement of one deliberate failure plus detection of a missing weekly run. No external alerts were sent by this sub-review.
- Main now requires the existing GitHub Actions verification check, strictly up to date and enforced for administrators, with no approving reviewer required; force pushes and branch deletion are disabled. The current PR check resolves successfully. Land the reviewed workflows through the release process, then observe actual default-branch scheduling and recipient delivery. Weekly verification remains only on the review branch, with no retained scheduled run. See recovery-audit/github-release-controls.md.
- Verify custom SMTP sender/DNS/rate limits and actual confirmation/recovery delivery to representative school and external inboxes; finish expired-session/multi-tab browser checks on the intended hosted origin. Verify Google OAuth only if enabled; otherwise keep the provider hidden.
- Root reports local-production HTTP `/api/account` plus hosted-database integration passed in `hosted-endpoint-integration.json`. The private hosted Worker endpoint now also passed six checks in `private-hosted-account-integration.json`; full destructive browser deletion remains unexercised. Verify server-only secret presence at runtime without printing it or bundling it into browser assets.
- Verify actual hosted/off-site backup availability, retention and an authorized restore operator. Define how post-checkpoint deletion records are retained separately and reconciled, and how restored sessions are revoked before returning data to service. The synthetic local rehearsal passed; a protected hosted backup and its recovery process remain unverified. Browser export/restore is a separate check.
- Commit and release reviewed source-verification snapshots through the existing fail-closed process. Decide who publishes a warning when the website snapshot is overdue and who reviews the 14 unavailable official action slots and five older calculator-year notes.
