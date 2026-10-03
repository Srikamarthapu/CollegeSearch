import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationsDirectory = path.join(process.cwd(), "supabase", "migrations");
const migrationNamePattern = /^\d{14}_create_saved_colleges\.sql$/;

async function readSavedCollegesMigration() {
  const migrationNames = (await readdir(migrationsDirectory)).filter((name) =>
    migrationNamePattern.test(name),
  );

  assert.deepEqual(
    migrationNames,
    ["20260810042855_create_saved_colleges.sql"],
    "saved_colleges must have one canonical CLI-generated migration",
  );

  return readFile(path.join(migrationsDirectory, migrationNames[0]), "utf8");
}

async function reviewedUnitIds() {
  const release = JSON.parse(
    await readFile(path.join(process.cwd(), "data", "colleges.json"), "utf8"),
  );
  return release.colleges.map((college) => college.unitId).sort((a, b) => a - b);
}

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function policyBlock(sql, policyName) {
  const match = sql.match(
    new RegExp(`create policy ${policyName}\\b[\\s\\S]*?;`, "i"),
  );
  assert.ok(match, `missing ${policyName} policy`);
  return normalizeSql(match[0]);
}

test("saved_colleges has a constrained user-owned identity", async () => {
  const sql = normalizeSql(await readSavedCollegesMigration());

  assert.match(sql, /create table public\.saved_colleges \(/);
  assert.match(
    sql,
    /user_id uuid not null references auth\.users \(id\) on delete cascade/,
  );
  assert.match(sql, /unit_id bigint not null/);
  assert.match(sql, /constraint saved_colleges_unit_id_catalog check/);
  assert.match(sql, /created_at timestamptz not null default now\(\)/);
  assert.match(sql, /primary key \(user_id, unit_id\)/);

  const source = await readSavedCollegesMigration();
  const catalog = source.match(
    /saved_colleges_unit_id_catalog check \([\s\S]*?array\[([\s\S]*?)\]::bigint\[\]/i,
  );
  assert.ok(catalog, "migration must embed the reviewed UNITID catalog");
  const constrainedIds = catalog[1]
    .split(",")
    .map((value) => Number(value.trim()))
    .sort((a, b) => a - b);
  assert.deepEqual(
    constrainedIds,
    await reviewedUnitIds(),
    "database UNITID constraint must match the committed reviewed cohort",
  );
});

test("saved_colleges exposes only the required authenticated operations", async () => {
  const sql = normalizeSql(await readSavedCollegesMigration());

  assert.match(
    sql,
    /revoke all privileges on table public\.saved_colleges from anon/,
  );
  assert.match(
    sql,
    /revoke all privileges on table public\.saved_colleges from authenticated/,
  );
  assert.match(
    sql,
    /grant select, insert, delete on table public\.saved_colleges to authenticated/,
  );
  assert.doesNotMatch(sql, /grant [^;]*\bupdate\b/);
  assert.doesNotMatch(sql, /\bservice_role\b/);
});

test("saved_colleges RLS has separate owner-only policies", async () => {
  const source = await readSavedCollegesMigration();
  const sql = normalizeSql(source);
  const ownershipPredicate = /\(select auth\.uid\(\)\) = user_id/;
  const permanentAccountPredicate =
    /coalesce\(\(\(select auth\.jwt\(\)\) ->> 'is_anonymous'\)::boolean, false\) = false/;

  assert.match(
    sql,
    /alter table public\.saved_colleges enable row level security/,
  );

  const selectPolicy = policyBlock(source, "saved_colleges_select_own");
  assert.match(selectPolicy, /for select to authenticated/);
  assert.match(selectPolicy, ownershipPredicate);
  assert.match(selectPolicy, permanentAccountPredicate);

  const insertPolicy = policyBlock(source, "saved_colleges_insert_own");
  assert.match(insertPolicy, /for insert to authenticated/);
  assert.match(insertPolicy, /with check/);
  assert.match(insertPolicy, ownershipPredicate);
  assert.match(insertPolicy, permanentAccountPredicate);

  const deletePolicy = policyBlock(source, "saved_colleges_delete_own");
  assert.match(deletePolicy, /for delete to authenticated/);
  assert.match(deletePolicy, /using/);
  assert.match(deletePolicy, ownershipPredicate);
  assert.match(deletePolicy, permanentAccountPredicate);

  assert.equal(
    [...sql.matchAll(/create policy /g)].length,
    3,
    "the table must use exactly one policy per supported operation",
  );
});

test("saved_colleges migration stays free of privileged database code", async () => {
  const sql = normalizeSql(await readSavedCollegesMigration());

  assert.doesNotMatch(sql, /security definer/);
  assert.doesNotMatch(sql, /create (?:or replace )?function/);
  assert.doesNotMatch(sql, /create trigger/);
  assert.doesNotMatch(sql, /create (?:or replace )?view/);
});

test("local Supabase config disables anonymous Auth users", async () => {
  const config = await readFile(
    path.join(process.cwd(), "supabase", "config.toml"),
    "utf8",
  );

  assert.match(config, /^\[auth\][\s\S]*?^enable_anonymous_sign_ins = false$/m);
  assert.match(config, /^\[db\.seed\][\s\S]*?^enabled = false$/m);
  assert.match(config, /^minimum_password_length = 8$/m);
  assert.match(config, /^\[auth\.email\][\s\S]*?^enable_confirmations = true$/m);
  for (const redirect of [
    "http://127.0.0.1:3000/auth/callback",
    "http://127.0.0.1:3000/auth/recovery-callback",
    "http://127.0.0.1:4173/auth/callback",
    "http://127.0.0.1:4173/auth/recovery-callback",
    "http://localhost:3000/auth/callback",
    "http://localhost:3000/auth/recovery-callback",
    "http://localhost:4173/auth/callback",
    "http://localhost:4173/auth/recovery-callback",
  ]) {
    assert.ok(config.includes(`"${redirect}"`));
    assert.ok(
      config.includes(`'${redirect}\\?sb_flow_id=*'`),
      `missing PKCE flow redirect for ${redirect}`,
    );
  }
  assert.match(config, /^\[local_smtp\]$/m);
  assert.doesNotMatch(config, /^\[inbucket\]$/m);
});
