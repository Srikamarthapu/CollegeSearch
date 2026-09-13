# Recovery, restore and release-control follow-up

September 13, 2026. This follow-up keeps the full school-launch acceptance goal open.

## Changes and verification

- Applicant and deadline recovery now validate the saved copy before discarding a retained draft. Ten synthetic Storage cases pass; four failed against the previous source. Read denial and malformed saved data preserve both editable text/list and recovery journal.
- Applicant clearing returns an explicit completion outcome. Nine synthetic lock/storage cases pass, including a newer edit arriving while clear waits. The UI no longer interprets a nonempty ready snapshot as a completed clear.
- Profile/planner recovery returns keyboard focus to persistent status when its action disappears, provided focus has not moved. Planner file reads guard preview focus after asynchronous work. Hidden, closed and unmounted destinations are excluded. These interrupted async branches are source-reviewed; no browser fault injection is claimed.
- A real two-tab planner edit was rejected when the other tab had changed the same task. Error focus was correct, the form survived reload, and keeping it as a separate task preserved both versions. The original one-task backup was restored and reloaded afterward.
- Ordinary applicant edits converged across two tabs. The attempted simultaneous browser edit did not induce a whole-profile conflict; synthetic tests establish those race cases. Original synthetic notes were restored.
- The rebuilt planner focused its backup-review heading, Tab entered the named review region, and cancelling returned focus to Restore backup without changing tasks. Screenshots 01–06 were opened and inspected.
- Build, typecheck and lint pass. All 335 tests pass. Local HTTP smoke passes all 16 requests. The first probe ran before the preview was listening and failed to connect; its report is retained separately as local-smoke-before-listen.json. No application failure is inferred from that startup timing error.

## Database and release controls

The isolated local database restore passed: three synthetic users, three sessions, four saved rows, matching app schema/grants/policies/migrations, and six ownership/anonymous/revocation/deletion-reconciliation cases. The checkpoint reproduced post-backup account resurrection, and exact deletion reconciliation removed only the sentinel account and dependent rows. Temporary resources were removed; existing Docker resources were unchanged. See database-restore/REPORT.md for limits, commands and cleanup evidence. This is not a hosted/off-site backup or an Auth HTTP restore.

Initial GitHub inspection confirmed main was unprotected with no effective rulesets. The follow-up applied and verified strict CI protection, including administrators, with the existing GitHub Actions check; force pushes/deletion are disabled and no reviewer is required. Weekly source verification exists only on the review branch; it is absent from the default branch and no retained scheduled run was found. Passing PR CI does not establish enforcement, scheduler execution or notification receipt. See github-release-controls.md.

## Session expiry and remaining gates

A confirmed disposable Expiry QA account was signed in through the private website at 21:04:56 UTC, with the provider's real 3,600-second lifetime. The same browser session refreshed automatically at 22:03:19.226378 UTC, before any new browser interaction. At22:05:01 the provider explicitly rejected the original non-refreshing control token as expired (`bad_jwt`). After the original browser-token expiry boundary, normal UI removal changed the account shortlist from three colleges to two, matching the database; reload preserved the confirmed list. Normal sign-out passed. Exact cleanup verified zero users, sessions and saved rows for this disposable account, and removed its private credential manifest. Screenshots 07–08 were inspected. No clock or lifetime setting was changed. See expiry-api.json and expiry-observations.json. This proves one real renewal interval in the in-app browser, not email delivery, overnight inactivity or all browsers.

Owner inputs for SMTP/email delivery, public support/privacy/retention, maintenance/alerts and a protected backup destination remain unresolved. School Wi-Fi/devices and broader browser/assistive-technology checks remain. Native app inventory was unavailable while the Mac was locked. The current in-app browser checks do not establish actual screen-reader speech, zoom or OS reduced-motion behavior.

Private version 6 deployed successfully from source `27011e313c69b9380dbe68ecbfadcbdf3347778d`; matching CI run 34783878132 passed. Hosted backup preview focus, Tab navigation and cancel-focus return passed with zero captured warnings/errors, without modifying the empty account tracker. Anonymous Node fetch returned 401 with no application content (an earlier Python client returned 403). See deployment.json and private-access.json. Earlier comprehensive hosted tests remain dated to their own release. The local preview was stopped; temporary QA tabs were closed. The timed process completed and its disposable account was cleaned up.

## Saved-list removal focus follow-up

Keyboard Enter reproduced a focus loss on the private guest shelf: the removed Davis card disappeared, Irvine remained, and focus fell to BODY. The two-file repair uses a guarded post-render focus request for the adjacent Remove button or empty shelf’s Explore link. It preserves mutation, comparison selection and notebook behavior. Build, types, lint and all 335 tests pass in remove-focus-* evidence. Hosted first/middle/last/only-card and narrow-layout verification follow the private publish. The original guest shelf was empty; four temporary college bookmarks are the controlled fixture and will be removed during those checks.
