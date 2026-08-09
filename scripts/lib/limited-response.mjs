function assertDeclaredSize(response, maximumBytes, label) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`${label} exceeds the ${maximumBytes}-byte safety limit.`);
  }
}

export function fetchWithTimeout(url, timeoutMilliseconds = 30_000) {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMilliseconds) });
}

export async function readResponseBytes(response, maximumBytes, label) {
  assertDeclaredSize(response, maximumBytes, label);
  if (!response.body) {
    throw new Error(`${label} response has no body.`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`${label} exceeds the ${maximumBytes}-byte safety limit.`);
    }
    chunks.push(value);
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function readResponseText(response, maximumBytes, label) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await readResponseBytes(response, maximumBytes, label),
  );
}
