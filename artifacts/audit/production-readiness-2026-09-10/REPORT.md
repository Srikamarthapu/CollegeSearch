# CollegeSearch production-readiness audit

September 10, 2026 · Current local source and freshly built production preview

**Verdict: not ready for a public production launch.** The app is a useful research prototype with careful source labeling, but release checks fail, unsaved student work can disappear, and several advertised or expected capabilities are unfinished. A limited browser-only beta becomes reasonable after the concrete blockers below are fixed. An account-enabled release needs additional hosted verification.

The requested rename is complete in navigation, footer, page metadata, account copy, README, and relevant test expectations. The existing CollegeSearch compass asset is restored in the header/footer and favicon. Storage keys remain unchanged. This audit made no data, feature, dependency, account-provider, or deployment repairs. Findings are deliberately left visible for review.

[Local production preview](http://127.0.0.1:4173/) · [Machine-readable evidence summary](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/summary.json>) · [Detailed data review](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/data-report.md>) · [Detailed account/security review](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/ops-report.md>) · [Detailed notebook review](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/feature-report.md>)

## Release checks

| Check | Current result | What it establishes |
|---|---|---|
| Production build | Pass | Current source compiles to the Vinext Worker and client assets. |
| TypeScript | Pass | No reported type errors. |
| Full test command | **199/200 pass; command fails** | Sole failure is the `/privacy` content contract. [Log](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/test.log>) |
| ESLint | **Fails** | `CampusCarousel.tsx:22` violates `react-hooks/set-state-in-effect`. [Log](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/lint.log>) |
| Offline evidence checks | 28/28 pass | Stored provenance and schema are internally consistent. [Log](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/data-offline.log>) |
| Live institutional artifacts | **20/26 pass** | Six registrations require source review/repair; full refresh is blocked. [Results](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/data-artifacts.json>) |
| Fresh federal and UC imports | Pass | All three regenerated datasets match current stored content excluding access timestamps. This is not a fresh manual approval of every institutional overlay. [Comparison](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/data-source-comparison.json>) |
| HTTP route smoke | 64/64 expected statuses | Twelve main routes, all 50 college profiles, and two invalid routes returning 404. [Results](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/route-smoke.json>) |
| Production dependency audit | **Fails: 3 affected package entries** | Next: critical; sharp: high; baseline-browser-mapping: moderate. Counts are package-manager findings, not proven exploits. [JSON](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/dependency-audit-production.json>) |
| All dependency audit | **Fails: 11 affected package entries** | 1 critical, 9 high, 1 moderate, including propagated build-tool entries. [JSON](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/dependency-audit.json>) |
| Browser workflow review | Mixed | Discovery, saves, compare, explicit notebook persistence, preferences, fields and admissions selection work; draft loss, stale export and narrow-screen overflow reproduced. |
| Focused trust checks | Pass | 79 auth/storage/security/CI contracts; seven image-handler checks; seven local HTTP checks. These do not substitute for real hosted auth/database tests. |

No errors or warnings were captured in the browser console during the exercised current-build flows. This does not establish behavior under all browsers, accounts, storage failures or production load.

## Findings, in release order

### 1. P1 — Complete the release checks before shipping

The full test command is red because privacy content promises a feature that the app does not have. Fixing this by merely changing the test expectation would preserve the product inconsistency. Resolve the feature/copy decision first, then align the test. Lint separately fails in the carousel effect. Neither failure proves the app always crashes, but the documented CI gate does not pass.

Evidence: `tests/rendered-html.test.mjs:475`, `app/privacy/page.tsx:110`, `app/components/CampusCarousel.tsx:22`, logs above.

**Acceptance:** a reviewed, consistent feature/copy contract, a lint-clean carousel, and a successful full CI-equivalent run against the final source.

### 2. P1 — Repair the live data-verification pipeline

The current pipeline correctly refuses to publish unreviewed source changes. Six of 26 artifacts fail today:

| Artifact | Failure | What was confirmed |
|---|---|---|
| Georgia Tech CDS | Old URL returns 404 | Current official replacement serves the exact approved bytes. |
| Illinois CDS | Old workbook redirects to a new institutional homepage | Current CDS page links a Box workbook; adding a hostname alone would not fix the download. |
| UT Austin CDS | PDF fingerprint changed | Inspected counts agree, but stored page references are now wrong. |
| Caltech enrollment | HTML fingerprint changed | Current page still reports 971 undergraduates. |
| Caltech costs | HTML fingerprint changed | Inspected 2026–27 tuition plus fees still agrees. |
| Pomona costs | HTML fingerprint changed | Inspected 2026–27 tuition plus fees still agrees. |

**No confirmed numerical error was found in the bounded source audit.** The fresh federal and UC imports match, and inspected changed pages support their stored values. That is narrower than a guarantee that every fact is accurate. Every institutional observation was not independently re-transcribed.

Evidence: `scripts/refresh-data.mjs:60`, source registrations in `data/institution-overlays.json`, [source review with official links and exact references](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/data-report.md>).

**Acceptance:** verify replacements and changed documents, repair URLs and page citations, preserve hash checks, and pass the complete live verification and refresh transaction.

### 3. P1 — Resolve production dependency advisories

The production-only audit reports three affected package entries. Next 16.3.0 and the forced sharp 0.35.0 override are among them. All-dependency results include further build/tooling debt.

We did **not** demonstrate a deployed remote-code-execution path. The [Next Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) concerns a Windows-hosted Next runtime; this app targets a Vinext Cloudflare Worker. The [AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) and [sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c) concern native image decoding; the checked Worker image path uses local assets and Cloudflare Images. That distinction reduces the claim we can make about exploitability, but it does not make the dependency gate green.

Evidence: `package.json:26`, `package.json:51`, `worker/index.ts:33`, [image boundary checks](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/image-route-boundary.json>).

**Acceptance:** review compatible updates and regenerate the lockfile; rerun all checks. Do not apply the package manager's proposed tool downgrades or `audit fix --force` blindly.

### 4. P1 for a research product — Unsaved notes disappear during ordinary navigation

Browser reproduction: open Berkeley's profile → My research → type an audit note without saving → click My shortlist → open Berkeley's notebook. The text is empty, with no navigation warning. Explicitly saved text and the student-assigned category do survive a reload.

`ResearchNotebook` keeps the draft in component state and protects only document `beforeunload`. Client-side navigation does not trigger that event. Source review identifies the same unmount risk when match preferences remove a result or a saved card is removed.

Evidence: `app/components/ResearchNotebook.tsx:98`, `:101`, `:126`; screenshots 03 and 04 below.

**Acceptance:** keep drafts across route/result changes or use a consistent save/discard guard. Include navigation, match reset/filter changes, card removal, and identity transitions in the UI tests.

### 5. P2 — Export does not warn that visible edits will be omitted

With a dirty notebook open, Export research remains enabled and announces that the CSV is ready. The export reads only the saved local-storage copy. A never-saved draft exports as blank; a changed saved note exports its previous text. The success text says “saved notes,” but there is no visible exclusion warning or save-all action.

The browser reproduced simultaneous “CSV is ready” and “Unsaved changes” states. A focused experiment through the actual CSV/read functions verified stale output. The browser's downloaded file bytes were not independently retrieved in this run.

Evidence: `app/saved/SavedColleges.tsx:140`, `app/components/ResearchNotebook.tsx:98`, [experiment output](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/feature-experiments.jsonl>).

**Acceptance:** surface pending edits before export and let the student save them or knowingly export the last saved version. Exported College profile cells also need full site URLs; they currently contain `/colleges/...`, which is not useful outside the app (`app/lib/research-export.ts:14`).

### 6. P1 for the requested feature set — GPA/activity profile is not integrated

Find my fit offers field, location, school type, historical net price, size, setting and importance weights. It has no GPA, grading context, coursework or activity inputs, no Clear profile action, and no downloadable applicant brief. The privacy page claims all of those exist, while the account page says academic profiles are not collected.

Reach, target and likely/safety do exist as **student-assigned notebook categories**. They are not generated assessments. No admissions AI or academic-evidence comparison is active. This conservative behavior avoids invented probabilities; it does not complete the previously requested starting-point profile.

Evidence: `app/privacy/page.tsx:108`, `app/account/AccountPageClient.tsx:165`, `app/match/MatchTool.tsx:127`, `app/match/scoring.ts:43`; screenshots 05 and 09.

**Acceptance:** either finish and validate the optional local profile and its controls or remove the unsupported claims and explicitly defer the feature. A later automated assessment needs verified cohort-specific academic evidence and a separately reviewed data-sharing contract; adding an LLM alone would not establish reliable admissions estimates.

### 7. Account-launch gate — Real login, email, sync and ownership remain unverified

The reviewed local build has no Supabase URL/key configuration; the sign-in dialog truthfully says accounts are unavailable. The Sites runtime environment has no entries. Empty runtime settings do not prove the older deployed JavaScript lacks build-time configuration.

The code has tested ownership/session boundaries, and the SQL migration contains owner-only row policies. Real email confirmation, password recovery, OAuth redirects, refresh/rotation, guest import, cross-device sync and two-user database access were not exercised. The Docker daemon was unavailable, and no linked test database was running.

Evidence: `AUTH_SETUP.md`, `SUPABASE_DATABASE_SETUP.md`, `app/lib/supabase/config.ts:56`, [operations review](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/ops-report.md>), screenshot 08.

**Acceptance:** verify the final host and provider setup, run the documented two-user RLS/session/guest-import matrix and real email/OAuth flows, or release an explicitly browser-only beta with accounts disabled.

### 8. P2 — Privacy and deletion controls need a real completion path

The privacy page itself says a public launch still needs an operator contact, effective date, retention schedule and deployment-specific provider list. It says account deletion requires the operator but supplies no usable contact or in-product request path. These are concrete product gaps, not a legal compliance determination.

The notebook erasure instructions are also incomplete: clearing only notes and checklist leaves the separate list category stored. Reset that category too or offer a complete clear action. Removing a college intentionally retains its notebook, as disclosed.

Evidence: `app/privacy/page.tsx:95`, `:147`, `:153`; the storage experiment confirms the retained category.

### 9. P2 — Matching needs population context at the decision point

Graduation scores combine three population definitions and two entering cohorts. Cards show dates, but the numeric ranking loses the underlying cohort/comparability fields. Historical enrollment counts also differ in population definition.

For public colleges, average net price describes in-state students receiving Title IV aid. The matching tool has no residency input and can award maximum price alignment to a school based on that cohort, while calling the control an annual cost preference. The general “your family's cost may differ” note is too weak for a nonresident student using a budget.

All 50 selected earnings records **do** share the same outcome horizon, cohort and dollar year today. No earnings-period mismatch is asserted.

Evidence: `app/match/page.tsx:36`, `app/match/scoring.ts:251`, `:326`, `app/match/MatchTool.tsx:403`; [detailed comparison evidence](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/data-report.md>).

**Acceptance:** carry exact populations into explanations, use comparable alternatives where a standardized score is intended, and place the historical in-state cost limitation plus official calculator access beside budget decisions.

### 10. P2 — Data health is an inventory, not current verification status

The page shows historical access dates, source status and coverage from committed JSON. It does not show today's six source failures, a last successful live-check time, or a source-review queue. Weekly CI checks exist but fail fast and do not feed this page.

Evidence: `app/data-health/page.tsx:105`, `:138`, `.github/workflows/live-data-verification.yml`, screenshot 10.

**Acceptance:** distinguish approved stored evidence from current source availability, persist per-source check results, and ensure a named maintainer receives actionable failures. Keep the last approved dataset usable.

### 11. P2/P3 — Narrow-screen and notebook layout defects remain

At a requested 320px viewport, the usable document width was 305px but content reached 324px. The sort control and Copy search link button caused uncontained horizontal overflow. The share button shrank to 17px wide and extended beyond the viewport. At 390px, the checked match layout had no document overflow. The mobile menu and filter drawer opened and closed; Escape returned focus to Open navigation.

On desktop, opening one shortlist notebook stretches the adjacent collapsed card, producing large empty sections and oversized action areas. This is visible in screenshot 04. The longer restored brand also leaves little breathing room in the narrow header.

Evidence: `app/redesign.css:376`, `:379`, `:381`, `app/saved/saved.module.css:233`; screenshots 04, 06, 12, 13.

**Acceptance:** allow toolbar wrapping/shrinking without off-screen controls; maintain usable touch targets; align independent shortlist cards to their content. Recheck 320px, 390px, desktop, text enlargement and keyboard focus.

### 12. Release-state gap — The current redesign is not the hosted version

The source is on `codex/production-foundation` at `d46557be9c30198603a8910f1442a09004d35e6a` with uncommitted redesign changes. A read-only remote check found `main` at `4519fc12f2eb0e13c68bb56d0fd9d199a5f13559`.

Sites reports one saved version, built from `190ccd3d0c4cc5f209c79708284f53957cddb173`, still titled College Compass. Its access is restricted to one account, with no external visitors/groups. An anonymous request returned 401. A saved/live URL is therefore not evidence that the renamed current app has shipped or is publicly available. No deployment was requested or performed.

**Acceptance:** after the other gates pass, establish a reviewed release commit, verify it in the intended hosted environment, exercise rollback and operational checks, and publish only to the chosen audience.

## Product capability still missing for an all-in-one college research service

These limitations do not justify filling gaps with guessed data. A beta can disclose them, but they matter to the larger student-usefulness goal.

| Area | Current scope | What is lacking |
|---|---|---|
| Colleges | 50 across 17 states; 27 in California | Broader coverage and clear inclusion criteria; exact-campus support. |
| Programs | 12 broad federal fields | Verified exact majors, degree paths, direct-admit/change-of-major rules and official program links. |
| Current costs | 11 colleges have 2026–27 tuition/fees; 39 retain 2024–25 federal values | More current official costs, fuller cost of attendance, residency context and direct net-price calculators. |
| Admissions | 9 preliminary Fall 2026 UC, 19 Fall 2025 institutional, 22 Fall 2024 federal headlines | Current application/aid deadlines, testing/residency/program policies and appropriately defined academic ranges. |
| Planning | Free notes and four checklist items | Structured deadlines, progress/date tracking, useful official deep links, and a complete portable research export/restore story. |
| Personal assessment | Manual planning labels only | The optional applicant profile foundation; later evidence-based assessment design. No reliable probability claim exists today. |
| Operations | Weekly source-verification workflow and runtime error UI | Proven alert delivery/ownership, hosted smoke tests, database recovery and rollback evidence, realistic performance testing. |

## Captured student journey

Each image below is from this audit's current build, saved and visually inspected. Desktop was requested at 1440×1000; mobile at 390×844 and 320×844. Screenshots captured mid-transition or before viewport settling were rejected and replaced. Temporary audit saves and note contents were cleared; viewport override was reset.

### Step 1 — Explore and campus photos: working, with a narrow-screen defect

The new name and restored mark render. The carousel has five credited campuses; manual controls switch the image/credit and pause playback. Automatic movement was observed; reduced-motion behavior was source-reviewed rather than toggled on an actual device. UC filtering returned nine campuses; mobile California filtering returned 27. The 320px sort/share overflow still needs repair.

![Step 1 desktop exploration](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/01-explore-desktop.png>)

![Step 1 narrow-screen exploration](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/12-explore-320px.png>)

![Step 1 mobile filters](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/13-mobile-filters.png>)

### Step 2 — Compare colleges: working in the exercised path

Saved Berkeley and Davis, selected both for comparison, and opened the expected comparison URL. Dates and source labels remain visible. Different periods require care; the table is not a personalized cost offer.

![Step 2 comparison](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/02-compare.png>)

### Step 3 — Research and shortlist: saved state works; draft protection fails

The profile exposes source definitions and a research section. The first screenshot shows an unsaved draft; the next shows an empty notebook after ordinary in-app navigation. Explicit Save research persisted text and the chosen category through reload. Export accepted dirty editors without an exclusion warning. Expanding the left card also stretches its neighbor.

![Step 3 unsaved profile note](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/03-profile-unsaved-draft.png>)

![Step 3 lost draft and stretched shortlist card](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/04-shortlist-draft-lost.png>)

### Step 4 — Find my fit and admissions: preferences work; academic assessment missing

Engineering plus California updates the matching list and URL; score explanations correctly separate preference fit from admission chance. Mobile layout is readable but requires substantial scrolling before inputs. Admissions selection adds Berkeley and shows cohort-specific historical context. No GPA/activity profile or automated reach/target/safety assessment is present.

![Step 4 matching](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/05-match.png>)

![Step 4 mobile matching](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/06-match-mobile.png>)

![Step 4 mobile admissions](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/07-admissions-mobile.png>)

### Step 5 — Account and privacy: release blockers

The sign-in dialog displays its unconfigured state. The privacy page describes nonexistent profile controls and explicitly unfinished launch information. No real account registration, password change, deletion or provider mutation occurred.

![Step 5 account unavailable](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/08-account-unavailable.png>)

![Step 5 privacy mismatch](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/09-privacy-gap.png>)

### Step 6 — Fields and source transparency: useful baseline, incomplete service

Field search reduced the directory to Engineering. The broad-field limitation is visible. Data health explains reporting periods but does not surface current verification failures.

![Step 6 source inventory](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/10-data-health.png>)

![Step 6 field search](</Volumes/Seagate /CollegeSearch/artifacts/audit/production-readiness-2026-09-10/11-fields-search.png>)

## Review limits and next release decision

This was a strong bounded readiness review, not a formal penetration test or accessibility certification. It combines source review, current official downloads, fresh builds/tests, HTTP checks, dependency triage and real browser interactions. No load benchmark, real-device/Safari/Firefox matrix, screen-reader session, hosted authenticated database exercise, email/OAuth delivery, production incident alert or rollback drill was completed.

The notebook storage read/check/write sequence also has a potential overlapping-tab race. A deterministic in-memory interleaving reproduced two successful writes with one replacing the other; a real browser concurrency race was not reproduced. Treat that as an open candidate, separate from the confirmed ordinary-navigation loss.

Prioritize: (1) truthful feature/privacy scope and passing code/dependency gates; (2) source maintenance plus durable student research; (3) narrow-screen fixes and scoring context; (4) hosted auth/privacy completion if accounts are included; (5) reviewed release and hosted smoke/rollback checks. Broader college/program/deadline coverage can then grow from a reliable beta.
