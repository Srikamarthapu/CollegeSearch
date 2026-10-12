import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationNames = (await readdir(migrationsDir)).filter((name) => name.endsWith("_college_passages_candidate_lookup.sql"));
assert.equal(migrationNames.length, 1, "expected one targeted passage lookup migration");
const migration = await readFile(path.join(migrationsDir, migrationNames[0]), "utf8");
const normalized = migration.replace(/--.*$/gm, " ").replace(/\s+/g, " ").toLowerCase();

test("candidate passage lookup has a release and campus index without changing access policy", () => {
  assert.match(normalized, /create index college_passages_release_unit_idx\s+on public\.college_passages \(release_id, unit_id\)/);
  assert.doesNotMatch(normalized, /\b(?:alter table|create policy|enable row level security)\b/);
});
