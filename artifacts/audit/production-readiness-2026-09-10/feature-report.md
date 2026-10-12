# CollegeSearch production feature source audit — 2026-09-10

Scope: read-only source review of current checkout at `/Volumes/Seagate /CollegeSearch`, focused on CampusCarousel, ResearchNotebook, research CSV, Find my fit, and profile claims. The root agent owns browser/build testing and rename. No checkout edits, browser operations, Sites operations, database calls, or repairs were performed by this audit. Temporary experiment/report files are under this directory.

## Findings suitable for the main ledger

### F1 — P1 if the requested profile is a release requirement; otherwise P2: advertised application profile is not implemented

- Primary location: `app/privacy/page.tsx:108–121` (narrowest useful anchor: 110).
- The privacy page says Find my fit keeps GPA, grading context, course notes, activities, priorities, and has a Clear profile action plus a downloadable review brief. None of those inputs, storage functions, clear/export actions, or an application-profile component exist in the current `app/match/MatchTool.tsx`. Its state at lines 127–134 is preferences, active criteria, hydration and share state; controls from 332–477 are field/location/ownership/price/size/setting/weights. `app/match/scoring.ts:43–52` has no academic-profile fields. Current account UI explicitly says `Academic profile — Not collected or stored in this release` at `app/account/AccountPageClient.tsx:165–166`.
- Repro: open `/privacy`, follow its promise to `/match`, and try to enter GPA/course/activity information, clear a profile, or export the promised brief. Those controls are absent. Existing /tmp profile proposals are not evidence of integration.
- Impact: a requested capability is missing and public-facing privacy/product copy describes data collection/controls that the shipped route does not provide.
- Evidence: source inventory/search and full current MatchTool inspection, rather than memory. Whether this is a P1 scope blocker depends on the precise accepted user request (root has that context).

### F2 — P2: ordinary result changes discard unsaved research drafts

- Primary location: `app/components/ResearchNotebook.tsx:98–110` (draft is component-local, and only beforeunload is protected).
- Call sites: `app/match/MatchTool.tsx:171–177` resets result inputs; lines 222 and 534 limit/map current results; lines 633–634 mount each result's editor. `app/saved/SavedColleges.tsx:374–383` removes a card containing the editor without consulting its dirty state. The only durable write is ResearchNotebook save handler at lines 126–137.
- Repro: select a preference to show matches; expand a result notebook and type a new note without Save research; choose Reset preferences (or a filter that drops that college from the top ten); restore the same choices and reopen the notebook. The component was unmounted and the new text has no storage copy. Similar loss occurs when removing a saved card with a dirty notebook. Client-side navigation may also unmount the editor without a beforeunload event.
- Impact: normal worksheet refinement or list maintenance can silently discard a student's research. An unsaved-changes status and document unload handler do not protect component unmounts.
- Evidence limit: source-deterministic mount/state path; this sub-audit did not operate the browser. Root was sent the concrete browser reproduction.

### F3 — P2: Export research can silently export an older version than the visible editor

- Primary location: `app/saved/SavedColleges.tsx:140–158` (narrow anchor: 143).
- The export function reads each notebook from localStorage, checks only read status, and reports success. It has no access to open editors' dirty state; `app/components/ResearchNotebook.tsx:98–99` owns drafts privately. The Export research button at SavedColleges line 292 stays enabled with a dirty editor.
- Repro: save a note as `Previously saved research`, change the open editor to `Latest unsaved changes`, then select Export research. The exported CSV includes the old note and the UI reports the CSV ready. A never-saved draft exports as blank because missing storage is `ready` with an empty notebook.
- Impact: a download that appears to back up the current research can omit the latest work. The success copy does say “saved notes”, but the action neither alerts that visible edits are excluded nor gives a save-all path.
- Evidence: `/tmp/collegesearch-prod-features-2026-09-10/experiments.mjs` mirrors the exact export read path with real Berkeley client data and demonstrates stale CSV output while every read status is ready. Browser click validation remains with root.

### F4 — P2: the cross-tab conflict check is not an atomic compare-and-write

