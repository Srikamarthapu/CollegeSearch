/** Read public API input without trusting an optional Content-Length header. */
export class JsonBodyError extends Error {
  readonly status: 400 | 413 | 415;
  constructor(message: string, status: 400 | 413 | 415 = 400) { super(message); this.status = status; }
}
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new JsonBodyError('Use JSON for this request.', 415);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new JsonBodyError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new JsonBodyError('A JSON request is required.');
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let bytes = 0, text = '';
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new JsonBodyError('Request is too large.', 413); }
      text += decoder.decode(result.value, {stream:true});
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof JsonBodyError) throw error;
    throw new JsonBodyError('Request must be valid JSON.');
  } finally { reader.releaseLock(); }
}
