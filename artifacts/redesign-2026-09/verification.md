# CollegeSearch redesign verification

September 5, 2026. Implemented and reviewed in the existing checkout. This is a local production preview, not a public deployment or a student usability study.

## Result

Discovery now begins with usable research controls and recognizable colleges. The design uses cool paper, navy text, a restrained blue action color, readable Newsreader/Geist typography, and a credited photograph of Berkeley. Motion and Lenis remain restrained and respect reduced-motion preferences. No new animation or WebGL dependencies were added.

Profiles, comparison, the field catalog, admissions context, matching, saved work, and account surfaces share the updated visual system. College cards keep net price, overall admission rate, completion definition, reporting periods, and expandable source explanations together. Comparison prioritizes cost before admissions and outcomes.

New browser-only notebooks store notes and four research steps for each college. Guest and account notebooks remain separate; edits cannot cross an unverified account boundary. The shortlist exports supported college metrics, reporting periods, source links, and saved notebook content to CSV. Match preferences and discovery filters can be shared in URLs.

## Automated verification

- Production build and all 199 tests passed on the final implementation.
- ESLint, TypeScript, and `git diff --check` passed.
- Offline source and dataset verification passed. The underlying college dataset was not regenerated or changed.
- Added focused checks for notebook scope isolation, draft retention during account verification, malformed/unavailable storage, stale saved revisions, CSV escaping and formula safety, CSV generation from every actual projected college, and validated matching URL state.
- Rendered-response checks preserve source and cohort semantics and verify the response nonce reaches the Vite style-loading mechanism.

## Browser checks

The in-app browser was exercised at desktop 1440×1000 and phone 390×844, using the final production server for the closing pass.

- College aliases and keyboard suggestions: typing `berk`, ArrowDown, and Enter opened Berkeley; Back restored the search.
- Empty search, clear-all recovery, grid/list selection, field sorting, and clearing a field after sorting by field were exercised. Clearing the field restores name sorting.
- UC quick filter and California plus a $20,000 net-price cap produced the expected nine and 22 colleges respectively.
- Mobile filters open as a contained dialog; the result count updates, the apply control returns to results, and mobile navigation returns keyboard focus when closed.
- College save, comparison selection, profile navigation, notebook editing, checklist persistence, and page-to-page notebook reuse were exercised in the development preview.
- The production comparison preserved both selected college identifiers across its edit flow and Back navigation. Desktop heading contrast was inspected and corrected; phone comparisons use the existing stacked representation.
- The shortlist renders notebooks and export controls. CSV generation is covered against the real client data shape; the browser reports that the CSV is ready. The in-app download-event bridge did not expose a completed file event, so that bridge is not claimed as verified.
- Matching restored Engineering and California from a shared URL, explained its ten displayed results, copied the share link, and reset preferences and the URL.
- Field search returned Engineering and its detail route retained dated program evidence. Admissions selection displayed Berkeley's preliminary Fall 2026 institutional rate with source and interpretation limits.
- Fresh production page loads had no console errors or warnings. Home phone layout had no horizontal document overflow.
- The sign-in dialog clearly reported that accounts are unavailable in this preview and retained the usable guest workflow.

## Problems fixed during the review

1. Navigation could discard router history state or let an outgoing filter page rewrite another route's query. Writers now preserve history state and hashes and are restricted to their owning routes.
2. Clearing a selected field could leave an unavailable field-sort mode active. It now returns to name sorting.
3. The last load-more button could promise more records than remained. Its label now uses the actual remaining count.
4. Dynamic CSS module styles were blocked by the existing strict CSP. The trusted request nonce now reaches Vite through `meta[property="csp-nonce"]`, without relaxing the policy. [Vite documentation](https://vite.dev/guide/features#content-security-policy-csp)
5. Generic graduation labels could imply every federal completion observation was a six-year bachelor's graduation statistic. Card and profile labels now distinguish the available definitions.
6. Research export initially assumed fields absent from the client projection. It now consumes the actual projected shape and has a regression test against all 50 records.
7. Same-account session checking could remount a notebook and discard its draft. Verified editors and their card collection are retained, hidden, and disabled through that temporary state.
8. Visual review caught a white comparison heading inherited from the old theme and oversized field headings on phones. Both were corrected in the source styles.

## Scope and handoff

The collection contains 50 reviewed colleges, with a California emphasis. Broad-field evidence is not a current exact-major catalog. Admission rates are institutional records, not personalized chances. Account synchronization still requires the previously documented hosted Auth configuration and live service checks; no account email or OAuth flow was sent during this redesign.

Notes remain in the browser even when a college list can sync. Removing a saved college retains its notebook. The privacy page and README document clearing notebooks and what appears in shared preference links.

Local production preview: `http://127.0.0.1:4173/`. For later runs, use `npm run build` followed by `npm start -- --port 4173`.

See [design research](design-research.md), [initial functional audit](functional-audit.md), and the numbered before/after screenshots in this folder.
