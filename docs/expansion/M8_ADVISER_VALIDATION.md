# M8 adviser and retrieval validation

Status: committed as `0058565`, pushed and deployed October 4, 2026. Vercel deployment `dpl_5GbXgEVYftXP4QcoJDDgPGcAky64` was READY on the production alias; the user redirected work to M9 before post-deployment browser verification. The preceding M7 turn published the source-audited 3,912-college release as `58cafba`. Public AI remains disabled; Stripe is deferred.

## Acceptance for this milestone

1. Replace the fixed-candidate evaluation gap with an explicitly selectable runtime-equivalent mode. Use the actual preference filters, structured fact RPC, hybrid retrieval, institution/source validation, and conversation state. Keep the earlier synthetic mode labeled honestly.
2. Evaluate keyword-only, vector-only, and hybrid passage retrieval against a predeclared judged query set. Separate positive relevance metrics from unsupported-topic probes, and distinguish raw nearest-neighbor results from verified factual support.
3. Run bounded internal NVIDIA calls using synthetic questions and public college evidence only. Keep model/version labels, actual request/token counts, errors, and limitations. Never enable public AI based on trial results.
4. Review remaining hosted Auth/email and scheduled-retention evidence without sending unapproved emails, creating real-user accounts, or changing hosted credentials.
5. Preserve the live catalog, hosted private records, and local baseline; finish with focused checks, a result ledger, and remaining release gates.

## Isolated environment

A disposable database `collegesearch_m8_retrieval_verify` was created from the task-owned local `collegesearch_m2_verify` baseline in Docker container `collegesearch-goal-db-20261004`. The validated M7 embedding artifact was exported for this exact database and installed atomically. Readback confirmed the current `29f7d5e5…` release, 9,070/9,070 vectors, `nvidia/nemotron-3-embed-1b`, version label `reviewed-2026-10-04-operator`, and three synthetic saved rows. No hosted vectors were written.

The temporary SQL export had SHA-256 `64e9eacfd190c6d971f4194910b0ae032405d4452811944076f329dded1bc44b`. After all evaluations finished, the disposable clone and generated SQL export were removed. Readback confirmed the clone was absent and the baseline retained its three synthetic saved rows and zero embeddings (`work/m8-cleanup.json`). The checksummed embedding artifact and reports remain ignored locally for reproducibility. No hosted database mutation occurred.

## Retrieval benchmark result

The frozen 21-question fixture contains 18 supported questions and three unsupported-topic probes. Every supported selector matched at least one canonical passage before evaluation. Judgments use exact CIP degree-availability locators plus institution, jurisdiction and ownership metadata; no judgments were changed after looking at ranks.

One NVIDIA query-embedding request covered all 21 questions: 317 reported input/total tokens, 1,240 ms, one attempt, no fallback. Two read-only anonymous-role SQL transactions checked the full 9,070-passage index and ran the three retrieval modes. All returned rows passed exact release, institution, source, content-hash and embedding-version binding checks.

| Global passage search | Precision at 5 | Recall at 5 | Mean reciprocal rank at 5 | Questions with a relevant top-5 passage |
|---|---:|---:|---:|---:|
| Keyword | 10.0% | 19.81% | 0.280 | 7/18 |
| Vector | 44.44% | 44.88% | 0.872 | 17/18 |
| Hybrid | 43.33% | 44.84% | 0.872 | 17/18 |

These are passage-level metrics, not answer accuracy. Broad queries have up to 135 relevant passages, so a five-result cutoff limits their possible recall. Named Berkeley/Davis engineering evidence achieved 2/2 passage recall with vector and hybrid retrieval. Hybrid did not improve on vector search in this small set. All modes missed the top-five evidence for the Texas private-nonprofit engineering query: four top neighbors were Texas private nonprofits without Engineering evidence, and the fifth was public Texas A&M. Semantic similarity alone did not enforce field and ownership together. A separate read-only check through the application's actual retriever returned 16 Texas private nonprofits with verified Engineering availability and 17 bound passages using structured/keyword retrieval; that bounded sample is not complete eligible-college coverage. Evidence: `work/m8-runtime-structured-filter.json`.

Each unsupported query still returned 20 nearest neighbors in vector and hybrid mode. They are explicitly recorded as unsupported neighbors, never successful factual evidence. Keyword search returned none for these probes. The result reinforces the need for the adviser's intent boundaries and source validation rather than treating a similarity hit as permission to make a claim.

