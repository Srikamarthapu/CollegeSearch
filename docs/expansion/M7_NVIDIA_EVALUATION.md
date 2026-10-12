# M7 NVIDIA evaluation evidence

**Run date:** 2026-10-04
**Status:** Internal synthetic evaluation and local retrieval checks completed. Public adviser generation and hosted embeddings remain disabled.

## Chat evaluation

The corrected 24-case run used `nvidia/nemotron-3-super-120b-a12b`, fixed local candidate/evidence sets, synthetic student prompts, and a 1,024-token response ceiling. The harness allows at most 48 HTTP calls per run and one provider attempt per operation; fallback was disabled for comparison. It does not call Supabase or use student records.

| Model | Valid cases | HTTP requests | Input + output tokens | Request latency p50/p95 | Full-turn latency p50/p95 | Main failure |
|---|---:|---:|---:|---:|---:|---|
| `nvidia/nemotron-3-super-120b-a12b` | 23/24 | 37 | 108,967 + 2,687 = 111,654 | 716 / 2,019 ms | 1,222 / 2,737 ms | One HTTP 429 on the synthetic-identifiers case; one attempt, no retry |
| `nvidia/nemotron-3.5-lightning-30b-a3b` | 22/24 | 37 | 109,039 + 2,805 = 111,844 | 2,497 / 8,775 ms | 3,697 / 9,794 ms | Two invalid contract choices |
| `nvidia/nemotron-3-ultra-550b-a55b` | 13/24 | 34 | 62,310 + 1,803 = 64,113 | 2,765 / 25,002 ms | 5,071 / 25,004 ms | Nine HTTP 503 responses and two timeouts |

For Super's 23 valid cases, the automated rubric matched all 10 applicable intent checks, 14/14 expected fields, 11/11 states, 3/3 explicit college IDs, 17/17 clarification checks, and 6/6 safety-boundary checks. Recommendations stayed within the supplied candidates in 23/23 valid answers. The app attached 235/235 source citations from its canonical evidence rows; the model did not author citation URLs. Latencies are non-streaming request/full-turn measurements, not first-token measurements.

The evaluator stores no raw prompt or freeform provider prose. It retains schema-validated interpretations and the structured answer assembled by the app from canonical evidence so that results can be reviewed. A source-binding audit covered 49 recommendations, 186 numeric facts, and 49 broad program fields; the rendered college identity, facts, years, and citation bindings matched the canonical dataset and adviser builder in all checked rows. A manual spot check of state, field, size, and ownership examples found that selected colleges matched those explicit filters. The fixed-candidate evaluation harness included broader alternatives even when a prompt named a specific college, so its UC Berkeley versus UC Davis case included Allan Hancock College as a third option, and its CSU Long Beach research case also added Allan Hancock. This is a harness-fidelity limitation, not a confirmed runtime bug: the runtime `publicCollegeCandidates` path filters candidates to explicit college IDs. Exact-college ranking should be reevaluated with runtime-equivalent candidate selection; broader ranking relevance remains open. No freeform provider prose is emitted in this contract. The one 429 also means the 24-case run was incomplete; no reliability or unlimited-free-use claim follows from it.

The corrected Super report is `work/nvidia-adviser-evaluation-nemotron-3-super-120b-a12b-corrected-candidates-human-review.json`. Its operator label `reviewed-2026-10-04-operator` records the chosen alias snapshot for this evaluation; NVIDIA's hosted endpoint does not expose an immutable model revision in this request contract. Treat an upstream alias change as a new evaluation/indexing version.

## Embeddings and local retrieval

The selected internal evaluation model was `nvidia/nemotron-3-embed-1b`, with 2,048-dimensional vectors. Requests use `input_type: "passage"` for indexing and `input_type: "query"` for retrieval. The official endpoint schema accepts an array of inputs and caps each input at 4,096 tokens; it does not publish a maximum array count. The local provider therefore uses a bounded batch of 32, supported by a synthetic public-college probe that returned 32 ordered vectors in one HTTP request. That probe measured an 825,311-byte response, 1,001 prompt/total tokens, and 1,387 ms.

