# NVIDIA model evaluation plan

**Research date:** 2026-10-04  
**Status:** The three chat candidates have bounded synthetic evaluations and the current 9,070-passage embedding corpus has a complete, locally validated vector artifact. See [M7_NVIDIA_EVALUATION.md](M7_NVIDIA_EVALUATION.md) for results and review limits. Vectors were not uploaded to Supabase, public AI remains disabled, and the API Catalog trial does not authorize public service.

## Production permission

The NVIDIA API Catalog “Free Endpoint” is a limited trial. The [NVIDIA API Trial Terms §§1.2 and 1.4](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf) prohibit production use of the trial API or its generated content. Trial access/credits are limited, and after credits are used the terms require a separate subscription. Without a subscription, use is limited to internal testing and evaluation.

NVIDIA's [NIM General FAQ](https://docs.api.nvidia.com/nim/docs/product) defines production to include any non-testing activity serving real end users, and says production NIM requires NVIDIA AI Enterprise. This includes a free public CollegeSearch adviser: a Developer Program key does not authorize serving public users. The same restriction applies to hosted embedding requests. Model-weight terms such as “ready for commercial use” are separate from the hosted API Trial Terms and do not override them.

NVIDIA describes a separate 90-day NVIDIA AI Enterprise trial as designed for production deployment and including a commercial-use license. Treat it as a distinct NVAIE licensing/deployment route, not as permission attached to the regular API Catalog trial key. Verify which endpoint/deployment the trial covers before activation. NVIDIA's [current licensing guide](https://docs.nvidia.com/ai-enterprise/planning-resource/licensing-guide/latest/pricing.html) lists self-managed NVAIE at $4,500 per GPU/year and cloud production at $1 per GPU/hour plus the cloud provider's GPU instance cost. These are software licensing prices, not token prices or a quote for this project.

**Gate:** use the free API Catalog only for private/internal evaluation. Keep public generation and hosted embeddings off until production permission for the selected service route is verified. The trial terms also restrict submitting confidential or personal data unless the specific API service expressly permits it; use synthetic/anonymized questions and public college evidence in the evaluation. Do not place the key in client code; send requests from server code after the user provides a key through a secret environment setting.

## Candidate chat models

