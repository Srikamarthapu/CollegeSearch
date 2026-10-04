import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNvidiaPublicServingAllowed,
  createNvidiaProvider,
  NvidiaProviderError,
  nvidiaChatModels,
  nvidiaConfigFromEnv,
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
  embeddingModel: nvidiaEmbeddingModel,
  chatModelVersion: "test-chat-alias",
  embeddingModelVersion: "test-embed-alias",
  productionAuthorized: false,
  timeoutMs: 2_000,
  maxOutputTokens: 512,
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
  });
  assert.equal("response_format" in requestBody, false);
  assert.deepEqual(result.value, { intent: "recommend", unitIds: [110635] });
  assert.deepEqual(result.usage, { promptTokens: 17, completionTokens: 9, totalTokens: 26 });
  assert.equal(result.model, nvidiaChatModels[0]);
  assert.equal(result.modelVersion, "test-chat-alias");
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

test("embeddings use query/passage input types and require finite 2048-dimensional vectors", async () => {
  let requestBody: Record<string, unknown> = {};
  const vector = Array.from({ length: nvidiaEmbeddingDimensions }, (_, index) => index / 10_000);
  const client = createNvidiaProvider(config(), async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({ data: [{ index: 0, embedding: vector }], usage: { prompt_tokens: 5, total_tokens: 5 } });
  });
  const result = await client.embed("Synthetic catalog passage.", "passage");
  assert.deepEqual(requestBody, {
    input: "Synthetic catalog passage.",
    model: nvidiaEmbeddingModel,
    input_type: "passage",
    encoding_format: "float",
  });
  assert.equal(result.embedding.length, 2048);
  assert.deepEqual(result.usage, { promptTokens: 5, completionTokens: null, totalTokens: 5 });

  const wrongDimensions = createNvidiaProvider(config(), async () => jsonResponse({ data: [{ index: 0, embedding: [1, 2] }] }));
  await assert.rejects(wrongDimensions.embed("synthetic", "query"), providerError("invalid_response"));
  const nonFinite = createNvidiaProvider(config(), async () => jsonResponse({ data: [{ index: 0, embedding: Array(2048).fill("NaN") }] }));
  await assert.rejects(nonFinite.embed("synthetic", "query"), providerError("invalid_response"));
});

test("embedding text and missing keys fail closed without a network request", async () => {
  let calls = 0;
  const noKey = createNvidiaProvider(config({ apiKey: "" }), async () => { calls += 1; return jsonResponse({}); });
  await assert.rejects(noKey.embed("synthetic", "query"), providerError("missing_api_key"));
  const keyed = createNvidiaProvider(config(), async () => { calls += 1; return jsonResponse({}); });
  await assert.rejects(keyed.embed("x".repeat(2_001), "passage"), providerError("input_too_large"));
  assert.equal(calls, 0);
});
