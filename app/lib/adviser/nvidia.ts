/** Server-only NVIDIA API Catalog adapter. Keep keys out of client imports and logs. */
export type NvidiaMode = "disabled" | "evaluation" | "production";
export type NvidiaInputType = "query" | "passage";

export const nvidiaChatModels = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b-a55b",
] as const;
export type NvidiaChatModel = (typeof nvidiaChatModels)[number];
export const nvidiaEmbeddingModel = "nvidia/nemotron-3-embed-1b" as const;
export const nvidiaEmbeddingDimensions = 2048;
export const nvidiaHostedBaseUrl = "https://integrate.api.nvidia.com/v1";
export const nvidiaEmbeddingBatchLimit = 32;

const maxSystemChars = 20_000;
const maxInputChars = 48_000;
const maxChatRequestBytes = 96 * 1024;
const maxChatResponseBytes = 64 * 1024;
const maxEmbeddingTextChars = 2_000;
const maxEmbeddingResponseBytes = 2 * 1024 * 1024;
const maxOutputTokens = 2_048;

export type NvidiaConfig = {
  mode: NvidiaMode;
  apiKey?: string;
  baseUrl: string;
  chatModel: string;
  chatFallbackModels: string[];
  embeddingModel: string;
  /** Metadata labels only: NVIDIA's hosted request schema has no model-version field. */
  chatModelVersion: string;
  embeddingModelVersion: string;
  productionAuthorized: boolean;
  timeoutMs: number;
  maxOutputTokens: number;
  /** Maximum transient-failure attempts for one provider operation; default is one. */
  maxProviderAttempts: number;
  retryDelayMs: number;
};

export type NvidiaUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type NvidiaGeneration = {
  value: Record<string, unknown>;
  usage: NvidiaUsage;
  model: string;
  modelVersion: string;
  requestAttempts: number;
};

export type NvidiaEmbedding = {
  embedding: number[];
  usage: NvidiaUsage;
  model: string;
  modelVersion: string;
  requestAttempts: number;
};

export type NvidiaEmbeddingBatch = {
  embeddings: number[][];
  usage: NvidiaUsage;
  model: string;
  modelVersion: string;
  requestAttempts: number;
};

export type NvidiaProviderErrorCode =
  | "disabled"
  | "production_not_authorized"
  | "missing_api_key"
  | "invalid_config"
  | "input_too_large"
  | "cancelled"
  | "timeout"
  | "http_error"
  | "request_budget_exhausted"
  | "response_too_large"
  | "invalid_response"
  | "invalid_json";

export class NvidiaProviderError extends Error {
  readonly code: NvidiaProviderErrorCode;
  readonly httpStatus?: number;
  readonly requestAttempts?: number;

  constructor(code: NvidiaProviderErrorCode, message: string, details: { httpStatus?: number; requestAttempts?: number } = {}) {
    super(message);
    this.name = "NvidiaProviderError";
    this.code = code;
    this.httpStatus = details.httpStatus;
    this.requestAttempts = details.requestAttempts;
  }
}

export type NvidiaRequestBudget = { readonly maxRequests: number; usedRequests: number };

/** Share one hard HTTP-call ceiling across retrieval, interpretation and ranking for an adviser turn. */
export function createNvidiaRequestBudget(maxRequests: number): NvidiaRequestBudget {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 12) {
    throw configurationError("The NVIDIA turn request budget must be between 1 and 12.");
  }
  return { maxRequests, usedRequests: 0 };
}

export type NvidiaProvider = {
  /** Matches AdviserGenerator; callers still validate the returned object against their contract. */
  generate(system: string, input: string, signal?: AbortSignal): Promise<unknown>;
  /** Includes token usage for the account-safe usage wrapper and evaluation harness. */
  generateWithUsage(system: string, input: string, signal?: AbortSignal): Promise<NvidiaGeneration>;
  embed(text: string, inputType: NvidiaInputType, signal?: AbortSignal): Promise<NvidiaEmbedding>;
  embedMany(texts: string[], inputType: NvidiaInputType, signal?: AbortSignal): Promise<NvidiaEmbeddingBatch>;
};

