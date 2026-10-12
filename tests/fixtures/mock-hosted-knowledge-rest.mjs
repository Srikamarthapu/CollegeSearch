import { readFileSync, writeFileSync } from "node:fs";

const projectRef = "abcdefghijabcdefghij";
const expectedOrigin = `https://${projectRef}.supabase.co`;
const expectedApiKey = "sb_secret_hosted_seed_test_only";
const scenario = process.env.SEED_MOCK_SCENARIO ?? "success";
const reportPath = process.env.SEED_MOCK_REPORT_PATH;
const baseline = JSON.parse(
  readFileSync(new URL("./catalog-100-identities.json", import.meta.url), "utf8"),
);

const primaryKeys = {
  college_catalog: ["unit_id"],
  college_knowledge_releases: ["release_id"],
  college_catalog_release_records: ["release_id", "unit_id"],
  college_sources: ["release_id", "source_id"],
  college_source_bindings: ["release_id", "unit_id", "source_id"],
  college_facts: ["fact_id"],
  college_passages: ["passage_id"],
};
const verificationOrders = {
  college_catalog: "unit_id.asc",
  college_catalog_release_records: "release_id.asc,unit_id.asc",
  college_sources: "release_id.asc,source_id.asc",
  college_source_bindings: "release_id.asc,unit_id.asc,source_id.asc",
  college_facts: "fact_id.asc",
  college_passages: "passage_id.asc",
};
const tableRows = new Map(
  Object.keys(primaryKeys).map((table) => [table, new Map()]),
);
const orderedViews = new Map();
for (const row of baseline) {
  tableRows.get("college_catalog").set(String(row.unitId), {
    unit_id: row.unitId,
    slug: row.slug,
  });
}

const postRows = {};
const readStreams = new Map();
const state = {
  fetchCalls: 0,
  blockedFetchCalls: 0,
  postRows,
  projectionValid: true,
  paginationValid: true,
  releaseMetadataReadback: false,
  publishCalls: 0,
  publishAccepted: false,
  publishPayload: null,
  publishGateChecks: null,
  baseline100Preserved: false,
  injectedMetadataConflict: false,
  injectedBindingOmission: false,
};

function keyFor(row, keys) {
  return keys.map((key) => String(row[key] ?? "null")).join("\u0000");
}

function response(status, value) {
  return new Response(value === null ? null : JSON.stringify(value), {
    status,
    headers: value === null ? undefined : { "content-type": "application/json" },
  });
}

