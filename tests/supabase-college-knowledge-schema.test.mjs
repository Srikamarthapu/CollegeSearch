import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationPath = path.join(root, "supabase", "migrations", "20261004094151_m2_college_knowledge.sql");
const migration = await readFile(migrationPath, "utf8");
const normalized = migration.replace(/--.*$/gm, " ").replace(/\s+/g, " ").toLowerCase();
const stagingMigrationPath = path.join(root, "supabase", "migrations", "20261004101430_m2_knowledge_release_staging.sql");
const stagingMigration = await readFile(stagingMigrationPath, "utf8");
const stagingNormalized = stagingMigration.replace(/--.*$/gm, " ").replace(/\s+/g, " ").toLowerCase();
const seeder = await readFile(path.join(root, "scripts", "seed-college-knowledge.mjs"), "utf8");
const dataset = JSON.parse(await readFile(path.join(root, "data", "colleges.json"), "utf8"));
const original = JSON.parse(await readFile(path.join(root, "tests", "fixtures", "original-college-identities.json"), "utf8"));

test("M2 migration seeds stable identities before replacing saved-college CHECK", () => {
  const insertIndex = normalized.indexOf("insert into public.college_catalog");
  const missingSavedCheckIndex = normalized.indexOf("left join public.college_catalog as catalog using (unit_id)");
  const dropIndex = normalized.indexOf("drop constraint saved_colleges_unit_id_catalog");
  const foreignKeyIndex = normalized.indexOf("foreign key (unit_id) references public.college_catalog (unit_id)");
  assert.ok(insertIndex >= 0 && insertIndex < missingSavedCheckIndex && missingSavedCheckIndex < dropIndex);
  assert.ok(dropIndex < foreignKeyIndex);
  assert.match(normalized, /raise exception 'm2 refused to replace saved unitid check/);
  assert.match(normalized, /on delete restrict/);

  const seed = migration.match(/jsonb_to_recordset\('((?:[^']|'')*)'::jsonb\) as seed\(/);
  assert.ok(seed, "migration must embed a reviewed identity seed");
  const identities = JSON.parse(seed[1].replaceAll("''", "'"));
  assert.equal(identities.length, 100);
  const seeded = new Map(identities.map((row) => [row.unit_id, row.slug]));
  assert.deepEqual(
    identities.map((row) => row.unit_id).sort((a, b) => a - b),
    dataset.colleges.map((college) => college.unitId).sort((a, b) => a - b),
  );
  for (const identity of original) assert.equal(seeded.get(identity.unitId), identity.slug);
});

test("M2 knowledge tables bind every fact and passage to a same-college source", () => {
  for (const table of [
    "college_knowledge_releases",
    "college_catalog",
    "college_sources",
    "college_source_bindings",
    "college_facts",
    "college_passages",
  ]) {
    assert.match(normalized, new RegExp("alter table public\\." + table + " enable row level security"));
  }
  assert.match(normalized, /foreign key \(release_id, source_id\) references public\.college_sources/);
  assert.match(normalized, /foreign key \(release_id, unit_id, source_id\) references public\.college_source_bindings/);
  assert.match(normalized, /grant select on table public\.college_knowledge_releases,[\s\S]*?to anon, authenticated/);
  assert.match(normalized, /grant select, insert, update, delete on table public\.college_knowledge_releases,[\s\S]*?to service_role/);
  assert.match(normalized, /college_catalog_read_current[\s\S]*?release\.is_current and release\.published_at is not null/);
  assert.doesNotMatch(normalized, /security definer/);
  assert.doesNotMatch(normalized, /using (?:hnsw|ivfflat)/);
});