Raw report: `work/retrieval-evaluation-29f7d5e5-1791135198227.json`. Reusable query cache is bound to the fixture SHA, release, query order, model and operator version label. This version label is not an immutable provider revision. No vectors were uploaded to the hosted database.

## Verification and release

All 463 tests passed, including the Vinext build, 21 focused engine cases, 11 NVIDIA evaluator checks and nine retrieval-benchmark checks. ESLint, the native Next production build, TypeScript and `git diff --check` passed. Native Next ran after Vinext to restore its generated route types. Its existing warning about ignoring the home-directory lockfile outside this repository remains nonblocking. Logs: `work/m8-full-tests.log`, `m8-lint.log`, `m8-next-build.log`, and `m8-typecheck.log`. Disposable-clone cleanup, commit, push and deployment are complete. Subsequent live explorer verification is recorded in M9; public AI was not enabled.

## Initial runtime adviser run

The first 30-case run used the actual engine/retriever against the anonymous-role local clone, a 110-second turn cap, and a 96-request global ceiling. It completed 28 cases and failed two, using 67 HTTP requests (51 chat attempts, 16 query embeddings) and 83 read-only database calls including preflight. Returned usage: 171,716 chat tokens and 57 query-embedding tokens. A report-counter defect serialized fallback attempts as `null`; it has been corrected in the evaluator, and the original route/operation counters establish five capacity-fallback HTTP requests. The original report remains unchanged. These are returned token totals, not a claim that failed provider attempts were unbilled.

All 238 attached citations matched canonical evidence; all four completed named-college comparisons/references stayed in scope and included the requested colleges. The nine completed boundary cases stopped without retrieval. The report is still partial: one mixed known/unknown request incorrectly reached retrieval and then timed out, while a coordinated ordinal request failed identity validation. Four follow-up-question expectations also failed. Full-turn p50/p95 was 2,064/5,530 ms in this isolated synthetic run, not public browser latency.

Root review traced the ordinal failure to local reference parsing: `first and third colleges` used both coordination and a plural noun, neither accepted by the old regex. The parser now resolves the requested pair, with a focused regression test. Follow-up selection now skips already answered preferences and unnecessary location questions for named colleges. Interpreter guidance explicitly treats standalone preferences as research requests and refuses partial comparisons with unresolved institutions. The subsequent bounded replays below included a second fictional institution name absent from the prompt.

Initial raw report: `work/nvidia-adviser-evaluation-nemotron-3-super-120b-a12b-runtime-m8-runtime-20261004T173434987Z.json`. The original evidence is retained; a successful replay must not erase this initial failure rate.

The first ten-case replay completed all ten requests without provider errors, but only one of five unknown/topic boundaries passed. The question-selection, name-alias and ordinal fixes worked; the stronger model instructions did not reliably protect unresolved institution names. The four failures returned unrelated colleges or a partial known-college comparison. This is a failed relevance check despite all 98 attached citations matching their records. Report: `work/nvidia-adviser-evaluation-nemotron-3-super-120b-a12b-runtime-m8-replay-20261004T174458683Z.json`. It used 26 HTTP calls (18 chat, eight embeddings), no fallback, 41 local read-only database calls, 61,454 reported chat tokens and 28 query-embedding tokens.

The application now independently detects conservative singular institution-name shapes after masking exact resolved identities. Generic and indefinite college preferences remain available. An unresolved-name flag is sent to interpretation and enforces the unknown-information boundary before any retrieval, even when the model chooses a recommendation. This is a bounded name-shape safeguard, not a claim of universal entity recognition; arbitrary abbreviations and institutions without a recognized name shape still need broader pilot testing. Focused tests cover incorrect model recommendations, lower-case names, `University of ...`, mixed comparisons, exact known names and ordinary budget/field preferences. Independent review caught and resolved false positives for `the second college` and `My dream college is Stanford` before the final replay.

## Last provider replay and final deterministic review

All ten selected cases completed, with 10/10 expected follow-up questions, 5/5 unknown/topic boundaries, 2/2 complete named comparisons and 52/52 canonical citations. The two fictional institution names and their mixed known/unknown comparisons stopped before retrieval. The coordinated ordinal comparison returned Berkeley and CSU Long Beach, and the reviewed Stanford/Harvard short-name comparison returned those two institutions. Ordinary field/location preferences and the ambiguous annual budget remained usable.

