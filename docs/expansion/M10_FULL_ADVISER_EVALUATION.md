# M10 — full runtime adviser evaluation

October 4, 2026. Deployed and verified on the existing production alias.

## What changed

The full runtime matrix exposed two repeatable conversation defects. Generic wording such as “use only the verified college records” was mistaken for an unknown institution. An explicit tuition-and-fees budget could lose its cost basis and trigger a redundant question. Both are repaired with conservative application checks; residency is still never inferred from a desired location. Ambiguous, negated and conflicting budget wording remains unresolved. Fail-first regressions reproduced both bugs; 25 engine tests pass, including a later contraction-negation correction.

The provider now rejects HTTP redirects so request payloads stay at the configured endpoint and redirect hops cannot bypass request caps.

Ranking output remains strictly limited to distinct retrieved IDs. Two initial malformed ranking results were rejected. Their exact invalid shape was not retained, so their cause is **unconfirmed**, not established to be invented IDs. A separate replay succeeded. New diagnostics record bounded counts of noninteger, duplicate and unknown integer values without storing raw rejected values. No validation bypass or extra retry was added.

The evidence audit now checks displayed values, labels, full citation metadata and broad-field qualifications against canonical catalog records. It accepts only registered source URLs, including approved alternate institutional pages, and detects duplicate/missing evidence. New reports retain safe public metadata that older sanitized projections omitted. Source-file links and the college UNITID were added to expanded adviser evidence so the exact published artifact is easier to find; the catalog release itself is unchanged.

## Evaluation evidence

All provider calls used synthetic prompts and public catalog evidence, the actual application engine/retriever, and read-only RPCs in the designated disposable local database. The complete 9,070-vector index was bound to the 3,912-college release `sha256:29f7d5e5b891020771ce191ae16d4da8250487a51682ba9763f01cb6ccb64563`. Chat: `nvidia/nemotron-3-super-120b-a12b` with bounded Lightning capacity fallback. Embeddings: `nvidia/nemotron-3-embed-1b`, 2,048 dimensions. The version string `reviewed-2026-10-04-operator` is an operator label, not an immutable provider revision.

| Run | Result | HTTP calls | Evidence |
|---|---|---:|---|
| Initial full matrix | 30/32 completed; two rejected ranking responses; 22/24 correct follow-ups | 65 | 192/192 basic citation bindings |
| Ranking diagnostic replay | Both previously rejected cases completed | 6 | 36/36 bindings; synthetic identifier case passed |
| Follow-up repair replay | Both repaired cases completed with correct questions | 4 | 18/18 bindings |
| Full repaired matrix | 32/32 completed; 26/26 expected questions; 12/12 boundaries; 5/5 requested-ID scope and coverage | 66 | 244/244 basic bindings |

The final full run had 19/20 raw interpreter intent matches. In the mixed known/unknown comparison case, the model chose `compare`; the application correctly stopped before retrieval and returned no recommendations. Full-turn p50/p95 was 2,245/4,204 ms in this local synthetic harness, not public-route latency. Across these four matrix runs: 141 HTTP calls, 391,175 returned chat tokens and 120 embedding tokens. Failed-attempt provider usage may be missing; these figures do not establish production prices or a sustainable free allowance.

An independent agent review reconciled all 52 recommendations, 192 displayed facts and 52 broad-field tags in the repaired run, finding no hard-filter or numeric mismatch. It is **agent review, not human review or a student pilot**. A second offline audit checked all archived metric/period/cohort/field/source information (192 initial, 244 repaired) with zero mismatches. Older archived projections omitted slug, definition and check date, so those absent fields were explicitly excluded from retrospective claims. Future runtime reports and the new chained evaluation check the complete fields directly.

A new dry-run-by-default evaluator exercises five actual consecutive turns: California engineering, public only, small campus under 5,000, any size, and comparison of the first two actual preceding recommendations. It carries real prior preferences/IDs and enforces a maximum of 24 provider HTTP requests. The first run completed all five turns with 22 preference checks, 15 retention checks, 18 relevant recommendations and both comparison identities intact. Its evidence checker falsely rejected 16 URLs because it initially omitted registered alternate source URLs; this harness defect was corrected and regression-tested. The original failed-check report is retained; the final rerun completed all five turns with zero failed checks: 22/22 preference checks, 15/15 retained-preference checks, 18 recommendations meeting the declared hard constraints, both exact comparison identities, 53/53 complete fact bindings and 18/18 complete program bindings. Each conversation run used 15 HTTP requests and 28 read-only database RPCs. Total M10 provider HTTP requests: 171; conversation token usage was not captured, so the matrix token subtotal above is not a complete M10 total.

