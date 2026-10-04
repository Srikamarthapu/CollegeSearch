# M3 NVIDIA provider and evaluation

**Status on 2026-10-04:** the server-side adapter, mocked safety tests, and bounded evaluation scripts are implemented. The NVIDIA key is pending. No live NVIDIA chat or embedding request has been made, and no model quality, latency, token, or cost result has been measured. Public production use remains blocked by NVIDIA's hosted trial terms.

## Provider contract

`app/lib/adviser/nvidia.ts` exports `nvidiaConfigFromEnv`, `createNvidiaProvider`, and `assertNvidiaPublicServingAllowed`. Its `generate(system, input, signal)` matches `AdviserGenerator`; `generateWithUsage` additionally returns the parsed object, nullable provider token counts, model ID, and configured version label. `embed(text, inputType, signal)` returns one validated vector and usage data. The adviser engine remains responsible for validating its exact interpretation/ranking schemas and binding visible citations to retrieved records; the model cannot supply trusted citation URLs or numeric college facts.

The provider is disabled by default, even when a key exists. The supported hosted base URL is exactly `https://integrate.api.nvidia.com/v1`; other hosts, paths, and model IDs fail configuration validation. Chat candidates are allowlisted to:

| Evaluation role | NVIDIA model ID | Official endpoint schema |
|---|---|---|
| Primary candidate | `nvidia/nemotron-3.5-lightning-30b-a3b` | [Lightning chat API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer) |
| Same-family comparator | `nvidia/nemotron-3-nano-30b-a3b` | [Nano chat API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b-infer) |
| Quality comparator | `nvidia/nemotron-3-super-120b-a12b` | [Super chat API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-super-120b-a12b-infer) |

Each chat request sends only documented common fields: `model`, system/user `messages`, `max_tokens`, `temperature`, `seed`, and `stream: false`. The NVIDIA schemas do not document `response_format` or a JSON-schema parameter, so the adapter does not send one. It accepts only a bounded JSON object with no markdown or trailing text. The engine's contract parser then checks allowed fields, preferences, and college IDs. Malformed JSON fails closed; one-shot repair is left to the caller and is not implemented in this adapter.

The allowlisted embedding model is [`nvidia/nemotron-3-embed-1b`](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b-infer), at the documented `/v1/embeddings` endpoint. Calls pass a single text, `input_type: "passage"` for indexing or `"query"` for search, and `encoding_format: "float"`. The adapter requires exactly 2,048 finite dimensions, matching the prepared Supabase vector column. NVIDIA documents a 4,096-token input ceiling; the local adapter applies a conservative 2,000-character limit and the evaluation script's current public passages are shorter than that. Query and passage modes must not be mixed.

`NVIDIA_CHAT_MODEL_VERSION` and `NVIDIA_EMBEDDING_MODEL_VERSION` are recording labels only. NVIDIA's cited hosted schemas have no immutable model revision field, so their default value, `unversioned-provider-alias`, does not pin the provider's underlying weights. Record the labels with evaluation and embeddings; re-embed if the selected model/version changes.

## Configuration and production gate

| Variable | Default | Purpose |
|---|---|---|
| `NVIDIA_MODE` | `disabled` | `disabled`, `evaluation`, or `production` |
| `NVIDIA_API_KEY` | empty | Server-side bearer key; never expose or log it |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | Must match the allowlisted hosted endpoint |
| `NVIDIA_CHAT_MODEL` | `nvidia/nemotron-3.5-lightning-30b-a3b` | One of the three allowlisted candidates |
| `NVIDIA_EMBEDDING_MODEL` | `nvidia/nemotron-3-embed-1b` | Current allowlisted embedding candidate |
| `NVIDIA_CHAT_MODEL_VERSION` | `unversioned-provider-alias` | Metadata label, not sent to the API |
| `NVIDIA_EMBEDDING_MODEL_VERSION` | `unversioned-provider-alias` | Metadata label, not sent to the API |
| `NVIDIA_TIMEOUT_MS` | `25000` | Request timeout, bounded to 100–60,000 ms |
| `NVIDIA_MAX_OUTPUT_TOKENS` | `1024` | Chat output cap, bounded to 32–2,048 tokens |
| `NVIDIA_PRODUCTION_AUTHORIZED` | `false` | Explicit owner gate; only `true` with verified production permission enables the public-serving helper |