- Primary location: `app/lib/research-notebook.ts:213–217` (narrow anchor: 214).
- Revision equality is checked with getItem, then a separate setItem overwrites the whole notebook. There is no transaction/lock around that pair. Two contexts can both read the expected revision before either replacement; both calls then return saved and one complete note wins. The existing test at `tests/research-notebook.test.ts:101–107` covers only sequential stale saves, not an interleaving.
- Repro evidence: the injected storage schedule in `experiments.mjs` reads A's old value, lets B check and save, then returns A's old read so A saves over B. Both results are `saved`; storage retains A and drops B. `experiments.jsonl` records the result.
- Impact: the documented newer-copy conflict protection is incomplete for overlapping tab writes.
- Evidence limit: a deterministic dependency-interface experiment establishes missing atomicity; it does not measure a live browser's scheduling or reproduce real concurrent tabs. Keep this caveat or treat as a candidate until an actual two-tab stress reproduction is available.

### F5 — P2/P3: the notebook erasure instructions leave the list category behind

- Primary location: `app/privacy/page.tsx:95–101` (narrow anchor: 96).
- The stated way to erase notebook contents is to “clear the notes and checklist and save.” `app/components/ResearchNotebook.tsx:174–177` stores the separate category, and `app/lib/research-notebook.ts:145–150` continues projecting it when notes and checked are empty.
- Repro: save a notebook with the Reach category, some notes and one checkbox. Follow the stated erasure steps. Storage still contains `{"version":1,"notes":"","listRole":"reach","checked":[]}`. The experiment verifies this exact output.
- Impact: a student following the stated erasure instructions leaves their self-assigned category in storage and future CSV exports. Tell them to reset the category too or provide a complete notebook-clear action.

### F6 — P3: exported profile references are relative paths

- Primary location: `app/lib/research-export.ts:14`.
- The CSV's College profile field is `/colleges/<slug>` rather than a complete URL. The export loses the site's origin when opened in a spreadsheet or shared with a counselor, so these entries are not directly usable links.
- Repro: export a saved Berkeley row and inspect the profile cell: `/colleges/university-of-california-berkeley`. This exact result is asserted by `experiments.mjs`.
- Impact: source URLs work, but the application's own promised profile reference does not work independently of the browser page.

## Additional evidence / overlap with data audit

`app/match/page.tsx:41–49` projects completion and earnings values, periods and publishers but drops detailed definitions; scoring at `app/match/scoring.ts:173–190,326–364` combines them into a ranking. CSV similarly exports only value/period/source per observation (`app/lib/research-export.ts:15–17`) and omits exact population/definition. The independent data review confirmed all 50 selected earnings observations use the same outcome horizon, cohort and dollar year; there is no current earnings-period mismatch. Graduation population comparability is covered in data-report.md.

Notebooks may be written for colleges not on the saved shortlist (match results and college profiles), but the only CSV action exports saved colleges. This is a usability/completeness consideration rather than an asserted defect because the export lives on the saved-list page and is described in that context.

## Carousel source assessment

No concrete carousel blocker found in source. All five campus records have corresponding five transform positions; inactive slides are aria-hidden/inert and removed from tab order. Manual navigation stops playback. Focus entering the carousel stops playback. Hover, document visibility, intersection visibility and reduced-motion state gate autoplay; reduced-motion also removes the CSS transition. Active photo source/creator/license/year and crop disclosure are rendered. Browser testing should still check real image crops, responsive text, keyboard focus, pause/play and inactive-slide focus behavior. This sub-audit did not certify their visual/runtime behavior.

## Validation performed

- `node --test tests/research-notebook.test.ts tests/research-export.test.ts tests/match-url-state.test.ts`: 25 tests passed; log `unit-tests.tap`.
- `node /tmp/collegesearch-prod-features-2026-09-10/experiments.mjs`: three experiment assertions passed; output `experiments.jsonl`.
- Experiments mutate only in-memory Map-backed storage and temporary report/script files, never browser storage or checkout source.
- Existing tests cover scope separation, malformed/unavailable storage, sequential stale saves, retention through re-verification, CSV quoting/missing values, and URL round trips; they do not establish UI unmount protection, dirty-editor export, or concurrent notebook writes.

## Memory provenance for root final response

Memory registry was used only to locate relevant components and prior QA expectations, all material current findings were reverified from source. If using this report in the response, include the relevant memory citation alongside the root's existing block: `MEMORY.md:115–125` (entrypoint/local research boundaries and QA expectations), rollout id `01a07490-72b5-7d82-bed5-64f04df5d655`. No memory-derived assertion is claimed current without source verification.