test("vector and RPC contracts stay bounded and provenance-aware", () => {
  assert.match(normalized, /embedding extensions\.vector\(2048\)/);
  assert.match(normalized, /embedding_content_sha256 = content_sha256/);
  assert.match(normalized, /and stored\.embedding_content_sha256 = stored\.content_sha256/);
  assert.match(normalized, /public\.current_college_knowledge_release\(\)/);
  assert.match(normalized, /public\.hybrid_search_college_passages\(/);
  assert.match(normalized, /public\.filter_college_facts\(/);
  assert.match(normalized, /query embedding model\/version does not match the active release/);
  assert.match(normalized, /at most 100 unitids may be requested/);
  assert.match(normalized, /match count must be between 1 and 20/);
  assert.match(normalized, /fact\.status in \('reported', 'derived'\)/);
  assert.match(normalized, /catalog\.ownership_code = 1 and p_residency_state = catalog\.state and fact\.source_field = 'npt4_pub'/);
  assert.match(normalized, /catalog\.ownership_code = 2 and fact\.source_field = 'npt4_priv'/);
  assert.match(normalized, /catalog\.ownership_code = 2 and \([\s\S]*?fact\.source_field = 'tuitionfee_out'[\s\S]*?fact\.comparability_key = 'tuition-fees\.out-of-state'/);
  assert.match(normalized, /fact\.comparability_key = 'tuition-fees\.in-state'/);
  assert.match(normalized, /jsonb_object_keys\(p_filters\)/);
});

test("staged releases publish only after exact counts, hash, and catalog checks", () => {
  assert.match(stagingNormalized, /create table public\.college_catalog_release_records/);
  assert.match(stagingNormalized, /primary key \(release_id, unit_id\)/);
  assert.match(stagingNormalized, /unique \(release_id, slug\)/);
  assert.match(stagingNormalized, /college_catalog_release_records_read_current/);
  assert.match(stagingNormalized, /release\.is_current and release\.published_at is not null/);
  assert.match(stagingNormalized, /create function public\.publish_college_knowledge_release\(/);
  assert.match(stagingNormalized, /language plpgsql security invoker/);
  assert.match(stagingNormalized, /p_release_id <> \('sha256:' \|\| p_dataset_sha256\)/);
  assert.match(stagingNormalized, /pg_advisory_xact_lock\(pg_catalog\.hashtext\('college-search-knowledge-seed'\)\)/);
  for (const table of ["college_catalog_release_records", "college_sources", "college_source_bindings", "college_facts", "college_passages"]) {
    assert.match(stagingNormalized, new RegExp(`from public\\.${table}[\\s\\S]{0,120}where (?:[a-z_]+\\.)?release_id = p_release_id`));
  }
  assert.match(stagingNormalized, /record_json ->> 'unitid' is distinct from entry\.unit_id::text/);
  assert.match(stagingNormalized, /record_json ->> 'slug' is distinct from entry\.slug/);
  assert.match(stagingNormalized, /catalog snapshot omits a stable catalog identity/);
  assert.match(stagingNormalized, /update public\.college_catalog as catalog set[\s\S]*?release_id = p_release_id/);
  assert.match(stagingNormalized, /update public\.college_knowledge_releases[\s\S]*?set is_current = false[\s\S]*?set is_current = true/);
  assert.match(stagingNormalized, /revoke all on function public\.publish_college_knowledge_release[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(stagingNormalized, /grant execute on function public\.publish_college_knowledge_release[\s\S]*?to service_role/);
  assert.doesNotMatch(stagingNormalized, /security definer/);
});

test("seeder retries preserve immutable facts and existing passage embeddings", () => {
  assert.match(seeder, /function immutableConflictGuard/);
  assert.match(seeder, /insert\("college_passages", passageColumns, seed\.passages, "\(passage_id\) do nothing"\)/);
  assert.doesNotMatch(seeder, /delete from public\.college_passages/);
  assert.match(seeder, /--hosted-project/);
  assert.match(seeder, /resolution=ignore-duplicates,return=minimal/);
  assert.match(seeder, /assertRowsEqual\(table, expectedRows, actualRows, columns, keys\)/);
  assert.match(seeder, /rpc\/publish_college_knowledge_release/);
});