The local `.env.local` is ignored and currently has an empty NVIDIA key placeholder. The application route must call `assertNvidiaPublicServingAllowed` before sending a public user's request. That helper permits public traffic only when both mode is `production` and `NVIDIA_PRODUCTION_AUTHORIZED=true`; an evaluation key alone cannot turn public serving on. Keep this authorization false until the selected NVIDIA service route is documented as production-permitted.

NVIDIA's [API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf) limit the API Catalog endpoint to evaluation and prohibit production use of the trial service or its generated content. NVIDIA's [NIM FAQ](https://docs.api.nvidia.com/nim/docs/product) defines serving real end users as production, including a free public app. Therefore a free CollegeSearch adviser and its hosted embedding requests are not authorized for public launch by an ordinary trial key. Model-card commercial-use language does not override the hosted trial terms. Confirm a separate licensed NVIDIA deployment route before setting the owner gate; no paid service or license has been purchased or enabled.

The adapter bounds system text, user/context text, serialized request size, response size, embedding input, output tokens, and request time. It forwards cancellation signals, rejects oversized or malformed output, validates vector dimensions, and returns sanitized status errors without provider response bodies. It emits no prompt/key logs. The current request mode is non-streaming, so the evaluation can measure request and full-turn latency but not first-token latency. There are no automatic provider retries.

## Evaluation scripts

`node scripts/evaluate-nvidia-adviser.mjs` is a no-call dry run. It validates 24 synthetic scenarios against fixed local public-data candidates and reports the three model IDs, with zero provider calls. It covers preference clarification, cost basis/residency, compare/recommend intent, known/unknown college names, personal-odds and major-rate boundaries, aid promises, student-text injection, retrieved-passage injection, identifier removal, schema validity, recommendation allowlisting, and citation-to-record binding.

To run the actual internal chat evaluation later, set `NVIDIA_MODE=evaluation`, configure the key through the ignored local environment, and invoke `node scripts/evaluate-nvidia-adviser.mjs --evaluate`. This runs candidates sequentially with the same 24 synthetic questions, fixed local candidates/passages, settings, and output cap; a complete matrix may make up to 144 chat requests because recommendation turns have separate interpretation and ranking calls. It writes only a mode-600 summary to ignored `work/nvidia-adviser-evaluation.json`; raw prompts and generated text are not written. Each case includes only the schema-validated intent/preferences/question enum, selected college IDs, and `humanReview: "pending"`; no freeform model output is retained. The summary also records successful/failed turns, nullable input/output/total tokens, non-streaming request and full-turn p50/p95 latency, structured-schema outcomes, and automated rubric counts. It does not rank semantic quality automatically; human review must inspect relevance and factual support in linked sources. A dry-run is not a model evaluation.

`node scripts/embed-college-knowledge.mjs` is also a no-call dry run. It rebuilds and verifies the canonical public passage corpus before selecting a deterministic sample from across its 13 source fields. The source currently contains 1,252 passages for 100 institutions; the sample limit is 24. An internal embedding run requires the explicit `--evaluate` flag, `NVIDIA_MODE=evaluation`, and a configured key. It sends only canonical public passage text using `input_type: "passage"`, one bounded request at a time. Its ignored work file records vectors and passage/content hashes with model/version labels, allowing restart only where release, content hash, model, version, and dimensions match. The script never uploads to Supabase and has no full-corpus mode. Full embedding/index publication must remain a separate reviewed staging step after model/version selection and the applicable production permission are established.

## Current evidence and limits

- Mocked provider tests cover disabled/default mode, production authorization, URL/model allowlists, documented request fields, strict JSON, sanitized HTTP failures, response-size limits, timeout/cancellation, missing keys, embedding input modes, and 2,048-dimension validation.
- The evaluation and embedding scripts have been run only in dry-run mode. They reported zero live provider calls. The CollegeSearch key is pending, so model outputs, live quotas, request latency, token distributions, and trial usage have not been measured.
- NVIDIA documents trial credits and service-specific limits, but the checked model/API pages do not publish a stable production token tariff or universal account quota. Check the account-specific limit and balance when the owner configures a key. Do not derive the free monthly allowance from an evaluation trial; measure first and keep public activation behind the production-permission gate.
- See [`NVIDIA_EVALUATION_PLAN.md`](./NVIDIA_EVALUATION_PLAN.md) for candidate rationale, trial terms, and the proposed manual quality rubric. See NVIDIA's [LLM API list](https://docs.api.nvidia.com/nim/reference/llm-apis), [embedding model card](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b), and [hybrid search guide](https://supabase.com/docs/guides/ai/hybrid-search) for the published interfaces and retrieval design context.