function configurationError(message: string): NvidiaProviderError {
  return new NvidiaProviderError("invalid_config", message);
}

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw configurationError(`${name} must be an integer in its allowed range.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw configurationError(`${name} must be an integer in its allowed range.`);
  }
  return parsed;
}

function fallbackModels(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const values = raw.split(",").map((item) => item.trim());
  if (values.length > nvidiaChatModels.length - 1 || values.some((item) => !item)) {
    throw configurationError("NVIDIA_CHAT_FALLBACK_MODELS must contain at most two comma-separated model IDs.");
  }
  return values;
}

function versionLabel(raw: string | undefined, name: string): string {
  const value = raw?.trim() || "unversioned-provider-alias";
  if (value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw configurationError(`${name} is invalid.`);
  }
  return value;
}

/** Defaults to disabled even when an API key is present. */
export function nvidiaConfigFromEnv(env: Record<string, string | undefined> = process.env): NvidiaConfig {
  const modeValue = env.NVIDIA_MODE?.trim() || "disabled";
  if (modeValue !== "disabled" && modeValue !== "evaluation" && modeValue !== "production") {
    throw configurationError("NVIDIA_MODE must be disabled, evaluation, or production.");
  }
  const config: NvidiaConfig = {
    mode: modeValue,
    apiKey: env.NVIDIA_API_KEY,
    baseUrl: env.NVIDIA_BASE_URL?.trim() || nvidiaHostedBaseUrl,
    chatModel: env.NVIDIA_CHAT_MODEL?.trim() || nvidiaChatModels[0],
    chatFallbackModels: fallbackModels(env.NVIDIA_CHAT_FALLBACK_MODELS),
    embeddingModel: env.NVIDIA_EMBEDDING_MODEL?.trim() || nvidiaEmbeddingModel,
    chatModelVersion: versionLabel(env.NVIDIA_CHAT_MODEL_VERSION, "NVIDIA_CHAT_MODEL_VERSION"),
    embeddingModelVersion: versionLabel(env.NVIDIA_EMBEDDING_MODEL_VERSION, "NVIDIA_EMBEDDING_MODEL_VERSION"),
    productionAuthorized: env.NVIDIA_PRODUCTION_AUTHORIZED === "true",
    timeoutMs: boundedInteger(env.NVIDIA_TIMEOUT_MS, 25_000, 100, 60_000, "NVIDIA_TIMEOUT_MS"),
    maxOutputTokens: boundedInteger(env.NVIDIA_MAX_OUTPUT_TOKENS, 1_024, 32, maxOutputTokens, "NVIDIA_MAX_OUTPUT_TOKENS"),
    maxProviderAttempts: boundedInteger(env.NVIDIA_MAX_PROVIDER_ATTEMPTS, 1, 1, 3, "NVIDIA_MAX_PROVIDER_ATTEMPTS"),
    retryDelayMs: boundedInteger(env.NVIDIA_RETRY_DELAY_MS, 200, 0, 2_000, "NVIDIA_RETRY_DELAY_MS"),
  };
  validateConfig(config);
  return config;
}

function validateConfig(config: NvidiaConfig): void {
  if (!config || !["disabled", "evaluation", "production"].includes(config.mode)) {
    throw configurationError("NVIDIA mode is invalid.");
  }
  if (config.productionAuthorized !== true && config.productionAuthorized !== false) {
    throw configurationError("NVIDIA_PRODUCTION_AUTHORIZED must be an explicit boolean.");
  }
  let parsed: URL;
  try {
    parsed = new URL(config.baseUrl);
  } catch {
    throw configurationError("NVIDIA_BASE_URL must be an approved HTTPS NVIDIA endpoint.");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "integrate.api.nvidia.com" ||
      parsed.pathname.replace(/\/$/, "") !== "/v1" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw configurationError("NVIDIA_BASE_URL must be the approved HTTPS NVIDIA API Catalog endpoint.");
  }
  if (!nvidiaChatModels.includes(config.chatModel as NvidiaChatModel)) {
    throw configurationError("NVIDIA_CHAT_MODEL is not an allowlisted candidate.");
  }
  if (!Array.isArray(config.chatFallbackModels) || config.chatFallbackModels.length > nvidiaChatModels.length - 1 ||
      config.chatFallbackModels.some((model) => !nvidiaChatModels.includes(model as NvidiaChatModel) || model === config.chatModel) ||
      new Set(config.chatFallbackModels).size !== config.chatFallbackModels.length) {
    throw configurationError("NVIDIA_CHAT_FALLBACK_MODELS must be distinct allowlisted alternatives to the primary model.");
  }
  if (config.embeddingModel !== nvidiaEmbeddingModel) {
    throw configurationError("NVIDIA_EMBEDDING_MODEL is not an allowlisted candidate.");
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 60_000 ||
      !Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 32 || config.maxOutputTokens > maxOutputTokens ||
      !Number.isSafeInteger(config.maxProviderAttempts) || config.maxProviderAttempts < 1 || config.maxProviderAttempts > 3 ||
      !Number.isSafeInteger(config.retryDelayMs) || config.retryDelayMs < 0 || config.retryDelayMs > 2_000) {
    throw configurationError("NVIDIA request limits are invalid.");
  }
  for (const label of [config.chatModelVersion, config.embeddingModelVersion]) {
    if (typeof label !== "string" || !label.trim() || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) {
      throw configurationError("NVIDIA model version labels are invalid.");
    }
  }
  if (config.apiKey !== undefined && (typeof config.apiKey !== "string" || config.apiKey.length > 4_096 || /[\u0000-\u001f\u007f]/.test(config.apiKey))) {
    throw configurationError("NVIDIA_API_KEY is invalid.");
  }
}

/** Public serving is denied in disabled/evaluation mode, even when a key exists. */
export function assertNvidiaPublicServingAllowed(config: NvidiaConfig): void {
  validateConfig(config);
  if (config.mode !== "production" || config.productionAuthorized !== true) {
    throw new NvidiaProviderError("production_not_authorized", "NVIDIA production service is not explicitly authorized.");
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000_000 ? value : null;
}

function usageFrom(value: unknown): NvidiaUsage {
  const row = asObject(value);
  const promptTokens = tokenCount(row?.prompt_tokens);
  const completionTokens = tokenCount(row?.completion_tokens);
  const reportedTotal = tokenCount(row?.total_tokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens: reportedTotal ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null),
  };
}

function error(code: NvidiaProviderErrorCode, message: string): never {
  throw new NvidiaProviderError(code, message);
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const statedLength = response.headers.get("content-length");
  if (statedLength && /^\d+$/.test(statedLength) && Number(statedLength) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    error("response_too_large", "NVIDIA response exceeded the configured size limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        error("response_too_large", "NVIDIA response exceeded the configured size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function withinTimeout<T>(signal: AbortSignal | undefined, timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal?.aborted) error("cancelled", "NVIDIA request was cancelled.");
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (cause) {
    if (cause instanceof NvidiaProviderError) throw cause;
    if (timedOut) return error("timeout", "NVIDIA request timed out.");
    if (signal?.aborted) return error("cancelled", "NVIDIA request was cancelled.");
    return error("http_error", "NVIDIA request failed before a response was received.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function requestJson(
  config: NvidiaConfig,
  fetcher: typeof fetch,
  route: "/chat/completions" | "/embeddings",
  payloads: Record<string, unknown>[],
  maxResponseBytes: number,
  signal?: AbortSignal,
  budget?: NvidiaRequestBudget,
  repeatLastPayload = false,
): Promise<{ value: Record<string, unknown>; requestAttempts: number }> {
  if (config.mode === "disabled") error("disabled", "NVIDIA adviser is disabled.");
  if (config.mode === "production" && config.productionAuthorized !== true) {
    error("production_not_authorized", "NVIDIA production service is not explicitly authorized.");
  }
  const apiKey = config.apiKey?.trim();
  if (!apiKey) error("missing_api_key", "NVIDIA_API_KEY is not configured.");
  if (!payloads.length) error("invalid_config", "NVIDIA request has no configured payload.");
  const attemptLimit = repeatLastPayload
    ? config.maxProviderAttempts
    : Math.min(config.maxProviderAttempts, payloads.length);
  let lastFailure: unknown;
  for (let index = 0; index < attemptLimit; index += 1) {
    const payload = payloads[Math.min(index, payloads.length - 1)];
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > maxChatRequestBytes) {
      error("input_too_large", "NVIDIA request exceeded the configured size limit.");
    }
    if (budget && budget.usedRequests >= budget.maxRequests) {
      error("request_budget_exhausted", "NVIDIA adviser reached its bounded provider request limit.");
    }
    if (budget) budget.usedRequests += 1;
    try {
      const value = await withinTimeout(signal, config.timeoutMs, async (requestSignal) => {
        const response = await fetcher(`${config.baseUrl.replace(/\/$/, "")}${route}`, {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: `Bearer ${apiKey}`,
            accept: "application/json",
            "content-type": "application/json",
          },
          body,
          signal: requestSignal,
        });
        if (response.status !== 200) {
          await response.body?.cancel().catch(() => undefined);
          throw new NvidiaProviderError("http_error", `NVIDIA returned HTTP ${response.status}.`, { httpStatus: response.status });
        }
        let raw: string;
        try {
          raw = await readBoundedBody(response, maxResponseBytes);
        } catch (cause) {
          if (cause instanceof NvidiaProviderError) throw cause;
          error("invalid_response", "NVIDIA returned an unreadable response.");
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          error("invalid_response", "NVIDIA returned an invalid JSON response.");
        }
        const object = asObject(parsed);
        if (!object) error("invalid_response", "NVIDIA returned an unexpected response shape.");
        return object;
      });
      return { value, requestAttempts: index + 1 };
    } catch (cause) {
      lastFailure = cause;
      const retryable = cause instanceof NvidiaProviderError &&
        (cause.code === "timeout" || cause.httpStatus === 429 || cause.httpStatus === 503);
      if (!retryable || index + 1 >= attemptLimit) {
        if (cause instanceof NvidiaProviderError) {
          throw new NvidiaProviderError(cause.code, cause.message, { httpStatus: cause.httpStatus, requestAttempts: index + 1 });
        }
        throw cause;
      }
      if (config.retryDelayMs > 0) {
        if (signal?.aborted) error("cancelled", "NVIDIA request was cancelled.");
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
          }, config.retryDelayMs);
          const abort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            reject(new NvidiaProviderError("cancelled", "NVIDIA request was cancelled."));
          };
          signal?.addEventListener("abort", abort, { once: true });
        });
      }
    }
  }
  if (lastFailure instanceof NvidiaProviderError) {
    throw new NvidiaProviderError(lastFailure.code, lastFailure.message, {
      httpStatus: lastFailure.httpStatus, requestAttempts: attemptLimit,
    });
  }
  error("http_error", "NVIDIA request failed before a response was received.");
}

function parseStructuredContent(content: unknown): Record<string, unknown> {
  if (typeof content !== "string" || !content.trim() || content.length > 32_768) {
    error("invalid_json", "NVIDIA returned no bounded JSON content.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    error("invalid_json", "NVIDIA returned malformed structured JSON.");
  }
  const object = asObject(parsed);
  if (!object) error("invalid_json", "NVIDIA structured output must be a JSON object.");
  return object;
}

export function createNvidiaProvider(
  config: NvidiaConfig,
  fetcher: typeof fetch = fetch,
  options: { requestBudget?: NvidiaRequestBudget } = {},
): NvidiaProvider {
  validateConfig(config);
  const requestBudget = options.requestBudget;

  async function generateWithUsage(system: string, input: string, signal?: AbortSignal): Promise<NvidiaGeneration> {
    if (typeof system !== "string" || system.length === 0 || system.length > maxSystemChars ||
        typeof input !== "string" || input.length === 0 || input.length > maxInputChars ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(system + input)) {
      error("input_too_large", "NVIDIA prompt is empty, malformed, or exceeds its configured size limit.");
    }
    const chatModels = [config.chatModel, ...config.chatFallbackModels];
    const request = await requestJson(config, fetcher, "/chat/completions", chatModels.map((model) => ({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
      max_tokens: config.maxOutputTokens,
      temperature: 0,
      seed: 0,
      stream: false,
      ...(model === "nvidia/nemotron-3-super-120b-a12b" ? { reasoning_effort: "none" } : { chat_template_kwargs: { enable_thinking: false } }),
    })), maxChatResponseBytes, signal, requestBudget);
    const response = request.value;
    const choices = response.choices;
    if (!Array.isArray(choices) || choices.length !== 1) {
      error("invalid_response", "NVIDIA returned an unexpected chat completion shape.");
    }
    const choice = asObject(choices[0]);
    const message = asObject(choice?.message);
    if (!message) error("invalid_response", "NVIDIA returned an unexpected chat message shape.");
    return {
      value: parseStructuredContent(message.content),
      usage: usageFrom(response.usage),
      model: typeof response.model === "string" && chatModels.includes(response.model) ? response.model : (request.requestAttempts > 1 ? chatModels[request.requestAttempts - 1] : config.chatModel),
      modelVersion: request.requestAttempts > 1 ? "unversioned-provider-alias" : config.chatModelVersion,
      requestAttempts: request.requestAttempts,
    };
  }

  async function generate(system: string, input: string, signal?: AbortSignal): Promise<unknown> {
    return (await generateWithUsage(system, input, signal)).value;
  }

  async function embedMany(texts: string[], inputType: NvidiaInputType, signal?: AbortSignal): Promise<NvidiaEmbeddingBatch> {
    if (inputType !== "query" && inputType !== "passage") error("invalid_config", "Embedding input type must be query or passage.");
    if (!Array.isArray(texts) || texts.length < 1 || texts.length > nvidiaEmbeddingBatchLimit ||
        texts.some((text) => typeof text !== "string" || !text.trim() || text.length > maxEmbeddingTextChars ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))) {
      error("input_too_large", `Embedding requests require 1 to ${nvidiaEmbeddingBatchLimit} bounded text inputs.`);
    }
    const request = await requestJson(config, fetcher, "/embeddings", [{
      input: texts,
      model: config.embeddingModel,
      input_type: inputType,
      encoding_format: "float",
    }], maxEmbeddingResponseBytes, signal, requestBudget, true);
    const response = request.value;
    const data = response.data;
    if (!Array.isArray(data) || data.length !== texts.length) error("invalid_response", "NVIDIA returned an unexpected embedding response shape.");
    const embeddings: number[][] = [];
    for (let index = 0; index < data.length; index += 1) {
      const row = asObject(data[index]);
      if (!row || (row.index !== undefined && row.index !== index) || !Array.isArray(row.embedding) || row.embedding.length !== nvidiaEmbeddingDimensions) {
        error("invalid_response", `NVIDIA embeddings must contain exactly ${nvidiaEmbeddingDimensions} dimensions per input.`);
      }
      if (row.embedding.some((value) => typeof value !== "number" || !Number.isFinite(Math.fround(value))) ||
          !row.embedding.some((value) => Math.fround(value) !== 0)) {
        error("invalid_response", "NVIDIA returned an invalid embedding vector.");
      }
      embeddings.push((row.embedding as number[]).map(Math.fround));
    }
    return {
      embeddings,
      usage: usageFrom(response.usage),
      model: config.embeddingModel,
      modelVersion: config.embeddingModelVersion,
      requestAttempts: request.requestAttempts,
    };
  }

  async function embed(text: string, inputType: NvidiaInputType, signal?: AbortSignal): Promise<NvidiaEmbedding> {
    const result = await embedMany([text], inputType, signal);
    return { embedding: result.embeddings[0], usage: result.usage, model: result.model,
      modelVersion: result.modelVersion, requestAttempts: result.requestAttempts };
  }

  return { generate, generateWithUsage, embed, embedMany };
}
