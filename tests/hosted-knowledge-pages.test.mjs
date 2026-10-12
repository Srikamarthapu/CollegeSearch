import assert from "node:assert/strict";
import test from "node:test";
import { readHostedRows } from "../scripts/lib/hosted-knowledge-pages.mjs";

test("hosted verification visits every binding when thousands share one source", async () => {
  const rows = Array.from({ length: 1400 }, (_, i) => ({
    release_id: "release", unit_id: i + 1, source_id: "federal",
  }));
  const requests = [];
  const actual = await readHostedRows(async (table, { query }) => {
    assert.equal(table, "college_source_bindings");
    assert.equal(query.release_id, "eq.release");
    requests.push(query);
    // A service can resolve tied source-only rows differently on each request.
    const ordered = [...rows].sort((a, b) => query.order.includes("unit_id.asc")
      ? a.unit_id - b.unit_id
      : Number(query.offset) % 1000 ? b.unit_id - a.unit_id : a.unit_id - b.unit_id);
    return ordered.slice(Number(query.offset), Number(query.offset) + Number(query.limit));
  }, "college_source_bindings", [{ name: "unit_id" }, { name: "source_id" }], "release", ["release_id", "unit_id", "source_id"]);
  assert.deepEqual(actual, rows);
  assert.deepEqual(requests.map((request) => request.offset), ["0", "500", "1000"]);
});

test("hosted verification rejects malformed and oversized pages", async () => {
  for (const response of [{ error: "bad" }, Array(501).fill({})]) {
    await assert.rejects(readHostedRows(async () => response, "college_facts", [], "release", ["fact_id"]), /invalid/);
  }
});