Raw artifacts are ignored under `work/`: `m10-full-matrix.log`, `m10-ranking-diagnostics.log`, `m10-followup-repair.log`, `m10-full-repaired.log`, `m10-archived-evidence-binding.json`, `m10-full-answer-review.md`, and the timestamped NVIDIA/conversation reports. Review checklist: `work/m10-quality-review-plan.md`.

## Setup and limits

The preserved baseline started with three synthetic saved rows and zero vectors. An initial clone attempt using a non-owner role failed; the actual owner created the disposable clone. Two index import attempts used the wrong expected-existing-index metadata and rolled back completely. A fresh SQL export with the correct empty-index expectation then installed all 9,070 vectors. These were local setup failures, not hosted mutations.

Runtime mode uses the immutable corpus, so the `retrieved-passage-injection` case does **not** inject a malicious retrieved passage. Fixed-harness injection tests remain separate evidence. Useful ranking order, unusual tiny/online undergraduate cohorts, richer written comparisons and broader student behavior need pilot review. Valid source bindings alone do not prove recommendation usefulness. The full matrix also predates the narrow contraction-negation and source-link-only follow-up edits; focused regressions and the final chained run cover those changes without claiming another full provider rerun.

Public AI remains disabled pending a production-permitted provider route; no hosted vectors or NVIDIA credentials were enabled. Stripe remains deferred and the app stays free. Hosted email/signup/recovery/account-deletion journeys and an observed scheduled retention run remain external release gates. Final build/test/UI/deployment and disposable-clone cleanup results are recorded below.

## Final review corrections

The final tooling review found that zero-card answers could inflate the evidence-binding pass denominator, conversation reports did not fail empty recommendations or wrong follow-ups, failure report statuses still exited zero, and native fetch could follow uncounted redirects. The harness now treats empty matrix evidence as not applicable, checks minimum recommendations and unanswered follow-ups for each sequence step, returns nonzero on unsuccessful conversation/partial matrix runs, and rejects redirects. Central provider requests also disallow redirects. Regression tests cover these cases. The saved final five-turn answers were re-audited offline: all five recommendation minimums and all five unanswered-budget follow-ups passed, preserving the earlier 71/71 complete bindings without additional provider calls. `work/m10-conversation-final-recheck.json` retains that evidence.

## Final local verification

- Full suite: **488/488 passed**; Vinext and native Next production builds, TypeScript, ESLint and whitespace checks passed. The first lint pass found one unused evaluation helper, removed before the clean final lint. The final post-review suite passed 488/488; both production builds, TypeScript and lint were rerun successfully.
- Actual adviser card component rendered with a recorded synthetic answer in the existing isolated UI fixture. Expanded evidence passed 1,440px and 320px wrapping checks (no horizontal overflow), keyboard expansion and keyboard focus on the exact source-file link. Screenshots: `outputs/m10-adviser/source-details-desktop.png` and `source-details-mobile.png`. A fixture-only Vite HMR duplicate-root warning was captured after replacing its answer JSON; this is not a production runtime observation. The fixture uses stubbed accounts/history; no hosted-save or real provider/browser claim is inferred.
- Disposable evaluation database was dropped; both generated SQL exports were removed. Readback confirms the clone is absent and the preserved baseline still has **3 synthetic saves and 0 embedded passages**. Logs and canonical embedding artifacts remain ignored locally.
- Code commit `ccea75d` is deployed in READY production deployment `dpl_FnzxP5GgbznbDvuu38w6tqYWWHGZ` (`https://collegesearch-ejpjlc0pi-swis-projects-066d8b1d.vercel.app`), aliased to `https://collegesearch-steel.vercel.app`. No catalog republish or public-provider activation occurred.
- Hosted HTTP regression checks passed name search, 24-record pagination across the 3,912 records, exact institution-level/ownership filters, saved-ID detail lookup, synthetic preference matching, malformed/oversized body rejection, featured defaults, combined filters and fractional admission boundaries. `/adviser` returned 200 and anonymous `/api/adviser` returned 401.
- Live browser checks verified featured ordering and adviser entry, accurate inactive-provider copy, free navigation paths and no horizontal overflow at 1,440px/390px. No console errors were captured on the production verification tab. The temporary viewport override was reset. Screenshot: `outputs/m10-adviser/live-explorer-desktop.png`. This is hosted browsing/availability evidence, not signed-in Auth or live generation evidence.