The full canonical release `sha256:29f7d5e5b891020771ce191ae16d4da8250487a51682ba9763f01cb6ccb64563` contains 9,070 grouped passages and 173,029 structured facts. Local indexing produced and revalidated all 9,070 vectors in 284 requests with no failures or database writes. The artifact is 399,017,372 bytes and has SHA-256 `59935de04cba832a1d99bd479bc589976c87557f6b1ce2adcb271f37c6cde8d7`. Every passage is bound to the release, model, operator version label, canonical source identity, and content hash. Vectors are 2,048 finite float32 values and passed nonzero and completeness validation.

Embedding usage and latency were not captured for the first 128 full-index requests, so a complete token total, full-run latency distribution, and price estimate are unavailable. For the final 156 requests (4,974 passages), the observed total was 692,202 prompt/total tokens. The three measured slices were: 64 requests / 289,973 tokens / 1,201 ms p50 and 1,370 ms p95; 64 / 283,968 / 1,183 ms and 1,428 ms; and 28 / 118,261 / 1,162 ms and 1,505 ms. These are observed trial usage figures, not a production tariff.

The publisher generated an atomic SQL file from the complete artifact, revalidated that export against the current seed, and applied it only to a disposable clone of the local `collegesearch_m2_verify` database. The export was 412,829,215 bytes with SHA-256 `79d295470f7a792350ba30b728f80ed20c9f3c4e54414b32d410d3dcb651a194`. Readback on the clone found 9,070/9,070 current-release vectors at 2,048 dimensions, no zero vectors, matching content hashes, and the expected model/version. The clone retained its 3 saved-college rows.

One subsequent batched request embedded three synthetic queries (56 input tokens, 612 ms, one HTTP request). A local hybrid-search fixture restricted each query to its named UNITID: Berkeley `110635`, Davis `110644`, or CSU Long Beach `110583`. Each returned the expected college's two passages, with the matching fields-of-study passage at semantic rank 1. Returned names, slugs, source IDs, HTTPS URLs, source fields/locators, reporting year, cohort, and content checksum matched the canonical seed. This is a narrow wiring and source-binding check, not a judged retrieval benchmark or evidence of broad semantic quality.

After verification, only the disposable clone was dropped. The baseline local database remained at 3 saved rows, zero current-release vectors, and no current embedding model. The full vector artifact and compact query results remain in ignored local `work/` files. No hosted Supabase project received embeddings.

## Permission, quota, and remaining review

The free NVIDIA API Catalog endpoint is a limited trial. NVIDIA's [API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf) prohibit production use of the trial API and its generated content. NVIDIA's [NIM FAQ](https://docs.api.nvidia.com/nim/docs/product) separately says production use serving real end users requires NVIDIA AI Enterprise. The free public adviser therefore remains off, even if the product itself charges nothing. Self-hosting or a distinct NVIDIA AI Enterprise trial would need its own license/deployment verification; model-card commercial-use language does not grant permission for the API Catalog trial.

The checked public model/API pages do not give a stable account-wide trial quota or production token price. Credits and limits are account-specific, and these trials' token counts cannot set a sustainable monthly allowance. The project has not established a $5 AI plan or free usage allowance; billing economics are deferred. Keep the key server-side and use only synthetic/anonymized prompts and public college evidence for any further trial calls.

The evaluation plan and official endpoint references are in [NVIDIA_EVALUATION_PLAN.md](NVIDIA_EVALUATION_PLAN.md). Full-index generation and artifact rules are in [M5_EMBEDDING_PIPELINE.md](M5_EMBEDDING_PIPELINE.md). The embedding endpoint request schema is [Nemotron Embed 1B inference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b-infer); NVIDIA's model card lists dimensions and model context separately at [Nemotron Embed 1B](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b).
