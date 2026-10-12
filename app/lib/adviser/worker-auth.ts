import { timingSafeEqual } from "node:crypto";

export function isAuthorizedAdviserWorker(request: Request, configuredSecret: string | undefined): boolean {
  const secret = configuredSecret?.trim();
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
