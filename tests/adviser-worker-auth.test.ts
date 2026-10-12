import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isAuthorizedAdviserWorker } from "../app/lib/adviser/worker-auth.ts";

const secret = "worker-secret-that-is-at-least-thirty-two-characters";
const request = (authorization?: string) => new Request("https://college.test/api/internal/adviser-worker", {
  method: "POST", headers: authorization ? { authorization } : {},
});

test("worker endpoint authorization rejects absent, short, malformed, and wrong secrets", () => {
  assert.equal(isAuthorizedAdviserWorker(request(), secret), false);
  assert.equal(isAuthorizedAdviserWorker(request("Basic abc"), secret), false);
  assert.equal(isAuthorizedAdviserWorker(request(`Bearer ${"x".repeat(secret.length)}`), secret), false);
  assert.equal(isAuthorizedAdviserWorker(request(`Bearer ${secret}`), "short"), false);
  assert.equal(isAuthorizedAdviserWorker(request(`Bearer ${secret}`), undefined), false);
});

test("worker endpoint authorization accepts only the configured bearer secret", () => {
  assert.equal(isAuthorizedAdviserWorker(request(`Bearer ${secret}`), secret), true);
});

test("the internal route defers the heavy worker import until after secret validation", async () => {
  const source = await readFile(new URL("../app/api/internal/adviser-worker/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["']@\/app\/lib\/adviser\/worker["']/);
  const authCheck = source.indexOf("isAuthorizedAdviserWorker(request, secret)");
  const workerImport = source.indexOf('await import("@/app/lib/adviser/worker")');
  assert.ok(authCheck >= 0 && workerImport > authCheck);
});
