import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNvidiaPublicServingAllowed,
  createNvidiaProvider,
  createNvidiaRequestBudget,
  NvidiaProviderError,
  nvidiaChatModels,
  nvidiaConfigFromEnv,
  nvidiaEmbeddingBatchLimit,
  nvidiaEmbeddingDimensions,
  nvidiaEmbeddingModel,
  nvidiaHostedBaseUrl,
  type NvidiaConfig,
} from "../app/lib/adviser/nvidia.ts";

const config = (overrides: Partial<NvidiaConfig> = {}): NvidiaConfig => ({
  mode: "evaluation",
  apiKey: "test-secret-key",
  baseUrl: nvidiaHostedBaseUrl,
  chatModel: nvidiaChatModels[0],
  chatFallbackModels: [],
  embeddingModel: nvidiaEmbeddingModel,
  chatModelVersion: "test-chat-alias",
  embeddingModelVersion: "test-embed-alias",
  productionAuthorized: false,
  timeoutMs: 2_000,
  maxOutputTokens: 512,
  maxProviderAttempts: 1,
  retryDelayMs: 0,
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const completion = (content: string, usage: unknown = { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 }) => ({
  choices: [{ message: { role: "assistant", content } }],
  usage,
});

function providerError(code: string) {
  return (cause: unknown) => cause instanceof NvidiaProviderError && cause.code === code;
}

test("NVIDIA defaults disabled and public serving requires the separate explicit authorization flag", async () => {
  const defaults = nvidiaConfigFromEnv({ NVIDIA_API_KEY: "present-but-disabled" });
  assert.equal(defaults.mode, "disabled");
  assert.equal(defaults.productionAuthorized, false);
  assert.equal(defaults.chatModel, "nvidia/nemotron-3.5-lightning-30b-a3b");
  assert.deepEqual(defaults.chatFallbackModels, []);
  assert.equal(defaults.maxProviderAttempts, 1);
  assert.deepEqual(nvidiaConfigFromEnv({ NVIDIA_CHAT_MODEL: nvidiaChatModels[0],
    NVIDIA_CHAT_FALLBACK_MODELS: nvidiaChatModels.slice(1).join(","), NVIDIA_MAX_PROVIDER_ATTEMPTS: "3" }).chatFallbackModels,
  nvidiaChatModels.slice(1));
  assert.throws(() => nvidiaConfigFromEnv({ NVIDIA_CHAT_MODEL: nvidiaChatModels[0],
    NVIDIA_CHAT_FALLBACK_MODELS: `${nvidiaChatModels[1]},${nvidiaChatModels[1]}` }), providerError("invalid_config"));
  assert.throws(() => assertNvidiaPublicServingAllowed(config()), providerError("production_not_authorized"));
  assert.throws(() => assertNvidiaPublicServingAllowed(config({ mode: "production" })), providerError("production_not_authorized"));
  assert.doesNotThrow(() => assertNvidiaPublicServingAllowed(config({ mode: "production", productionAuthorized: true })));

  let calls = 0;
  const disabled = createNvidiaProvider(config({ mode: "disabled" }), async () => { calls += 1; return jsonResponse({}); });
  await assert.rejects(disabled.generate("system", "input"), providerError("disabled"));
  assert.equal(calls, 0);
});

test("configuration accepts only the documented NVIDIA HTTPS base URL and allowlisted model IDs", () => {
  for (const baseUrl of [
    "http://integrate.api.nvidia.com/v1",
    "https://evil.example/v1",
    "https://integrate.api.nvidia.com/v2",
    "https://user:pass@integrate.api.nvidia.com/v1",
    "https://integrate.api.nvidia.com/v1?redirect=https://evil.example",
  ]) {
    assert.throws(() => createNvidiaProvider(config({ baseUrl })), providerError("invalid_config"));
  }
  assert.throws(() => createNvidiaProvider(config({ chatModel: "attacker/model" })), providerError("invalid_config"));
  assert.throws(() => createNvidiaProvider(config({ embeddingModel: "nvidia/other-embed" })), providerError("invalid_config"));
  assert.throws(() => nvidiaConfigFromEnv({ NVIDIA_TIMEOUT_MS: "999999" }), providerError("invalid_config"));
});

test("provider refuses redirects for chat and embeddings without forwarding their payloads", async () => {
  const urls: string[] = [];
  const client = createNvidiaProvider(config(), async (input, init) => {
    assert.equal(init?.redirect, "error");
    urls.push(String(input));
    return new Response(null, { status: 307, headers: { location: "https://example.invalid/collect" } });
  });
  await assert.rejects(client.generate("system", "synthetic preferences"), providerError("http_error"));
  await assert.rejects(client.embed("engineering", "query"), providerError("http_error"));
  assert.deepEqual(urls, [`${nvidiaHostedBaseUrl}/chat/completions`, `${nvidiaHostedBaseUrl}/embeddings`]);
});

test("chat request uses documented fields, strict JSON parsing, version metadata, and reported usage", async () => {
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  let auth = "";
  const client = createNvidiaProvider(config(), async (input, init) => {
    requestUrl = String(input);
    auth = new Headers(init?.headers).get("authorization") ?? "";
    requestBody = JSON.parse(String(init?.body));
    assert.equal(init?.method, "POST");
    assert.equal(init?.signal instanceof AbortSignal, true);
    return jsonResponse(completion('{"intent":"recommend","unitIds":[110635]}'));
  });

  const result = await client.generateWithUsage("Interpret only.", "Synthetic engineering request.");
  assert.equal(requestUrl, `${nvidiaHostedBaseUrl}/chat/completions`);
  assert.equal(auth, "Bearer test-secret-key");
  assert.deepEqual(requestBody, {
    model: nvidiaChatModels[0],
    messages: [
      { role: "system", content: "Interpret only." },
      { role: "user", content: "Synthetic engineering request." },
    ],
    max_tokens: 512,
    temperature: 0,
    seed: 0,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  });
  assert.equal("response_format" in requestBody, false);
  assert.deepEqual(result.value, { intent: "recommend", unitIds: [110635] });
  assert.deepEqual(result.usage, { promptTokens: 17, completionTokens: 9, totalTokens: 26 });
  assert.equal(result.model, nvidiaChatModels[0]);
  assert.equal(result.modelVersion, "test-chat-alias");
  assert.equal(result.requestAttempts, 1);
  assert.deepEqual(await client.generate("Interpret only.", "{}"), { intent: "recommend", unitIds: [110635] });
});

test("chat rejects markdown, malformed JSON, non-object JSON, and oversized content without echoing it", async () => {
  for (const content of ["```json\n{\"unitIds\":[]}\n```", "{broken", "[1,2]", "null", `{"x":"${"x".repeat(32_768)}"}`]) {
    const client = createNvidiaProvider(config(), async () => jsonResponse(completion(content)));
    await assert.rejects(client.generate("system", "synthetic"), (cause: unknown) => {
      assert.ok(cause instanceof NvidiaProviderError);
      assert.ok(["invalid_json", "response_too_large"].includes(cause.code));
      assert.equal(cause.message.includes(content.slice(0, 20)), false);
      return true;
    });
  }
});

test("HTTP failures and huge response bodies are bounded and sanitized", async () => {
  const failed = createNvidiaProvider(config(), async () => new Response("secret-test-key prompt echo", { status: 500 }));
  await assert.rejects(failed.generate("private synthetic prompt", "synthetic"), (cause: unknown) => {
    assert.ok(cause instanceof NvidiaProviderError);
    assert.equal(cause.code, "http_error");
    assert.equal(cause.message.includes("secret-test-key"), false);
    assert.equal(cause.message.includes("private synthetic prompt"), false);
    return true;
  });

  const huge = createNvidiaProvider(config(), async () => new Response("x".repeat(64 * 1024 + 1), { status: 200 }));
  await assert.rejects(huge.generate("system", "synthetic"), providerError("response_too_large"));
});

test("chat falls back only on retryable 429, 503, or timeout, within the per-operation cap", async () => {
  const sentModels: string[] = [];
  let calls = 0;
  const client = createNvidiaProvider(config({ chatFallbackModels: [nvidiaChatModels[1]], maxProviderAttempts: 2 }), async (_input, init) => {
    calls += 1;
    sentModels.push(JSON.parse(String(init?.body)).model);
    return calls === 1 ? new Response("", { status: 503 }) : jsonResponse(completion('{"ok":true}'));
  });
  const result = await client.generateWithUsage("system", "synthetic");
  assert.equal(calls, 2);
  assert.deepEqual(sentModels, [nvidiaChatModels[0], nvidiaChatModels[1]]);
  assert.equal(result.model, nvidiaChatModels[1]);
  assert.equal(result.modelVersion, "unversioned-provider-alias");
  assert.equal(result.requestAttempts, 2);

  for (const status of [400, 401, 403, 422, 500]) {
    let nonRetryCalls = 0;
    const noRetry = createNvidiaProvider(config({ chatFallbackModels: [nvidiaChatModels[1]], maxProviderAttempts: 2 }), async () => {
      nonRetryCalls += 1;
      return new Response("sanitized", { status });
    });
    await assert.rejects(noRetry.generate("system", "synthetic"), providerError("http_error"));
    assert.equal(nonRetryCalls, 1, `HTTP ${status} must not retry or fall back`);
  }
});

test("embedding retries a transient failure on the same model and enforces a shared adviser-turn request budget", async () => {
  let embeddingCalls = 0;
  const vector = Array.from({ length: nvidiaEmbeddingDimensions }, () => 0.125);
  const retrying = createNvidiaProvider(config({ maxProviderAttempts: 2 }), async () => {
    embeddingCalls += 1;
    return embeddingCalls === 1 ? new Response("", { status: 429 }) : jsonResponse({ data: [{ index: 0, embedding: vector }] });
  });
  const embedded = await retrying.embed("Synthetic public passage.", "passage");
  assert.equal(embeddingCalls, 2);
  assert.equal(embedded.requestAttempts, 2);

  let budgetedCalls = 0;
  const budget = createNvidiaRequestBudget(1);
  const bounded = createNvidiaProvider(config(), async () => {
    budgetedCalls += 1;
    return jsonResponse(completion('{"ok":true}'));
  }, { requestBudget: budget });
  await bounded.generate("system", "synthetic");
  await assert.rejects(bounded.generate("system", "synthetic"), providerError("request_budget_exhausted"));
  assert.equal(budgetedCalls, 1);
  assert.equal(budget.usedRequests, 1);
});

test("timeouts, caller cancellation, and prompt caps stop work before any credentialed request", async () => {
  const slow = createNvidiaProvider(config({ timeoutMs: 100 }), (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  await assert.rejects(slow.generate("system", "synthetic"), providerError("timeout"));

  let calls = 0;
  const client = createNvidiaProvider(config(), async () => { calls += 1; return jsonResponse(completion("{}")); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.generate("system", "synthetic", controller.signal), providerError("cancelled"));
  await assert.rejects(client.generate("system", "x".repeat(48_001)), providerError("input_too_large"));
  assert.equal(calls, 0);
});

test("embedding requests use query/passage input types and require finite 2048-dimensional vectors", async () => {
  let requestBody: Record<string, unknown> = {};
  const vector = Array.from({ length: nvidiaEmbeddingDimensions }, (_, index) => index / 10_000);
  const client = createNvidiaProvider(config(), async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({ data: [{ index: 0, embedding: vector }], usage: { prompt_tokens: 5, total_tokens: 5 } });
  });
  const result = await client.embed("Synthetic catalog passage.", "passage");
  assert.deepEqual(requestBody, {
    input: ["Synthetic catalog passage."],
    model: nvidiaEmbeddingModel,
    input_type: "passage",
    encoding_format: "float",
  });
  assert.equal(result.embedding.length, 2048);
  assert.equal(result.requestAttempts, 1);
  assert.deepEqual(result.usage, { promptTokens: 5, completionTokens: null, totalTokens: 5 });

  const wrongDimensions = createNvidiaProvider(config(), async () => jsonResponse({ data: [{ index: 0, embedding: [1, 2] }] }));
  await assert.rejects(wrongDimensions.embed("synthetic", "query"), providerError("invalid_response"));
  const nonFinite = createNvidiaProvider(config(), async () => jsonResponse({ data: [{ index: 0, embedding: Array(2048).fill("NaN") }] }));
  await assert.rejects(nonFinite.embed("synthetic", "query"), providerError("invalid_response"));
});

test("embedding batches preserve input order, validate every vector, and stay within 32 inputs", async () => {
  let requestBody: Record<string, unknown> = {};
  const vector = Array.from({ length: nvidiaEmbeddingDimensions }, (_, index) => (index + 1) / 10_000);
  const client = createNvidiaProvider(config(), async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({ data: [
      { index: 0, embedding: vector },
      { index: 1, embedding: vector.map((value) => value * 2) },
    ], usage: { prompt_tokens: 12, total_tokens: 12 } });
  });
  const result = await client.embedMany(["Public college passage one.", "Public college passage two."], "passage");
  assert.deepEqual(requestBody, { input: ["Public college passage one.", "Public college passage two."], model: nvidiaEmbeddingModel,
    input_type: "passage", encoding_format: "float" });
  assert.equal(result.embeddings.length, 2);
  assert.equal(result.embeddings[0][0], Math.fround(vector[0]));
  assert.equal(result.embeddings[1][0], Math.fround(vector[0] * 2));
  assert.deepEqual(result.usage, { promptTokens: 12, completionTokens: null, totalTokens: 12 });
  assert.equal(nvidiaEmbeddingBatchLimit, 32);

  let calls = 0;
  const bounded = createNvidiaProvider(config(), async () => { calls += 1; return jsonResponse({}); });
  await assert.rejects(bounded.embedMany([], "passage"), providerError("input_too_large"));
  await assert.rejects(bounded.embedMany(Array(33).fill("synthetic"), "passage"), providerError("input_too_large"));
  const missing = createNvidiaProvider(config(), async () => jsonResponse({ data: [{ index: 0, embedding: vector }] }));
  await assert.rejects(missing.embedMany(["one", "two"], "passage"), providerError("invalid_response"));
  assert.equal(calls, 0);
});

test("embedding text and missing keys fail closed without a network request", async () => {
  let calls = 0;
  const noKey = createNvidiaProvider(config({ apiKey: "" }), async () => { calls += 1; return jsonResponse({}); });
  await assert.rejects(noKey.embed("synthetic", "query"), providerError("missing_api_key"));
  const keyed = createNvidiaProvider(config(), async () => { calls += 1; return jsonResponse({}); });
  await assert.rejects(keyed.embed("x".repeat(2_001), "passage"), providerError("input_too_large"));
  assert.equal(calls, 0);
});

test("embeddings reject vectors that become invalid or zero in PostgreSQL float32 storage", async () => {
  for (const value of [0, Number.MIN_VALUE, Number.MAX_VALUE]) {
    const provider = createNvidiaProvider(config(), async () => jsonResponse({ data: [{ index: 0, embedding: Array(2048).fill(value) }] }));
    await assert.rejects(provider.embed("Public college passage.", "passage"), providerError("invalid_response"));
  }
  const provider = createNvidiaProvider(config(), async () => jsonResponse({ data: [{ index: 0, embedding: Array(2048).fill(0.1) }] }));
  assert.equal((await provider.embed("Public college passage.", "query")).embedding[0], Math.fround(0.1));
});
