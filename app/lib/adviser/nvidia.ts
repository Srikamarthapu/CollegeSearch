/** Server-only NVIDIA API Catalog adapter. Keep keys out of client imports and logs. */
export type NvidiaMode = "disabled" | "evaluation" | "production";
export type NvidiaInputType = "query" | "passage";

export const nvidiaChatModels = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
] as const;
export type NvidiaChatModel = (typeof nvidiaChatModels)[number];
export const nvidiaEmbeddingModel = "nvidia/nemotron-3-embed-1b" as const;
export const nvidiaEmbeddingDimensions = 2048;
export const nvidiaHostedBaseUrl = "https://integrate.api.nvidia.com/v1";

const maxSystemChars = 20_000;
const maxInputChars = 48_000;
const maxChatRequestBytes = 96 * 1024;
const maxChatResponseBytes = 64 * 1024;
const maxEmbeddingTextChars = 2_000;
const maxEmbeddingResponseBytes = 128 * 1024;
const maxOutputTokens = 2_048;

export type NvidiaConfig = {
  mode: NvidiaMode;
  apiKey?: string;
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
  /** Metadata labels only: NVIDIA's hosted request schema has no model-version field. */
  chatModelVersion: string;
  embeddingModelVersion: string;
  productionAuthorized: boolean;
  timeoutMs: number;
  maxOutputTokens: number;
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
};

export type NvidiaEmbedding = {
  embedding: number[];
  usage: NvidiaUsage;
  model: string;
  modelVersion: string;
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
  | "response_too_large"
  | "invalid_response"
  | "invalid_json";

export class NvidiaProviderError extends Error {
  readonly code: NvidiaProviderErrorCode;

  constructor(code: NvidiaProviderErrorCode, message: string) {
    super(message);
    this.name = "NvidiaProviderError";
    this.code = code;
  }
}

export type NvidiaProvider = {
  /** Matches AdviserGenerator; callers still validate the returned object against their contract. */
  generate(system: string, input: string, signal?: AbortSignal): Promise<unknown>;
  /** Includes token usage for the account-safe usage wrapper and evaluation harness. */
  generateWithUsage(system: string, input: string, signal?: AbortSignal): Promise<NvidiaGeneration>;
  embed(text: string, inputType: NvidiaInputType, signal?: AbortSignal): Promise<NvidiaEmbedding>;
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
    embeddingModel: env.NVIDIA_EMBEDDING_MODEL?.trim() || nvidiaEmbeddingModel,
    chatModelVersion: versionLabel(env.NVIDIA_CHAT_MODEL_VERSION, "NVIDIA_CHAT_MODEL_VERSION"),
    embeddingModelVersion: versionLabel(env.NVIDIA_EMBEDDING_MODEL_VERSION, "NVIDIA_EMBEDDING_MODEL_VERSION"),
    productionAuthorized: env.NVIDIA_PRODUCTION_AUTHORIZED === "true",
    timeoutMs: boundedInteger(env.NVIDIA_TIMEOUT_MS, 25_000, 100, 60_000, "NVIDIA_TIMEOUT_MS"),
    maxOutputTokens: boundedInteger(env.NVIDIA_MAX_OUTPUT_TOKENS, 1_024, 32, maxOutputTokens, "NVIDIA_MAX_OUTPUT_TOKENS"),
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
  if (config.embeddingModel !== nvidiaEmbeddingModel) {
    throw configurationError("NVIDIA_EMBEDDING_MODEL is not an allowlisted candidate.");
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 60_000 ||
      !Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 32 || config.maxOutputTokens > maxOutputTokens) {
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
  payload: Record<string, unknown>,
  maxResponseBytes: number,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (config.mode === "disabled") error("disabled", "NVIDIA adviser is disabled.");
  if (config.mode === "production" && config.productionAuthorized !== true) {
    error("production_not_authorized", "NVIDIA production service is not explicitly authorized.");
  }
  const apiKey = config.apiKey?.trim();
  if (!apiKey) error("missing_api_key", "NVIDIA_API_KEY is not configured.");
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > maxChatRequestBytes) {
    error("input_too_large", "NVIDIA request exceeded the configured size limit.");
  }
  return withinTimeout(signal, config.timeoutMs, async (requestSignal) => {
    let response: Response;
    try {
      response = await fetcher(`${config.baseUrl.replace(/\/$/, "")}${route}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body,
        signal: requestSignal,
      });
    } catch (cause) {
      if (cause instanceof NvidiaProviderError) throw cause;
      throw cause;
    }
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      error("http_error", `NVIDIA returned HTTP ${response.status}.`);
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

export function createNvidiaProvider(config: NvidiaConfig, fetcher: typeof fetch = fetch): NvidiaProvider {
  validateConfig(config);

  async function generateWithUsage(system: string, input: string, signal?: AbortSignal): Promise<NvidiaGeneration> {
    if (typeof system !== "string" || system.length === 0 || system.length > maxSystemChars ||
        typeof input !== "string" || input.length === 0 || input.length > maxInputChars ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(system + input)) {
      error("input_too_large", "NVIDIA prompt is empty, malformed, or exceeds its configured size limit.");
    }
    const response = await requestJson(config, fetcher, "/chat/completions", {
      model: config.chatModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
      max_tokens: config.maxOutputTokens,
      temperature: 0,
      seed: 0,
      stream: false,
    }, maxChatResponseBytes, signal);
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
      model: config.chatModel,
      modelVersion: config.chatModelVersion,
    };
  }

  async function generate(system: string, input: string, signal?: AbortSignal): Promise<unknown> {
    return (await generateWithUsage(system, input, signal)).value;
  }

  async function embed(text: string, inputType: NvidiaInputType, signal?: AbortSignal): Promise<NvidiaEmbedding> {
    if (inputType !== "query" && inputType !== "passage") error("invalid_config", "Embedding input type must be query or passage.");
    if (typeof text !== "string" || !text.trim() || text.length > maxEmbeddingTextChars ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
      error("input_too_large", "Embedding text is empty, malformed, or exceeds its configured size limit.");
    }
    const response = await requestJson(config, fetcher, "/embeddings", {
      input: text,
      model: config.embeddingModel,
      input_type: inputType,
      encoding_format: "float",
    }, maxEmbeddingResponseBytes, signal);
    const data = response.data;
    if (!Array.isArray(data) || data.length !== 1) error("invalid_response", "NVIDIA returned an unexpected embedding response shape.");
    const row = asObject(data[0]);
    if (!row || (row.index !== undefined && row.index !== 0) || !Array.isArray(row.embedding) || row.embedding.length !== nvidiaEmbeddingDimensions) {
      error("invalid_response", `NVIDIA embeddings must contain exactly ${nvidiaEmbeddingDimensions} dimensions.`);
    }
    if (row.embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      error("invalid_response", "NVIDIA returned an invalid embedding vector.");
    }
    return {
      embedding: row.embedding as number[],
      usage: usageFrom(response.usage),
      model: config.embeddingModel,
      modelVersion: config.embeddingModelVersion,
    };
  }

  return { generate, generateWithUsage, embed };
}
