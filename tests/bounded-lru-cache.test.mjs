import assert from "node:assert/strict";
import test from "node:test";
import { register } from "tsx/esm/api";

register();
const { BoundedLruCache } = await import("../app/lib/bounded-lru-cache.ts");

function cache(options = {}) {
  return new BoundedLruCache({
    maxEntries: 2,
    maxBytes: 8,
    maxEntryBytes: 6,
    ttlMs: 10,
    measureBytes: (value) => value.length,
    ...options,
  });
}

test("bounded LRU evicts least-recently-used entries to honor entry and byte ceilings", () => {
  const entries = cache();
  assert.equal(entries.set("a", "aaa", 0), true);
  assert.equal(entries.set("b", "bbb", 0), true);
  assert.equal(entries.get("a", 1), "aaa");
  assert.equal(entries.set("c", "cccc", 2), true);
  assert.equal(entries.get("b", 3), undefined);
  assert.equal(entries.get("a", 3), "aaa");
  assert.equal(entries.get("c", 3), "cccc");
  assert.equal(entries.size, 2);
  assert.equal(entries.sizeBytes, 7);

  assert.equal(entries.set("d", "dddddd", 4), true);
  assert.equal(entries.sizeBytes <= 8, true);
  assert.equal(entries.size <= 2, true);
});

test("bounded LRU refuses oversized values and expires entries on read", () => {
  const entries = cache();
  assert.equal(entries.set("oversized", "1234567", 0), false);
  assert.equal(entries.size, 0);
  assert.equal(entries.set("short-lived", "ok", 0), true);
  assert.equal(entries.get("short-lived", 9), "ok");
  assert.equal(entries.get("short-lived", 10), undefined);
  assert.equal(entries.size, 0);
  assert.equal(entries.sizeBytes, 0);
});
