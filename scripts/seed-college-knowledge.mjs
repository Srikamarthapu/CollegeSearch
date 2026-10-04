#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCollegeKnowledge } from "./lib/college-knowledge.mjs";
import { readHostedRows } from "./lib/hosted-knowledge-pages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
function quote(value) {
  return value === null || value === undefined ? "null" : "'" + String(value).replaceAll("'", "''") + "'";
}
function jsonInput(value) {
  return quote(JSON.stringify(value)) + "::jsonb";
}
function fields(names) {
  return names.map(([name, type]) => ({ name, type }));
}
function insert(table, cols, rows, conflict) {
  const names = cols.map((column) => column.name).join(", ");
  const defs = cols.map((column) => column.name + " " + column.type).join(", ");
  return [
    "insert into public." + table + " (" + names + ")",
    "select " + names,
    "from pg_catalog.jsonb_to_recordset(" + jsonInput(rows) + ") as input(" + defs + ")",
    "on conflict " + conflict + ";",
    "",
  ].join("\n");
}
function immutableConflictGuard(table, cols, rows, keyColumns) {
  const names = cols.map((column) => column.name);
  const rowTypes = cols.map((column) => column.name + " " + column.type).join(", ");
  const existingRow = names.map((name) => "existing." + name).join(", ");
  const incomingRow = names.map((name) => "incoming." + name).join(", ");
  return [
    "do $$ begin",
    "  if exists (",
    "    select 1 from pg_catalog.jsonb_to_recordset(" + jsonInput(rows) + ") as incoming(" + rowTypes + ")",
    "    join public." + table + " as existing using (" + keyColumns.join(", ") + ")",
    "    where row(" + existingRow + ") is distinct from row(" + incomingRow + ")",
    "  ) then",
    "    raise exception 'Immutable staged rows conflict in " + table + "';",
    "  end if;",
    "end; $$;",
    "",
  ].join("\n");
}
function batches(rows, size) {
  const result = [];
  for (let offset = 0; offset < rows.length; offset += size) result.push(rows.slice(offset, offset + size));
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function comparable(row, cols) {
  return Object.fromEntries(cols.map(({ name, type }) => {
    let value = row[name] ?? null;
    if (value !== null && /^(bigint|smallint|integer|numeric)$/.test(type)) value = Number(value);
    return [name, canonical(value)];
  }));
}
function primaryKey(row, names) {
  return names.map((name) => String(row[name])).join("\u0000");
}

const datasetBytes = await readFile(path.join(root, "data", "colleges.json"));
const digest = createHash("sha256").update(datasetBytes).digest("hex");
const releaseId = "sha256:" + digest;
const dataset = JSON.parse(datasetBytes.toString("utf8"));
const seed = buildCollegeKnowledge(dataset, releaseId);
const marker = JSON.parse(await readFile(path.join(root, "data", "college-knowledge-release.json"), "utf8"));
if (marker.releaseId !== releaseId) {
  throw new Error("Knowledge release marker does not match data/colleges.json; run the builder first.");
}

const catalogReleaseColumns = fields([
  ["release_id", "text"], ["unit_id", "bigint"], ["slug", "text"], ["name", "text"],
  ["city", "text"], ["state", "text"], ["census_region", "text"], ["ownership_code", "smallint"],
  ["ownership_label", "text"], ["catalog_category", "text"], ["inclusion_reason", "text"],
  ["aliases", "text[]"], ["website", "text"], ["record_json", "jsonb"],
]);
const sourceColumns = fields([
  ["release_id", "text"], ["source_id", "text"], ["publisher", "text"], ["source_name", "text"],
  ["source_url", "text"], ["source_page", "text"], ["artifact_url", "text"], ["artifact_sha256", "text"],
  ["source_urls", "text[]"], ["reporting_year", "smallint"], ["cohort", "text"], ["finality", "text"],
  ["accessed_on", "date"], ["source_metadata", "jsonb"],
]);
const bindingColumns = fields([["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"]]);
const factColumns = fields([
  ["fact_id", "text"], ["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"],
  ["evidence_url", "text"], ["source_field", "text"], ["fact_key", "text"], ["metric_key", "text"],
  ["dimension_key", "text"], ["is_primary", "boolean"], ["value_numeric", "numeric"],
  ["value_boolean", "boolean"], ["value_text", "text"], ["unit", "text"], ["reporting_year", "smallint"],
  ["period_label", "text"], ["cohort", "text"], ["definition", "text"], ["status", "text"],
  ["finality", "text"], ["accessed_on", "date"], ["comparability_key", "text"],
]);
const passageColumns = fields([
  ["passage_id", "text"], ["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"],
  ["source_url", "text"], ["source_field", "text"], ["field_locator", "text"],
  ["reporting_year", "smallint"], ["period_label", "text"], ["cohort", "text"], ["definition", "text"],
  ["title", "text"], ["content", "text"], ["content_sha256", "text"],
]);

// Generate local SQL lazily in bounded batches; a nationwide catalog exceeds
// V8's single-string limit if the immutable guards and inserts are concatenated.
function* localSql() {
  yield "do $$ begin if current_database() not in ('collegesearch_m2_dev', 'collegesearch_m2_verify') then raise exception 'Knowledge seeding requires an isolated local database'; end if; end; $$;\n";
  yield "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('college-search-knowledge-seed'));\n";
const releaseSql = [
  "insert into public.college_knowledge_releases (",
  "  release_id, dataset_sha256, cohort_name, institution_count, source_accessed_on,",
  "  federal_release_date, embedding_model, embedding_version, embedding_dimensions, release_metadata",
  ") values (",
  "  " + quote(seed.release.release_id) + ", " + quote(seed.release.dataset_sha256) + ",",
  "  " + quote(seed.release.cohort_name) + ", " + seed.release.institution_count + ",",
  "  " + quote(seed.release.source_accessed_on) + "::date, " + quote(seed.release.federal_release_date) + "::date,",
  "  null, null, 2048, " + jsonInput(seed.release.release_metadata),
  ")",
  "on conflict (release_id) do nothing;",
  "",
  "do $$ begin",
  "  if not exists (select 1 from public.college_knowledge_releases as release",
  "    where release.release_id = " + quote(releaseId) +
    " and release.dataset_sha256 = " + quote(seed.release.dataset_sha256) +
    " and release.cohort_name = " + quote(seed.release.cohort_name) +
    " and release.institution_count = " + seed.release.institution_count +
    " and release.source_accessed_on = " + quote(seed.release.source_accessed_on) + "::date" +
    " and release.federal_release_date = " + quote(seed.release.federal_release_date) + "::date" +
    " and release.embedding_dimensions = 2048 and release.release_metadata = " + jsonInput(seed.release.release_metadata) + ") then",
  "    raise exception 'Immutable release metadata conflicts with the staged release';",
  "  end if;",
  "end; $$;",
  "",
].join("\n");

  yield releaseSql;
  for (const rows of batches(seed.catalog, 25)) {
    const catalogJson = jsonInput(rows);
    yield [
      "do $$ begin if exists (select 1 from pg_catalog.jsonb_to_recordset(" + catalogJson + ") as incoming(unit_id bigint, slug text) join public.college_catalog as existing using (unit_id) where existing.slug <> incoming.slug) then raise exception 'Refusing to rewrite a stable college slug'; end if; end; $$;",
      "insert into public.college_catalog (" + catalogReleaseColumns.map(({ name }) => name).join(", ") + ")",
      "select " + catalogReleaseColumns.map(({ name }) => name === "release_id" ? "null::text as release_id" : name).join(", "),
      "from pg_catalog.jsonb_to_recordset(" + catalogJson + ") as input(" + catalogReleaseColumns.map(({ name, type }) => name + " " + type).join(", ") + ") on conflict (unit_id) do nothing;",
      immutableConflictGuard("college_catalog_release_records", catalogReleaseColumns, rows, ["release_id", "unit_id"]),
      insert("college_catalog_release_records", catalogReleaseColumns, rows, "(release_id, unit_id) do nothing"),
      "",
    ].join("\n");
  }
  for (const [table, columns, rows, keys] of [
    ["college_sources", sourceColumns, seed.sources, ["release_id", "source_id"]],
    ["college_source_bindings", bindingColumns, seed.bindings, ["release_id", "unit_id", "source_id"]],
    ["college_facts", factColumns, seed.facts, ["fact_id"]],
    ["college_passages", passageColumns, seed.passages, ["passage_id"]],
  ]) {
    for (const batch of batches(rows, 250)) {
      yield immutableConflictGuard(table, columns, batch, keys);
      yield insert(table, columns, batch, "(" + keys.join(", ") + ") do nothing");
    }
  }
  yield "select * from public.publish_college_knowledge_release(" + [
    quote(releaseId), quote(seed.release.dataset_sha256), seed.catalog.length,
    seed.sources.length, seed.bindings.length, seed.facts.length, seed.passages.length,
  ].join(", ") + ");\n";
}
const hostedProject = arg("--hosted-project");
const hostedSqlDirectory = arg("--write-hosted-sql-dir");
if (hostedSqlDirectory) {
  if (!hostedProject || !/^[a-z0-9]{20}$/.test(hostedProject)) {
    throw new Error("Hosted SQL export requires --hosted-project with a 20-character Supabase project ref.");
  }
  if (arg("--database") || arg("--database-url") || arg("--docker-container") || arg("--write-sql")) {
    throw new Error("Hosted SQL export cannot be combined with local database or SQL output targets.");
  }
  const outputDirectory = path.resolve(root, hostedSqlDirectory);
  const maxSqlBytes = 90 * 1024;

  function sqlHeader(step) {
    return [
      "-- CollegeSearch knowledge release staging batch",
      `-- Target Supabase project ref: ${hostedProject}`,
      `-- Release: ${releaseId}`,
      `-- Step: ${step}`,
      "-- Apply in the lexical order listed in manifest.json; publish is the final batch.",
      "",
    ].join("\n");
  }
  function sqlDoBlock(declarations, statements) {
    const body = [declarations ? `DECLARE\n${declarations}` : "", "BEGIN", statements, "END"].filter(Boolean).join("\n");
    let tag = "$$";
    let suffix = 0;
    while (body.includes(tag)) tag = `$college_seed_${++suffix}$`;
    return `DO ${tag}\n${body}\n${tag};\n`;
  }
  function hostedStageBlock(table, cols, rows, keyColumns, conflictClause, step) {
    const rowTypes = cols.map((column) => `${column.name} ${column.type}`).join(", ");
    const names = cols.map((column) => column.name).join(", ");
    const existingRow = names.split(", ").map((name) => `existing.${name}`).join(", ");
    const incomingRow = names.split(", ").map((name) => `incoming.${name}`).join(", ");
    const payload = jsonInput(rows);
    const statement = sqlDoBlock(
      `payload constant jsonb := ${payload};`,
      [
        "  if exists (",
        `    select 1 from pg_catalog.jsonb_to_recordset(payload) as incoming(${rowTypes})`,
        `    join public.${table} as existing using (${keyColumns.join(", ")})`,
        `    where row(${existingRow}) is distinct from row(${incomingRow})`,
        "  ) then",
        `    raise exception 'Immutable staged rows conflict in ${table}';`,
        "  end if;",
        `  insert into public.${table} (${names})`,
        `  select ${names} from pg_catalog.jsonb_to_recordset(payload) as input(${rowTypes})`,
        `  on conflict ${conflictClause};`,
      ].join("\n"),
    );
    return sqlHeader(step) + statement;
  }
  function chunkedSqlFiles(prefix, label, rows, render) {
    const chunksForTable = [];
    let pending = [];
    for (const row of rows) {
      const candidate = [...pending, row];
      const candidateSql = render(candidate, String(chunksForTable.length + 1).padStart(6, "0"));
      if (Buffer.byteLength(candidateSql, "utf8") > maxSqlBytes) {
        if (!pending.length) throw new Error(`One ${label} row exceeds the hosted SQL batch limit.`);
        chunksForTable.push(pending);
        pending = [row];
      } else {
        pending = candidate;
      }
    }
    if (pending.length) chunksForTable.push(pending);
    return chunksForTable.map((chunk, index) => {
      const sequence = String(index + 1).padStart(6, "0");
      const name = `${prefix}-${sequence}.sql`;
      const contents = render(chunk, sequence);
      const sizeBytes = Buffer.byteLength(contents, "utf8");
      if (sizeBytes > maxSqlBytes) throw new Error(`${name} exceeds the hosted SQL batch limit.`);
      return { name, step: `${label} ${sequence}`, contents, sizeBytes };
    });
  }

  const catalogColumns = catalogReleaseColumns;
  const identityRows = seed.catalog.map((row) => ({
    release_id: null,
    unit_id: row.unit_id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    state: row.state,
    census_region: row.census_region,
    ownership_code: row.ownership_code,
    ownership_label: row.ownership_label,
    catalog_category: row.catalog_category,
    inclusion_reason: row.inclusion_reason,
    aliases: row.aliases,
    website: row.website,
    record_json: {
      unitId: row.unit_id,
      slug: row.slug,
      name: row.name,
      city: row.city,
      state: row.state,
      region: row.census_region,
      ownership: row.ownership_label,
      aliases: row.aliases,
      website: row.website,
      catalogCategory: row.catalog_category,
      inclusionReason: row.inclusion_reason,
    },
  }));
  const releaseStatement = sqlDoBlock(
    `release_payload constant jsonb := ${jsonInput([seed.release])};`,
    [
      "  insert into public.college_knowledge_releases (",
      "    release_id, dataset_sha256, cohort_name, institution_count, source_accessed_on,",
      "    federal_release_date, embedding_dimensions, release_metadata",
      "  )",
      "  select release_id, dataset_sha256, cohort_name, institution_count, source_accessed_on::date,",
      "    federal_release_date::date, embedding_dimensions, release_metadata",
      "  from pg_catalog.jsonb_to_recordset(release_payload) as input(",
      "    release_id text, dataset_sha256 text, cohort_name text, institution_count integer,",
      "    source_accessed_on text, federal_release_date text, embedding_model text, embedding_version text,",
      "    embedding_dimensions integer, release_metadata jsonb",
      "  )",
      "  on conflict (release_id) do nothing;",
      "  if not exists (",
      "    select 1 from public.college_knowledge_releases as release",
      `    where release.release_id = ${quote(releaseId)}`,
      `      and release.dataset_sha256 = ${quote(seed.release.dataset_sha256)}`,
      `      and release.cohort_name = ${quote(seed.release.cohort_name)}`,
      `      and release.institution_count = ${seed.release.institution_count}`,
      `      and release.source_accessed_on = ${quote(seed.release.source_accessed_on)}::date`,
      `      and release.federal_release_date = ${quote(seed.release.federal_release_date)}::date`,
      "      and release.embedding_dimensions = 2048",
      `      and release.release_metadata = ${jsonInput(seed.release.release_metadata)}`,
      "      and (release.embedding_model is null) = (release.embedding_version is null)",
      "  ) then",
      "    raise exception 'Immutable release metadata conflicts with the staged release';",
      "  end if;",
    ].join("\n"),
  );
  function hostedIdentityBlock(rows, sequence) {
    const rowTypes = catalogColumns.map((column) => `${column.name} ${column.type}`).join(", ");
    const statement = sqlDoBlock(
      `identity_payload constant jsonb := ${jsonInput(rows)};`,
      [
        "  if exists (",
        "    select 1 from pg_catalog.jsonb_to_recordset(identity_payload) as incoming(unit_id bigint, slug text)",
        "    join public.college_catalog as existing using (unit_id)",
        "    where existing.slug <> incoming.slug",
        "  ) then",
        "    raise exception 'Refusing to rewrite a stable college slug for an existing UNITID';",
        "  end if;",
        `  insert into public.college_catalog (${catalogColumns.map((column) => column.name).join(", ")})`,
        `  select null::text as release_id, ${catalogColumns.slice(1).map((column) => column.name).join(", ")}`,
        `  from pg_catalog.jsonb_to_recordset(identity_payload) as input(${rowTypes})`,
        "  on conflict (unit_id) do nothing;",
      ].join("\n"),
    );
    return sqlHeader(`stable identities ${sequence}`) + statement;
  }

  const sourceColumns = fields([
    ["release_id", "text"], ["source_id", "text"], ["publisher", "text"], ["source_name", "text"],
    ["source_url", "text"], ["source_page", "text"], ["artifact_url", "text"], ["artifact_sha256", "text"],
    ["source_urls", "text[]"], ["reporting_year", "smallint"], ["cohort", "text"], ["finality", "text"],
    ["accessed_on", "date"], ["source_metadata", "jsonb"],
  ]);
  const bindingColumns = fields([["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"]]);
  const factColumns = fields([
    ["fact_id", "text"], ["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"],
    ["evidence_url", "text"], ["source_field", "text"], ["fact_key", "text"], ["metric_key", "text"],
    ["dimension_key", "text"], ["is_primary", "boolean"], ["value_numeric", "numeric"],
    ["value_boolean", "boolean"], ["value_text", "text"], ["unit", "text"], ["reporting_year", "smallint"],
    ["period_label", "text"], ["cohort", "text"], ["definition", "text"], ["status", "text"],
    ["finality", "text"], ["accessed_on", "date"], ["comparability_key", "text"],
  ]);
  const passageColumns = fields([
    ["passage_id", "text"], ["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"],
    ["source_url", "text"], ["source_field", "text"], ["field_locator", "text"],
    ["reporting_year", "smallint"], ["period_label", "text"], ["cohort", "text"], ["definition", "text"],
    ["title", "text"], ["content", "text"], ["content_sha256", "text"],
  ]);
  const sqlFiles = [{
    name: "000-release-metadata.sql",
    step: "release metadata",
    contents: sqlHeader("release metadata") + releaseStatement,
    sizeBytes: Buffer.byteLength(sqlHeader("release metadata") + releaseStatement, "utf8"),
  }];
  sqlFiles.push(...chunkedSqlFiles("001-stable-identities", "stable identities", identityRows,
    (rows, sequence) => hostedIdentityBlock(rows, sequence)));
  sqlFiles.push(...chunkedSqlFiles("010-catalog-snapshot", "catalog snapshot", seed.catalog,
    (rows, sequence) => hostedStageBlock("college_catalog_release_records", catalogColumns, rows,
      ["release_id", "unit_id"], "(release_id, unit_id) do nothing", sequence)));
  sqlFiles.push(...chunkedSqlFiles("020-sources", "source registry", seed.sources,
    (rows, sequence) => hostedStageBlock("college_sources", sourceColumns, rows,
      ["release_id", "source_id"], "(release_id, source_id) do nothing", sequence)));
  sqlFiles.push(...chunkedSqlFiles("030-bindings", "institution source bindings", seed.bindings,
    (rows, sequence) => hostedStageBlock("college_source_bindings", bindingColumns, rows,
      ["release_id", "unit_id", "source_id"], "(release_id, unit_id, source_id) do nothing", sequence)));
  sqlFiles.push(...chunkedSqlFiles("040-facts", "structured facts", seed.facts,
    (rows, sequence) => hostedStageBlock("college_facts", factColumns, rows,
      ["fact_id"], "(fact_id) do nothing", sequence)));
  const hostedPassages = seed.passages.map((row) => Object.fromEntries(
    passageColumns.map(({ name }) => [name, row[name]]),
  ));
  sqlFiles.push(...chunkedSqlFiles("050-passages", "descriptive passages", hostedPassages,
    (rows, sequence) => hostedStageBlock("college_passages", passageColumns, rows,
      ["passage_id"], "(passage_id) do nothing", sequence)));
  const publishSql = [
    sqlHeader("verify staged counts and publish atomically"),
    "select * from public.publish_college_knowledge_release(",
    `  ${quote(releaseId)}, ${quote(seed.release.dataset_sha256)}, ${seed.catalog.length},`,
    `  ${seed.sources.length}, ${seed.bindings.length}, ${seed.facts.length}, ${seed.passages.length}`,
    ");",
    "",
  ].join("\n");
  sqlFiles.push({
    name: "060-verify-and-publish.sql",
    step: "verify staged counts and publish atomically",
    contents: publishSql,
    sizeBytes: Buffer.byteLength(publishSql, "utf8"),
  });

  for (const file of sqlFiles) {
    if (file.sizeBytes > maxSqlBytes) throw new Error(`${file.name} exceeds the hosted SQL batch limit.`);
  }
  const existingFiles = await readdir(outputDirectory).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error));
  const expectedNames = new Set(sqlFiles.map((file) => file.name));
  const unexpectedSqlFiles = existingFiles.filter((name) => name.endsWith(".sql") && !expectedNames.has(name));
  if (unexpectedSqlFiles.length) {
    throw new Error(`Hosted SQL directory contains stale batch files: ${unexpectedSqlFiles.slice(0, 3).join(", ")}.`);
  }
  await mkdir(outputDirectory, { recursive: true });
  const manifestFiles = [];
  for (const file of sqlFiles) {
    await writeFile(path.join(outputDirectory, file.name), file.contents);
    manifestFiles.push({
      name: file.name,
      step: file.step,
      sizeBytes: file.sizeBytes,
      sha256: createHash("sha256").update(file.contents).digest("hex"),
    });
  }
  const manifest = {
    targetProject: hostedProject,
    releaseId,
    datasetSha256: seed.release.dataset_sha256,
    institutions: seed.catalog.length,
    sources: seed.sources.length,
    bindings: seed.bindings.length,
    facts: seed.facts.length,
    passages: seed.passages.length,
    embeddedPassages: 0,
    maxSqlBytes,
    files: manifestFiles,
  };
  await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outputDirectory, "README.md"), [
    `Target Supabase project ref: \`${hostedProject}\`.`,
    `Knowledge release: \`${releaseId}\`.`,
    "",
    "Apply the SQL files in lexical order. The release remains unpublished until `060-verify-and-publish.sql` succeeds.",
    "Each stage batch is repeatable, rejects conflicting rows, and contains no schema changes or credentials.",
    "Confirm the selected Supabase project matches the target ref before executing these files.",
    "",
  ].join("\n"));
  console.log(JSON.stringify({
    output: path.relative(root, outputDirectory),
    targetProject: hostedProject,
    releaseId,
    files: sqlFiles.length,
    maxFileBytes: Math.max(...sqlFiles.map((file) => file.sizeBytes)),
    institutions: seed.catalog.length,
    sources: seed.sources.length,
    bindings: seed.bindings.length,
    facts: seed.facts.length,
    passages: seed.passages.length,
    embeddedPassages: 0,
  }));
  process.exit(0);
}
if (hostedProject) {
  if (!/^[a-z0-9]{20}$/.test(hostedProject)) {
    throw new Error("--hosted-project must be a 20-character Supabase project ref.");
  }
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Hosted staging requires SUPABASE_URL and SUPABASE_SECRET_KEY in the environment.");
  }
  const usesSecretApiKey = serviceRoleKey.startsWith("sb_secret_");
  const legacyKeyParts = serviceRoleKey.split(".");
  if (!usesSecretApiKey && (legacyKeyParts.length !== 3 || legacyKeyParts.some((part) => !part))) {
    throw new Error("Hosted staging requires a Supabase secret API key or legacy service-role JWT.");
  }
  const projectUrl = new URL(supabaseUrl);
  if (projectUrl.protocol !== "https:" || projectUrl.hostname !== `${hostedProject}.supabase.co` ||
      projectUrl.username || projectUrl.password || projectUrl.pathname !== "/" ||
      projectUrl.port || projectUrl.search || projectUrl.hash) {
    throw new Error("SUPABASE_URL does not identify the requested hosted Supabase project.");
  }

  async function rest(pathname, { method = "GET", query, body, prefer, range } = {}) {
    const url = new URL(`/rest/v1/${pathname}`, projectUrl);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    const headers = {
      apikey: serviceRoleKey,
      accept: "application/json",
    };
    // Current sb_secret keys are API keys, not JWTs; only legacy service-role keys
    // belong in Authorization. Supabase rejects a secret key used as a bearer JWT.
    if (!usesSecretApiKey) headers.authorization = `Bearer ${serviceRoleKey}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    if (prefer) headers.prefer = prefer;
    if (range) {
      headers.range = `${range.start}-${range.end}`;
      headers["range-unit"] = "items";
    }
    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const reason = error?.name === "TimeoutError" ? "timed out after 30 seconds" : "failed before receiving a response";
      throw new Error(`Hosted Supabase ${method} ${pathname} ${reason}.`);
    }
    const responseText = await response.text();
    if (!response.ok) {
      let code = "unknown";
      try {
        const payload = JSON.parse(responseText);
        if (typeof payload?.code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(payload.code)) code = payload.code;
      } catch { /* keep remote response bodies out of diagnostics */ }
      throw new Error(`Hosted Supabase ${method} ${pathname} failed (HTTP ${response.status}, code ${code}).`);
    }
    if (!responseText) return null;
    try { return JSON.parse(responseText); } catch { return responseText; }
  }
  async function postRows(table, rows, conflictColumns, batchSize) {
    for (const batch of batches(rows, batchSize)) {
      await rest(table, {
        method: "POST",
        query: { on_conflict: conflictColumns.join(",") },
        body: batch,
        prefer: "resolution=ignore-duplicates,return=minimal",
      });
    }
  }
  function assertRowsEqual(table, expectedRows, actualRows, columns, keyColumns) {
    const expected = new Map(expectedRows.map((row) => [primaryKey(row, keyColumns), comparable(row, columns)]));
    const actual = new Map(actualRows.map((row) => [primaryKey(row, keyColumns), comparable(row, columns)]));
    if (expected.size !== expectedRows.length || actual.size !== actualRows.length || expected.size !== actual.size) {
      throw new Error(`Hosted ${table} staged row count or key set does not match the compiled release.`);
    }
    for (const [key, expectedValue] of expected) {
      if (JSON.stringify(expectedValue) !== JSON.stringify(actual.get(key))) {
        throw new Error(`Hosted ${table} contains a conflicting immutable row for key ${key.replaceAll("\u0000", "/")}.`);
      }
    }
  }

  const identityColumns = catalogReleaseColumns;
  const identityRows = seed.catalog.map((row) => ({ ...row, release_id: null }));
  const currentIdentities = await readHostedRows(rest, "college_catalog", [
    { name: "unit_id", type: "bigint" }, { name: "slug", type: "text" },
  ], null, ["unit_id"]);
  const identitiesById = new Map(currentIdentities.map((row) => [String(row.unit_id), row]));
  for (const row of seed.catalog) {
    const existing = identitiesById.get(String(row.unit_id));
    if (existing && existing.slug !== row.slug) {
      throw new Error(`Hosted UNITID ${row.unit_id} already has stable slug ${existing.slug}; refusing to rewrite it.`);
    }
  }
  const missingIdentities = identityRows.filter((row) => !identitiesById.has(String(row.unit_id)));
  if (missingIdentities.length) {
    await postRows("college_catalog", missingIdentities, ["unit_id"], 25);
  }
  const identitiesAfterInsert = await readHostedRows(rest, "college_catalog", [
    { name: "unit_id", type: "bigint" }, { name: "slug", type: "text" },
  ], null, ["unit_id"]);
  const verifiedIdentities = new Map(identitiesAfterInsert.map((row) => [String(row.unit_id), row.slug]));
  if (seed.catalog.some((row) => verifiedIdentities.get(String(row.unit_id)) !== row.slug)) {
    throw new Error("Hosted stable catalog identities are incomplete or conflict with the reviewed slugs.");
  }

  // Confirm that the staging schema is installed before writing any release data.
  await rest("college_catalog_release_records", {
    query: { select: "unit_id", limit: "1" },
  });
  const stagedRelease = {
    ...seed.release,
    is_current: false,
  };
  await rest("college_knowledge_releases", {
    method: "POST",
    query: { on_conflict: "release_id" },
    body: [stagedRelease],
    prefer: "resolution=ignore-duplicates,return=minimal",
  });
  const releaseRows = await rest("college_knowledge_releases", {
    query: {
      select: "release_id,dataset_sha256,cohort_name,institution_count,source_accessed_on,federal_release_date,embedding_model,embedding_version,embedding_dimensions,release_metadata,is_current,published_at",
      release_id: `eq.${releaseId}`,
      limit: "2",
    },
  });
  if (!Array.isArray(releaseRows) || releaseRows.length !== 1) {
    throw new Error("Hosted release metadata was not created exactly once.");
  }
  const storedRelease = releaseRows[0];
  for (const key of ["release_id", "dataset_sha256", "cohort_name", "institution_count", "source_accessed_on", "federal_release_date", "embedding_dimensions"]) {
    if (String(storedRelease[key]) !== String(stagedRelease[key])) {
      throw new Error(`Hosted release metadata conflicts at ${key}.`);
    }
  }
  if (JSON.stringify(canonical(storedRelease.release_metadata)) !== JSON.stringify(canonical(stagedRelease.release_metadata)) ||
      (storedRelease.embedding_model === null) !== (storedRelease.embedding_version === null)) {
    throw new Error("Hosted release metadata is not an immutable match for the compiled release.");
  }

  const bindingColumns = fields([["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"]]);
  const sourceColumns = fields([
    ["release_id", "text"], ["source_id", "text"], ["publisher", "text"], ["source_name", "text"],
    ["source_url", "text"], ["source_page", "text"], ["artifact_url", "text"], ["artifact_sha256", "text"],
    ["source_urls", "text[]"], ["reporting_year", "smallint"], ["cohort", "text"], ["finality", "text"],
    ["accessed_on", "date"], ["source_metadata", "jsonb"],
  ]);
  const factColumns = fields([
    ["fact_id", "text"], ["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"],
    ["evidence_url", "text"], ["source_field", "text"], ["fact_key", "text"], ["metric_key", "text"],
    ["dimension_key", "text"], ["is_primary", "boolean"], ["value_numeric", "numeric"],
    ["value_boolean", "boolean"], ["value_text", "text"], ["unit", "text"], ["reporting_year", "smallint"],
    ["period_label", "text"], ["cohort", "text"], ["definition", "text"], ["status", "text"],
    ["finality", "text"], ["accessed_on", "date"], ["comparability_key", "text"],
  ]);
  const passageColumns = fields([
    ["passage_id", "text"], ["release_id", "text"], ["unit_id", "bigint"], ["source_id", "text"],
    ["source_url", "text"], ["source_field", "text"], ["field_locator", "text"],
    ["reporting_year", "smallint"], ["period_label", "text"], ["cohort", "text"], ["definition", "text"],
    ["title", "text"], ["content", "text"], ["content_sha256", "text"],
  ]);
  await postRows("college_catalog_release_records", seed.catalog, ["release_id", "unit_id"], 25);
  await postRows("college_sources", seed.sources, ["release_id", "source_id"], 100);
  await postRows("college_source_bindings", seed.bindings, ["release_id", "unit_id", "source_id"], 250);
  await postRows("college_facts", seed.facts, ["fact_id"], 250);
  const hostedPassages = seed.passages.map((row) => Object.fromEntries(
    passageColumns.map(({ name }) => [name, row[name]]),
  ));
  await postRows("college_passages", hostedPassages, ["passage_id"], 150);

  const tableChecks = [
    ["college_catalog_release_records", seed.catalog, identityColumns, ["release_id", "unit_id"]],
    ["college_sources", seed.sources, sourceColumns, ["release_id", "source_id"]],
    ["college_source_bindings", seed.bindings, bindingColumns, ["release_id", "unit_id", "source_id"]],
    ["college_facts", seed.facts, factColumns, ["fact_id"]],
    ["college_passages", seed.passages, passageColumns, ["passage_id"]],
  ];
  for (const [table, expectedRows, columns, keys] of tableChecks) {
    const actualRows = await readHostedRows(rest, table, columns, releaseId, keys);
    assertRowsEqual(table, expectedRows, actualRows, columns, keys);
  }
  const publishResult = await rest("rpc/publish_college_knowledge_release", {
    method: "POST",
    body: {
      p_release_id: releaseId,
      p_dataset_sha256: seed.release.dataset_sha256,
      p_expected_institution_count: seed.catalog.length,
      p_expected_source_count: seed.sources.length,
      p_expected_binding_count: seed.bindings.length,
      p_expected_fact_count: seed.facts.length,
      p_expected_passage_count: seed.passages.length,
    },
  });
  if (!Array.isArray(publishResult) || publishResult.length !== 1 || publishResult[0].release_id !== releaseId) {
    throw new Error("Hosted publish RPC did not return the staged release.");
  }
  console.log(JSON.stringify({
    releaseId,
    destination: `supabase:${hostedProject}`,
    institutions: seed.catalog.length,
    sources: seed.sources.length,
    bindings: seed.bindings.length,
    facts: seed.facts.length,
    passages: seed.passages.length,
    embeddedPassages: 0,
    publishedAt: publishResult[0].published_at,
  }));
  process.exit(0);
}
const writeSqlPath = arg("--write-sql");
if (writeSqlPath) {
  const outputPath = path.resolve(root, writeSqlPath);
  await pipeline(Readable.from(localSql()), createWriteStream(outputPath));
  console.log(JSON.stringify({ releaseId, output: path.relative(root, outputPath), institutions: seed.catalog.length, sources: seed.sources.length, bindings: seed.bindings.length, facts: seed.facts.length, passages: seed.passages.length }));
  process.exit(0);
}

const dockerContainer = arg("--docker-container");
const databaseName = arg("--database");
let command;
let commandArgs;
let destination;
let commandEnv = process.env;
if (dockerContainer || databaseName) {
  if (!dockerContainer || !databaseName ||
      !/^collegesearch_m2_(dev|verify)$/.test(databaseName) ||
      !/^collegesearch[-_a-zA-Z0-9]+$/.test(dockerContainer)) {
    throw new Error("Docker mode requires a collegesearch container and --database collegesearch_m2_dev or collegesearch_m2_verify.");
  }
  command = "docker";
  commandArgs = ["exec", "-i", dockerContainer, "psql", "--no-psqlrc", "--username", "postgres", "--dbname", databaseName, "--set", "ON_ERROR_STOP=1", "--single-transaction"];
  destination = "docker:" + dockerContainer + "/" + databaseName;
} else {
  const connectionString = arg("--database-url") ?? process.env.COLLEGE_KNOWLEDGE_DATABASE_URL;
  if (!connectionString) throw new Error("Provide a local --database-url or explicit --docker-container/--database target.");
  const url = new URL(connectionString);
  const databaseNameFromUrl = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      !/^collegesearch_m2_(dev|verify)$/.test(databaseNameFromUrl)) {
    throw new Error("Database URL must target loopback and collegesearch_m2_dev or collegesearch_m2_verify.");
  }
  const password = decodeURIComponent(url.password);
  url.password = "";
  command = "psql";
  commandArgs = ["--no-psqlrc", "--dbname", url.toString(), "--set", "ON_ERROR_STOP=1", "--single-transaction"];
  if (password) commandEnv = { ...process.env, PGPASSWORD: password };
  destination = "loopback/" + databaseNameFromUrl;
}

const child = spawn(command, commandArgs, { env: commandEnv, stdio: ["pipe", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
const completion = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
await pipeline(Readable.from(localSql()), child.stdin);
const exitCode = await completion;
if (exitCode !== 0) {
  process.stderr.write(stderr);
  throw new Error("College knowledge seed failed on " + destination + " (psql exit " + exitCode + ").");
}
if (stdout.trim()) process.stdout.write(stdout);
console.log(JSON.stringify({ releaseId, destination, institutions: seed.catalog.length, sources: seed.sources.length, bindings: seed.bindings.length, facts: seed.facts.length, passages: seed.passages.length, embeddedPassages: 0 }));