The current [NVIDIA LLM API list](https://docs.api.nvidia.com/nim/reference/llm-apis) lists these hosted model IDs at `POST https://integrate.api.nvidia.com/v1/chat/completions`. One bounded 24-case synthetic run was measured for each; latency and token counts are in [M7_NVIDIA_EVALUATION.md](M7_NVIDIA_EVALUATION.md). Those measurements do not establish production cost or human-reviewed ranking quality.

| Role in evaluation | Exact model ID | Source-backed reason to test | Request reference |
|---|---|---|---|
| Recommended internal evaluation model | `nvidia/nemotron-3-super-120b-a12b` | Highest valid-turn count in the corrected run: 23/24; the remaining case received HTTP 429. The fixed-candidate harness included an unrequested third college in a named-college comparison, while runtime candidate filtering restricts explicit-college requests to those IDs. Reevaluate with runtime-equivalent fixtures before judging exact-college ranking. This does not authorize public production. | [model card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b) · [chat API schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer) |
| Smaller hosted comparator | `nvidia/nemotron-3.5-lightning-30b-a3b` | NVIDIA describes this as its fastest 30B-A3B MoE model. The strict-prompt run completed 22/24 cases; its measured latency was higher than Super in this run. | [NVIDIA model page](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b) · [chat API schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer) |
| Largest comparator | `nvidia/nemotron-3-ultra-550b-a55b` | Included as hosted comparison. The one run completed 13/24; 9 requests returned HTTP 503 and 2 timed out. No self-host cost or latency claim is inferred from model size. | [model page](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b) · [chat API schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer) |

All three use the chat-completions route, but request parameters differ. For example, the Lightning endpoint documents `max_tokens` up to 32,768 and `reasoning_budget`; Super documents `max_tokens` up to 32,768 and `reasoning_effort` values `none`, `low`, or `high`. Defaults are model-specific. NVIDIA advises against changing both `temperature` and `top_p` in one request. Only send parameters documented for the selected model.

The checked request-field references do not list `response_format` or a JSON Schema parameter. Do not assume constrained JSON output is available. Ask for the app's JSON contract, then validate it server-side against the application schema; malformed or extra fields must fail closed. Keep citations grounded: have the server attach source IDs, institution IDs, reporting years, and source URLs from retrieved rows; display citations only from those rows. Treat model-written citations as untrusted identifiers to validate, never as the source of truth.

## Embeddings and hybrid search

Candidate embedding model: `nvidia/nemotron-3-embed-1b`, via `POST https://integrate.api.nvidia.com/v1/embeddings` ([API schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b-infer), [model card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b)). Its model card lists 2,048 dimensions and a 32,768-token model context. The hosted request schema caps input at 4,096 tokens; follow that lower endpoint limit unless NVIDIA confirms otherwise. The request requires `input_type`: `passage` for indexing and `query` for user questions. NVIDIA warns that using the wrong mode reduces retrieval accuracy. The API accepts a list of strings but publishes no maximum array count. A 32-input synthetic probe returned 32 ordered vectors of 2,048 dimensions; a complete 9,070-passage artifact was generated and revalidated locally in 284 requests. This hosted embedding API remains a trial service and is not production-authorized by a free API Catalog key.

Supabase's [hybrid-search guide](https://supabase.com/docs/guides/ai/hybrid-search) combines Postgres full-text (`tsvector`) and pgvector search, then fuses ranked results. It also requires the query vector dimension to match the stored embedding dimension and model. If this candidate is used, the vector column needs `vector(2048)`. Pin the model/version and use it consistently for passage indexing and query vectors; a model change requires re-embedding. Use structured SQL for numeric facts and filters, and hybrid retrieval for descriptive passages. Preserve institution and source metadata with each passage so answers can cite the correct campus and reporting year.

## Proposed evaluation matrix

Run the same system prompt, retrieval results, SQL/tool results, generation cap, and settings across chat candidates. A 24-case synthetic matrix has been run for Lightning, Super, and Ultra; see [M7_NVIDIA_EVALUATION.md](M7_NVIDIA_EVALUATION.md). Add a model to the shortlist only after schema validity, intent/clarification behavior, identifier handling, retrieved-only ranking and citation checks pass human review. The original cases cover:

- preference discovery and clarification when major, location, budget, campus size, or priorities are missing;
- exact tuition, admissions, program, and campus facts plus multi-college trade-offs;
- conflicting or missing evidence, unsupported major-specific acceptance rates, and requests for personal admission odds or guaranteed aid;
- prompt-injection text inside a retrieved passage, which must remain reference text rather than instructions.

For each output, record whether every factual claim is supported by the retrieved source and reporting year; whether every citation maps to the right institution/source record; instruction-following and clarification behavior; valid structured output before/after any retry; first-token and full-response latency; input/output tokens; and request errors/retries. Review claims against the linked source itself. Repeat a subset with fixed settings/seeds to check output variation. Add only privacy-safe, anonymized student questions that the trial terms permit; do not send identifiable student histories.

Test retrieval separately with a small judged set of query-to-passage matches. Compare keyword-only, vector-only, and hybrid ranked results; use `passage` on stored chunks and `query` on questions; never mix embeddings from different model versions. Retrieval quality has not yet been evaluated with a judged query-to-passage set.

## Price and quota evidence

The API Trial Terms say trial usage and credits are limited and governed by usage limits for each service. The public API references and model pages checked do not provide a stable per-token production tariff or a universal account quota. Current limits/credit balance are account-specific and should be checked in the logged-in API Catalog dashboard. A free trial endpoint and its available credits are not a published production cost or a basis for setting AI Plus/free monthly allowances. The live token counts in M7 are evaluation evidence, not provider price or a cost estimate. Stripe/payment fees are tracked separately.

## Official sources

- [NVIDIA API Trial Terms of Service](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf)
- [NVIDIA NIM General FAQ](https://docs.api.nvidia.com/nim/docs/product)
- [NVIDIA LLM API list](https://docs.api.nvidia.com/nim/reference/llm-apis)
- [Nemotron 3.5 Lightning model page](https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b) · [request schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer)
- [Nemotron 3 Nano card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b) · [request schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b-infer)
- [Nemotron 3 Super card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b) · [request schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer)
- [Nemotron 3 Embed card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b) · [request schema](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b-infer)
- [NVIDIA Enterprise Licensing Guide](https://docs.nvidia.com/ai-enterprise/planning-resource/licensing-guide/latest/pricing.html)
- [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)