function valueCompare(left, right) {
  if (left === right) return 0;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function report() {
  const tableCounts = Object.fromEntries(
    [...tableRows].map(([table, rows]) => [table, rows.size]),
  );
  const bindings = [...tableRows.get("college_source_bindings").values()];
  const bySource = new Map();
  for (const row of bindings) {
    bySource.set(row.source_id, (bySource.get(row.source_id) ?? 0) + 1);
  }
  const sourceBindingCounts = [...bySource.values()];
  const identityRows = tableRows.get("college_catalog");
  state.baseline100Preserved = baseline.every((row) =>
    identityRows.get(String(row.unitId))?.slug === row.slug,
  );
  return {
    fetchCalls: state.fetchCalls,
    blockedFetchCalls: state.blockedFetchCalls,
    tableCounts,
    postRows: { ...postRows },
    readStreams: Object.fromEntries(
      [...readStreams].map(([key, value]) => [key, value]),
    ),
    projectionValid: state.projectionValid,
    paginationValid: state.paginationValid,
    releaseMetadataReadback: state.releaseMetadataReadback,
    publishCalls: state.publishCalls,
    publishAccepted: state.publishAccepted,
    publishPayload: state.publishPayload,
    publishGateChecks: state.publishGateChecks,
    baseline100Preserved: state.baseline100Preserved,
    injectedMetadataConflict: state.injectedMetadataConflict,
    injectedBindingOmission: state.injectedBindingOmission,
    distinctBindingKeys: new Set(bindings.map((row) => keyFor(row, primaryKeys.college_source_bindings))).size,
    maximumBindingsPerSource: Math.max(0, ...sourceBindingCounts),
    sourcesBoundToMultipleInstitutions: sourceBindingCounts.filter((count) => count > 1).length,
  };
}

if (reportPath) {
  process.on("exit", () => {
    writeFileSync(reportPath, JSON.stringify(report()));
  });
}

globalThis.fetch = async (input, init = {}) => {
  state.fetchCalls += 1;
  const inputUrl = typeof input === "string" || input instanceof URL ? input : input.url;
  const url = new URL(inputUrl);
  if (url.origin !== expectedOrigin || !url.pathname.startsWith("/rest/v1/")) {
    state.blockedFetchCalls += 1;
    throw new Error("Mock Supabase preload blocked a request outside the synthetic test origin.");
  }
  const headers = new Headers(init.headers ?? {});
  if (headers.get("apikey") !== expectedApiKey || headers.has("authorization")) {
    return response(401, { code: "mock-auth-invalid" });
  }

  const pathname = url.pathname.slice("/rest/v1/".length);
  const method = init.method ?? "GET";
  if (pathname === "rpc/publish_college_knowledge_release" && method === "POST") {
    state.publishCalls += 1;
    const payload = JSON.parse(init.body);
    state.publishPayload = payload;
    const expectations = {
      college_catalog_release_records: payload.p_expected_institution_count,
      college_sources: payload.p_expected_source_count,
      college_source_bindings: payload.p_expected_binding_count,
      college_facts: payload.p_expected_fact_count,
      college_passages: payload.p_expected_passage_count,
    };
    const verified = Object.fromEntries(
      Object.entries(expectations).map(([table, expected]) => {
        const stream = readStreams.get(`${table}\u0000eq.${payload.p_release_id}`);
        return [table, Boolean(stream?.complete && stream.total === expected)];
      }),
    );
    const countsMatch = Object.entries(expectations).every(([table, expected]) =>
      tableRows.get(table).size === expected,
    );
    const allRowsVerified = Object.values(verified).every(Boolean);
    const identityCount = tableRows.get("college_catalog").size === payload.p_expected_institution_count;
    const releaseMetadata = tableRows.get("college_knowledge_releases").get(payload.p_release_id);
    const gatePassed = countsMatch && allRowsVerified && identityCount &&
      state.releaseMetadataReadback && !state.blockedFetchCalls;
    state.publishGateChecks = {
      countsMatch,
      allRowsVerified,
      identityCount,
      releaseMetadataReadback: state.releaseMetadataReadback,
      verified,
    };
    if (!gatePassed || !releaseMetadata) {
      return response(409, { code: "mock-publish-gate-closed" });
    }
    const publishedAt = "2026-10-04T12:00:00.000Z";
    releaseMetadata.is_current = true;
    releaseMetadata.published_at = publishedAt;
    state.publishAccepted = true;
    return response(200, [{ release_id: payload.p_release_id, published_at: publishedAt }]);
  }

  if (!tableRows.has(pathname)) return response(404, { code: "mock-table-not-found" });
  const rows = tableRows.get(pathname);
  if (method === "POST") {
    const incoming = JSON.parse(init.body);
    const values = Array.isArray(incoming) ? incoming : [incoming];
    postRows[pathname] = (postRows[pathname] ?? 0) + values.length;
    for (const original of values) {
      let row = original;
      if (pathname === "college_knowledge_releases" && scenario === "release-metadata-conflict" && !rows.size) {
        row = {
          ...original,
          release_metadata: { ...original.release_metadata, mockConflict: true },
        };
        state.injectedMetadataConflict = true;
      }
      if (pathname === "college_source_bindings" && scenario === "missing-binding" && !state.injectedBindingOmission) {
        state.injectedBindingOmission = true;
        continue;
      }
      const key = keyFor(row, primaryKeys[pathname]);
      if (!rows.has(key)) rows.set(key, structuredClone(row));
    }
    for (const cacheKey of orderedViews.keys()) {
      if (cacheKey.startsWith(`${pathname}\u0000`)) orderedViews.delete(cacheKey);
    }
    return response(204, null);
  }

  if (method !== "GET") return response(405, { code: "mock-method-not-supported" });
  const selectValue = url.searchParams.get("select");
  const select = selectValue?.split(",").filter(Boolean) ?? [];
  if (!select.length) return response(400, { code: "mock-select-required" });
  const releaseFilter = url.searchParams.get("release_id");
  const limit = Number(url.searchParams.get("limit") ?? "1000");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const orderText = url.searchParams.get("order") ?? "";
  const order = orderText.split(",").filter(Boolean).map((item) => ({
    name: item.endsWith(".asc") || item.endsWith(".desc") ? item.slice(0, -4) : item,
    descending: item.endsWith(".desc"),
  }));
  let orderedRows;
  if (limit === 500 && orderText) {
    const cacheKey = `${pathname}\u0000${releaseFilter ?? "all"}\u0000${orderText}`;
    orderedRows = orderedViews.get(cacheKey);
    if (!orderedRows) {
      let filtered = [...rows.values()];
      if (releaseFilter?.startsWith("eq.")) {
        const releaseId = releaseFilter.slice(3);
        filtered = filtered.filter((row) => row.release_id === releaseId);
      }
      if (order.length) {
        filtered.sort((left, right) => {
          for (const item of order) {
            const compared = valueCompare(left[item.name], right[item.name]);
            if (compared) return item.descending ? -compared : compared;
          }
          return 0;
        });
      }
      orderedRows = filtered;
      orderedViews.set(cacheKey, orderedRows);
    }
  } else {
    orderedRows = [...rows.values()];
    if (releaseFilter?.startsWith("eq.")) {
      const releaseId = releaseFilter.slice(3);
      orderedRows = orderedRows.filter((row) => row.release_id === releaseId);
    }
    if (pathname === "college_knowledge_releases" && releaseFilter && orderedRows.length === 1) {
      state.releaseMetadataReadback = true;
    }
    if (order.length) {
      orderedRows.sort((left, right) => {
        for (const item of order) {
          const compared = valueCompare(left[item.name], right[item.name]);
          if (compared) return item.descending ? -compared : compared;
        }
        return 0;
      });
    }
  }
  const page = orderedRows.slice(offset, offset + limit).map((row) =>
    Object.fromEntries(select.map((column) => [column, row[column] ?? null])),
  );
  for (const row of page) {
    if (Object.keys(row).length !== select.length || select.some((column) => !(column in row))) {
      state.projectionValid = false;
    }
  }

  if (limit === 500 && orderText) {
    const streamKey = `${pathname}\u0000${releaseFilter ?? "all"}`;
    let stream = readStreams.get(streamKey);
    if (offset === 0 && (!stream || stream.complete)) {
      stream = { total: 0, nextOffset: 0, complete: false, order: orderText, offsets: [] };
      readStreams.set(streamKey, stream);
    }
    const expectedOrder = verificationOrders[pathname];
    if (!stream || stream.nextOffset !== offset || stream.order !== orderText || orderText !== expectedOrder) {
      state.paginationValid = false;
    }
    if (stream) {
      stream.offsets.push(offset);
      stream.nextOffset = offset + page.length;
      stream.total += page.length;
      stream.complete = page.length < limit;
    }
  }
  return response(200, page);
};
