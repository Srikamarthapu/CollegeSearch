# M1 resource links and logo coverage

Audit completed 2026-10-04 against the reviewed 100-institution identity manifest in `data/college-catalog.json`. This note covers official next-step resource destinations and college mark assets. Resource links are navigation aids; they are not evidence for tuition, admissions rates, programs, or any other reported college facts. Fact evidence remains attached to sourced observations in `data/colleges.json` and related reviewed sources.

## Resource coverage

`data/college-actions.json` now has exactly one row for each catalog UNITID, with four action types per row: first-year admissions, application dates, undergraduate programs, and net price calculator. The new 50 rows use their reviewed manifest UNITIDs and canonical slugs; the pre-existing 50 rows and their destinations/statuses were preserved. New rows were checked on 2026-10-04. No application deadlines are copied into action metadata.

| Resource | Existing 50 verified | New 50 verified | All 100 verified |
|---|---:|---:|---:|
| Admissions | 45 / 50 | 48 / 50 | 93 / 100 |
| Deadlines | 45 / 50 | 42 / 50 | 87 / 100 |
| Programs | 48 / 50 | 47 / 50 | 95 / 100 |
| Net price calculator | 48 / 50 | 41 / 50 | 89 / 100 |

A `verified` status means the destination page content confirmed the intended resource purpose. A third-party calculator is marked verified only when an official college page links to it; `publisherSourceUrl` records that institutional page. Shared CSU system resources are identified in notes as campus-selection directories, and older aid-year calculators carry an explicit year note. A candidate URL from the College Scorecard institution file was used only for discovery. The file has no APPLURL field, so deadline destinations were checked independently on official admissions pages. None of these action links establish a data fact.

The following new destinations remain explicitly unavailable because current page content or purpose could not be confirmed. Their action entries omit `url`, retain an official source page, and state the reason.

| UNITID | Institution | Resource | Reason |
|---:|---|---|---|
| 110510 | California State University-San Bernardino | Deadlines | Requirements page did not confirm a current first-year deadline. |
| 115755 | California State Polytechnic University-Humboldt | Deadlines | First-year page did not confirm a current due date. |
| 134097 | Florida State University | Deadlines | Current application cycle was open, but a current due date was not verified. |
| 142115 | Boise State University | Net price calculator | Scorecard destination resolves to a legacy 2023–24 page; current usability was not confirmed. |
| 196088 | University at Buffalo | Deadlines | Page still showed Fall 2026; a current Fall 2027 deadline was not verified. |
| 196088 | University at Buffalo | Net price calculator | Scorecard destination redirects generically; no current official calculator link was confirmed. |
| 200800 | University of Akron Main Campus | Admissions | Official destination could not be accessed for content verification. |
| 200800 | University of Akron Main Campus | Deadlines | No current first-year deadline could be confirmed from accessible official content. |
| 200800 | University of Akron Main Campus | Programs | Official programs destination could not be accessed for content verification. |
| 200800 | University of Akron Main Campus | Net price calculator | Official calculator destination could not be accessed for content verification. |
| 214777 | Pennsylvania State University-Main Campus | Deadlines | The process page did not confirm a current University Park deadline. |
| 214777 | Pennsylvania State University-Main Campus | Net price calculator | The official destination is a tuition estimator, not a verified net price calculator. |
| 216339 | Temple University | Net price calculator | Scorecard destination returned 404; no current official calculator was confirmed. |
| 227216 | University of North Texas | Net price calculator | The Scorecard destination is statewide; no current UNT-linked calculator was confirmed. |
| 228459 | Texas State University | Net price calculator | No current campus-linked calculator was confirmed; the state tool was unavailable. |
| 228723 | Texas A&M University-College Station | Net price calculator | Linked destination is a tuition calculator, not a verified net price calculator. |
| 230764 | University of Utah | Deadlines | A current first-year due date was not confirmed. |
| 230764 | University of Utah | Net price calculator | The destination is a cost calculator; no net price calculator was confirmed. |
| 235316 | Gonzaga University | Admissions | First-year application destination could not be confirmed from accessible content. |
| 235316 | Gonzaga University | Programs | Current undergraduate directory route was not directly verified. |
| 240453 | University of Wisconsin-Milwaukee | Deadlines | First-year page was confirmed, but a current deadline was not. |
| 366711 | California State University-San Marcos | Programs | Page lists colleges, but a current undergraduate majors directory was not confirmed. |

The original unavailable entries remain unchanged: UC Merced has all four resources unavailable; UC Santa Cruz, Illinois Urbana-Champaign, and Michigan Ann Arbor have admissions/deadline entries unavailable; Virginia has admissions/deadline and calculator entries unavailable. Each keeps its prior source, check date, and reason. Do not mark these verified without a fresh visit to destination content.

`app/components/CollegeActionLinks.tsx` renders verified destinations as outbound links and unavailable destinations as plain text, alongside the official publisher/source page. The checked date is per resource row. Keep external calculator provenance on the official institutional page that links to the calculator.

## Verification scope

Review confirmed destination content for intended purpose. It did not verify ongoing availability after the check date, program-level claims, numeric admissions deadlines, calculator outputs, or current-year financial inputs unless the action note calls out an aid year. Recheck links and aid years before a future release. Failed or ambiguous content checks remain `unavailable`; the action directory does not substitute for fact-source review.

## Logo coverage

The two current logo source records cover the existing 50 colleges, and the source rows contain a local asset path, origin URL, and usage note. Preserve those rows and files. `CollegeLogo` now renders a local mark only when the slug has a source-recorded asset; for any college without one, it renders a short text monogram derived from the institution name. The monogram is decorative and hidden from assistive technology because the college name is already displayed by its containing card/profile. No guessed marks or placeholder logos are added.

`tests/logo-coverage.test.mjs` checks the source records, asset paths, usage notes, fallback mapping, and monogram behavior. It will allow future reviewed logo sources to be added while requiring each recorded file to exist. New-college mark sourcing is optional; a real official mark should only be added after its provenance and permitted use are reviewed.
