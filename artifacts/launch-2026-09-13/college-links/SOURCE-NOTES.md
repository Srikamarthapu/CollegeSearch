# Official action links, 2026-09-13

The manifest contains all 50 colleges from the repository cohort and exactly four action slots for each college. There are 186 verified links and 14 explicitly unavailable slots: 45 colleges have all four verified, four have partial coverage, and UC Merced has no verified action links in this check. A missing action does not mean the university lacks the resource.

## What verification means

`status: verified` means an actual HTTP 200 response was fetched on the date in `checkedOn`, and its title, headings, body, or explicitly published calculator link were manually reviewed for the requested page purpose. It does **not** certify the current application cycle, every program's availability, tuition/aid amounts, calculator accuracy, or completion of an interactive calculator. No applications, financial inputs, login sessions, or forms were submitted. No deadlines, costs, eligibility policies, or college metrics were imported from these pages.

`publisherSourceUrl` identifies the official page that published the link, or the official destination itself when first discovered in primary-domain search. External calculators are used only with an explicit link on a fetched university page. The nine external destinations are College Board or Meadow; their university publisher, link label, and matching link URL are retained in `college-actions-evidence.json`. MIT's admissions domain is published by MIT's `web.mit.edu/admissions-aid/` page; its discovery chain is in `college-166683.json`.

Official first-year pages sometimes contain both requirements and application dates. Those two actions intentionally share a URL when both purposes were reviewed. No dates are copied into the product. Program links point to specific university major directories or catalogs. Direct program indexes at Fresno and San José State returned HTTP 202; their HTTP 200 current catalog landing pages are supplied with explicit notes. Fullerton's functioning university degree directory replaces its blocked catalog degree index.

## Unavailable actions

| College | Actions | Observed failure |
| --- | --- | --- |
| UC Santa Cruz | Admissions, deadlines | HTTP 403 from the official admissions pages |
| Illinois Urbana-Champaign | Admissions, deadlines | HTTP 504 from the official undergraduate admissions site |
| Michigan–Ann Arbor | Admissions, deadlines, programs | HTTP 403 from the official undergraduate admissions pages |
| Virginia | Admissions, deadlines, calculator | HTTP 403 from admissions instructions and the financial-aid estimate page |
| UC Merced | All four | HTTP 403 from the official application, dates, majors, and financial-aid pages; the original main-site request also timed out |

All unavailable actions omit `url`. Their `publisherSourceUrl` is a real attempted official source, with the observed failure in `note` and detailed attempted URL/error in the evidence JSON. Search-index snippets were used to discover official sources, not to override a blocked live fetch or invent a verified URL.

## Older calculator years remain visible

The following are live official pages, but their own text describes older cost years. This is recorded in each action's note; the UI should retain these notes.

| College | Official page's stated limitation |
| --- | --- |
| Cal Poly San Luis Obispo | 2026–27 updates pending; outputs currently use 2025–26 |
| UC Irvine | Calculator described as 2024–25 |
| UC Santa Cruz | Calculator identifies 2023–24 |
| Georgia Tech | Costs described as a historical 2023–24 snapshot |
| UT Austin | Landing-page description still refers to 2024–25 |

These pages were not repurposed as current price evidence. The app should prompt the student to confirm the university's current estimate and restrictions. Other calculators' output years were not independently exercised.

## Campus and degree scope

The WSU first-year and dates links are for Pullman; Tri-Cities candidates were rejected. Ohio State first-year links explicitly target Columbus. UW uses Seattle's Office of Admissions. ASU degree search also contains online offerings; WSU degree search spans campuses; NYU's undergraduate catalogs and first-year instructions cover multiple campuses. Their notes instruct students to choose the appropriate campus. Columbia's bulletin directory covers its undergraduate schools rather than presenting Columbia College's list as the entire university. Mixed degree directories clearly identify bachelor’s degrees and have notes where useful.

## Evidence and reproduction

- `college-actions.json`: proposed product artifact; schemaVersion 1, all 200 explicit slots.
- `college-actions-evidence.json`: per-action HTTP status, checked timestamp, title/headings, body SHA-256, university publisher and published-link evidence, and unavailable attempts.
- `college-<unitId>.json` and `pages/`: complete discovered-page evidence, including rejected pages and HTTP failures. A failed candidate was not hidden by selecting a successful alternative.
- `crawl.py`, `supplement.py`, `focused.py`, `additional.py`, `final_candidates.py`: bounded discovery/fetch passes. These scripts and the preserved records show actual official-link traversal and primary-domain search seeds. Additional targeted candidate fetches are preserved in the same records with `discoveredFrom` and `linkLabel`.
- `selections.py`, `build_manifest.py`: reviewed selections and reproducible compilation. Running the compiler uses the saved evidence; it does not renew a source's checked date or approve new content.
- `check_links.py`: offline contract validation by default. `--live` fetches all selected destinations, their official publishers, and previously unavailable attempted pages with a bounded pool. It records all failures and content changes, restricts unexpected redirect hosts, and never rewrites the approved manifest. A previously unavailable source responding now requires manual purpose review. Body changes can be dynamic markup; they require inspection, not blind repinning.

Commands used for final compilation and contract verification:

```sh
python3 /tmp/collegesearch-launch-links-2026-09-13/build_manifest.py
python3 /tmp/collegesearch-launch-links-2026-09-13/check_links.py --output /tmp/collegesearch-launch-links-2026-09-13/contract-check.json
```

An optional subsequent live monitor run is:

```sh
python3 /tmp/collegesearch-launch-links-2026-09-13/check_links.py --live --output /tmp/collegesearch-launch-links-2026-09-13/live-link-check.json
```

The full live discovery run supplied the HTTP checks for this delivery. The optional subsequent monitor was not run again merely to repeat the same requests; its offline contract check passed. This work did not modify the CollegeSearch checkout.