This run used 18 HTTP calls (14 chat, four query embeddings), zero capacity fallback or embedding retries, and 21 anonymous-role local database calls including preflight. Reported usage was 40,704 chat tokens and 12 query-embedding tokens. Full-turn p50/p95: 1,909/2,505 ms. These timings describe this subset in the local synthetic harness; case mixes differ, and they do not prove public latency or availability. Report: `work/nvidia-adviser-evaluation-nemotron-3-super-120b-a12b-runtime-m8-guard-check-20261004T175532347Z.json`.

The available matrix now has 32 cases, but this provider replay covered the ten changed/failing cases rather than rerunning all 32. Two later deterministic review fixes were checked with fail-first local regressions and the full suite, without additional provider calls: ordinal exceptions now apply only to positions actually resolved, and proposed residency follow-ups obey the same budget relevance rule as automatic follow-ups. The ordinal regression uses one prior recommendation and a mixed request for the first college plus unresolved Third College. Names indistinguishable from valid ordinal references remain a bounded ambiguity requiring broader review. Retain the initial failures and the failed intermediate replay when assessing model reliability. The fixed-candidate malicious-passage probe was not injected into immutable runtime records; its runtime-labeled case is ordinary retrieval, with this limitation recorded explicitly.

Total M8 provider usage across the benchmark and three app revisions: 112 HTTP requests, 273,874 returned chat tokens and 414 returned query-embedding tokens. This is an internal testing count, not a production price or durable free allowance. The local embedded clone measured 695,700,627 bytes versus the 597,675,155-byte local baseline; these include local rehearsal state and are not hosted storage measurements.

## Findings during review

- The M7 `unknown-college` case treated an invented institution name as a general engineering search and returned four unrelated colleges. The harness counted that as valid. This is a real answer-relevance gap, independent of its fixed candidate pool. M8 changes the expected behavior to an explicit unknown-information boundary, including mixed known/unknown comparisons and unsupported housing claims; the failed intermediate replay demonstrated that prompt correction alone was insufficient, leading to the application guard and successful focused replay below.
- The former ordinal fallback changed any `other` intent into a recommendation when a previous college was referenced. That could bypass the unsupported-topic boundary for a housing question. The fallback is removed; an ordinal resolves identity only. Unknown-topic replies also omit unrelated preference questions.
- A blanket single-word alias restriction rejected reviewed names such as Stanford and Harvard. The original curated short names now resolve, while state names and ambiguous shared aliases remain excluded. Uniqueness includes aliases on non-curated records, keeping Northwestern ambiguous. No raw federal alias parsing was broadened. Twenty-one focused engine tests pass, and the final provider replay also resolves Stanford/Harvard correctly.
- The current production deployment had not yet reached its first scheduled 04:17 UTC retention run. Read-only Vercel logs showed two unauthorized inspection requests at 17:11:35 UTC returning 401, which do not count as cron evidence. The next scheduled firing is October 5 at 04:17 UTC. Hosted confirmation/recovery testing requires an owner-controlled inbox; a question requesting one is pending.
- Account-wide usage readback during this milestone: 32% used / 68% remaining; this is a historical snapshot, not a current balance. The two other reset credits are still available and untouched.

## Rendered boundary check

The actual `AdviserWorkspace` component was rendered in a clearly labeled isolated fixture with a stub-classified unsupported housing response. Desktop and 320px checks passed: the response received keyboard focus, no unrelated recommendation cards or follow-up question appeared, the composer stayed available, there was no horizontal overflow, and no browser warning/error was observed. This is interface evidence, not a live-provider or hosted-account result. Captures: `outputs/m8-adviser/boundary-desktop.png` and `boundary-mobile.png`.

## Remaining public-release gates

- Verify a production-permitted provider route and sustainable allowance before enabling public AI; NVIDIA API Catalog trial testing is not production authorization. Hosted vectors remain at zero.
- Complete hosted confirmation/recovery, signed-in saves/history/deletion using an owner-authorized inbox. Local Auth evidence does not prove hosted delivery.
- Observe an actual scheduled retention firing; manual authorized requests and unauthorized inspections are not cron evidence.
- Expand human-reviewed conversation/relevance evaluation beyond this bounded synthetic set, including name shapes the conservative guard does not recognize and richer preference combinations.
