#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { buildCollegeKnowledge } from "./lib/college-knowledge.mjs";
import { validateEmbeddingArtifact } from "./lib/college-embeddings.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => quote(JSON.stringify(value)) + "::jsonb";
const nonSourceFields = new Set(["embedding", "embedding_model", "embedding_version", "embedding_content_sha256", "college_slug"]);

/** Generate one transaction. This function neither connects to a database nor calls a provider. */
export function embeddingPublicationSql(artifact, seed, { database, expectedModel = null, expectedVersion = null } = {}) {
  const validated = validateEmbeddingArtifact(artifact, seed);
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(database ?? "")) throw new Error("An explicit target database name is required.");
  if ((expectedModel === null) !== (expectedVersion === null) ||
      [expectedModel, expectedVersion].some((value) => value !== null && (typeof value !== "string" || !value.trim() || value.length > 200))) {
    throw new Error("A replacement requires both expected model and version, each 1–200 characters.");
  }
  const byId = new Map(seed.passages.map((passage) => [passage.passage_id, passage]));
  const metadata = {
    database, release_id: validated.releaseId, dataset_sha256: validated.datasetSha256,
    model: validated.model, version: validated.modelVersion, count: validated.expectedPassageCount,
    expected_model: expectedModel, expected_version: expectedVersion,
  };
  const parts = [
    "-- CollegeSearch complete embedding index; contains public college data only.",
    `-- Artifact SHA-256: ${validated.artifactSha256}`,
    "-- Apply the WHOLE file using psql -X -v ON_ERROR_STOP=1 -f FILE.",
    "-- Confirm the connection's project before applying; a database name is not a project identity.",
    "begin;",
    "set local standard_conforming_strings = on;",
    "set local search_path = '';",
    "set local lock_timeout = '10s';",
    "set local statement_timeout = '120s';",
    "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('college-search-knowledge-seed'));",
    "create temporary table cs_embedding_metadata (payload jsonb not null) on commit drop;",
    `insert into pg_temp.cs_embedding_metadata values (${json(metadata)});`,
    `do $$ begin
      if current_database() <> (select payload->>'database' from pg_temp.cs_embedding_metadata) then
        raise exception 'Embedding publication target database mismatch';
      end if;
    end; $$;`,
    "lock table public.college_knowledge_releases, public.college_passages in share row exclusive mode;",
    "create temporary table cs_embedding_entries (passage_id text primary key, passage jsonb not null, embedding extensions.vector(2048) not null) on commit drop;",
  ];
  for (let offset = 0; offset < validated.entries.length; offset += 8) {
    const batch = validated.entries.slice(offset, offset + 8).map((entry) => ({
      passage_id: entry.passageId,
      passage: Object.fromEntries(Object.entries(byId.get(entry.passageId)).filter(([key]) => !nonSourceFields.has(key))),
      embedding: JSON.stringify(entry.embedding),
    }));
    parts.push(`insert into pg_temp.cs_embedding_entries select input.passage_id, input.passage, input.embedding::extensions.vector(2048)
      from pg_catalog.jsonb_to_recordset(${json(batch)}) as input(passage_id text, passage jsonb, embedding text);`);
  }
  parts.push(`do $$
    declare
      meta jsonb;
      release_row public.college_knowledge_releases%rowtype;
      passage_count bigint;
      populated_count bigint;
      already_identical boolean;
      changed_count bigint;
    begin
      select payload into strict meta from pg_temp.cs_embedding_metadata;
      select * into release_row from public.college_knowledge_releases
        where release_id = meta->>'release_id' for update;
      if not found or not release_row.is_current or release_row.published_at is null or
         release_row.dataset_sha256 <> meta->>'dataset_sha256' or release_row.embedding_dimensions <> 2048 then
        raise exception 'Embedding publication requires the exact current published data release';
      end if;
      select count(*), count(embedding) into passage_count, populated_count
        from public.college_passages where release_id = release_row.release_id;
      if passage_count <> (meta->>'count')::bigint or
         (select count(*) from pg_temp.cs_embedding_entries) <> passage_count then
        raise exception 'Embedding publication requires every passage exactly once';
      end if;
      if exists (
        select 1 from pg_temp.cs_embedding_entries incoming
        left join public.college_passages stored using (passage_id)
        where stored.passage_id is null or
          (to_jsonb(stored) - array['embedding', 'embedding_model', 'embedding_version',
            'embedding_content_sha256', 'search_vector', 'created_at']) is distinct from incoming.passage
      ) then
        raise exception 'Embedding publication passage content or provenance mismatch';
      end if;
      if exists (select 1 from pg_temp.cs_embedding_entries where extensions.vector_norm(embedding) = 0) then
        raise exception 'Embedding publication rejects zero vectors';
      end if;
      select release_row.embedding_model = meta->>'model' and release_row.embedding_version = meta->>'version'
        and populated_count = passage_count and not exists (
          select 1 from pg_temp.cs_embedding_entries incoming
          join public.college_passages stored using (passage_id)
          where stored.embedding::text is distinct from incoming.embedding::text or
            stored.embedding_model is distinct from meta->>'model' or
            stored.embedding_version is distinct from meta->>'version' or
            stored.embedding_content_sha256 is distinct from stored.content_sha256
        ) into already_identical;
      if already_identical is true then return; end if;
      if release_row.embedding_model = meta->>'model' and release_row.embedding_version = meta->>'version' then
        raise exception 'Changed embedding vectors require a new model/version label';
      end if;
      if release_row.embedding_model is distinct from meta->>'expected_model' or
         release_row.embedding_version is distinct from meta->>'expected_version' then
        raise exception 'Current embedding model/version changed; replacement was not authorized';
      end if;
      if meta->>'expected_model' is null then
        if populated_count <> 0 then raise exception 'Unexpected partial embeddings require review'; end if;
      elsif populated_count <> passage_count or exists (
        select 1 from public.college_passages where release_id = release_row.release_id and
          (embedding_model is distinct from release_row.embedding_model or
           embedding_version is distinct from release_row.embedding_version or
           embedding_content_sha256 is distinct from content_sha256)
      ) then
        raise exception 'Existing embedding index is incomplete or inconsistent';
      end if;
      update public.college_passages stored set
        embedding = incoming.embedding,
        embedding_model = meta->>'model',
        embedding_version = meta->>'version',
        embedding_content_sha256 = stored.content_sha256
      from pg_temp.cs_embedding_entries incoming where stored.passage_id = incoming.passage_id;
      get diagnostics changed_count = row_count;
      if changed_count <> passage_count then raise exception 'Embedding update count mismatch'; end if;
      update public.college_knowledge_releases set embedding_model = meta->>'model', embedding_version = meta->>'version'
        where release_id = release_row.release_id;
    end; $$;`,
    "commit;", "");
  return parts.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write("Usage: node scripts/publish-college-embeddings.mjs --artifact PATH --database NAME [--write-sql PATH | --verify-sql PATH] [--expected-model MODEL --expected-version VERSION]\nDry-run validates a complete canonical artifact. --write-sql exports one atomic transaction; --verify-sql checks the file against a fresh canonical export. Neither executes SQL. No credentials or network calls are used. Applying to a hosted project requires separately verified production permission and target connection.\n");
    return;
  }
  const flags = new Map();
  const allowed = new Set(["--artifact", "--database", "--write-sql", "--verify-sql", "--expected-model", "--expected-version"]);
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || flags.has(args[i])) throw new Error("Invalid or duplicate publication option; see --help.");
    flags.set(args[i], args[i + 1]);
  }
  if (!flags.has("--artifact")) throw new Error("--artifact is required; evaluation samples and partial checkpoints cannot be published.");
  if (flags.has("--write-sql") && flags.has("--verify-sql")) throw new Error("Choose SQL export or verification, not both.");
  const artifactPath = resolve(flags.get("--artifact"));
  if ((await stat(artifactPath)).size > 128 * 1024 * 1024) throw new Error("Embedding artifact exceeds 128 MiB.");
  const bytes = await readFile(resolve(root, "data/colleges.json"));
  const datasetHash = createHash("sha256").update(bytes).digest("hex");
  const releaseId = `sha256:${datasetHash}`;
  const marker = JSON.parse(await readFile(resolve(root, "data/college-knowledge-release.json"), "utf8"));
  if (marker.releaseId !== releaseId) throw new Error("The reviewed data release marker is stale.");
  const seed = buildCollegeKnowledge(JSON.parse(bytes.toString("utf8")), releaseId);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const sql = embeddingPublicationSql(artifact, seed, {database: flags.get("--database"),
    expectedModel: flags.get("--expected-model") ?? null, expectedVersion: flags.get("--expected-version") ?? null});
  let outputPath = null;
  if (flags.has("--verify-sql")) {
    const existingPath = resolve(flags.get("--verify-sql"));
    if ((await stat(existingPath)).size !== Buffer.byteLength(sql) || (await readFile(existingPath, "utf8")) !== sql) {
      throw new Error("SQL file does not match the validated artifact and publication options; do not apply it.");
    }
  }
  if (flags.has("--write-sql")) {
    outputPath = resolve(flags.get("--write-sql"));
    await mkdir(dirname(outputPath), {recursive: true});
    await writeFile(outputPath, sql, {flag: "wx", mode: 0o600});
  }
  process.stdout.write(`${JSON.stringify({status: outputPath ? "exported" : flags.has("--verify-sql") ? "verified" : "dry-run", releaseId,
    passages: artifact.expectedPassageCount, model: artifact.model, modelVersion: artifact.modelVersion,
    artifactSha256: artifact.artifactSha256,
    sqlBytes: Buffer.byteLength(sql), sqlSha256: createHash("sha256").update(sql).digest("hex"),
    outputPath, providerCalls: 0, databaseWrites: 0}, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Embedding publication failed."}\n`);
    process.exitCode = 1;
  });
}
