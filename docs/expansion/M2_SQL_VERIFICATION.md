# M2 SQL verification

Verified October 4, 2026 in the locally owned Docker container `collegesearch-goal-db-20261004`. The container has no network and no published ports. `collegesearch_m2_verify` was restored from the untouched legacy `postgres` dump; the default database and hosted Supabase project were not modified.

Before applying M2, the clone received three synthetic legacy saves for two synthetic users and their active sessions. The current M2 migration and transactional seeder preserved all three rows. The published release contains 100 institutions, 29 source records, 144 institution/source bindings, 4,464 facts, and 1,252 passages. The current release hash was `sha256:20a224a56e54e8fda0f37b791bab45db4ac890c38f7ce57afe98c9a5d4838da4`; passages were unembedded in the production seed.

The manual fixtures are:

- `tests/fixtures/m2-seed-legacy-saved-colleges.sql` — synthetic Auth/session/save setup that runs before the migration.
- `tests/fixtures/m2-college-knowledge-regressions.sql` — focused price, residency, broad-field, source-binding, publication-read checks.
- `tests/fixtures/m2-verify-college-knowledge.sql` — independent grants, RLS, retrieval, vector, publication, and saved-list checks.
- `tests/fixtures/m2-verify-release-staging.sql` — rollback-only rehearsal of a second release, pre-publication hiding, invalid-publication rejection, atomic current-snapshot switch, stale-release rejection, and saved-row preservation.
- `tests/fixtures/m2-install-synthetic-embedding.sql`, `tests/fixtures/m2-verify-synthetic-embedding-preserved.sql`, and `tests/fixtures/m2-restore-synthetic-embedding.sql` — committed test-only vector, repeat seed, preservation assertion, and cleanup.

All SQL verification fixtures passed using `psql -X -v ON_ERROR_STOP=1` against the clone. The rollback-only checks left the final migration and seed intact while rolling back injected bad rows, temporary embeddings, changed publication state, and synthetic staging data. The separate re-seed check committed one synthetic 2,048D vector, reran the guarded seeder, confirmed the vector/model/version/content hash survived unchanged, then restored and verified the original unembedded release. The clone ends with one current release, 100 current snapshot rows, 1,252 unembedded passages, zero synthetic staged rows, and all three legacy saves. Logs are ignored under `work/m2-regressions.log`, `work/m2-verify.log`, `work/m2-release-staging-verify.log`, `work/m2-embedding-install.log`, `work/m2-embedding-reseed.log`, `work/m2-embedding-verify.log`, and `work/m2-embedding-restore.log`; migration and first seed logs are `work/m2-staging-migration.log` and `work/m2-staging-seed.log`.

The checks confirmed that the six knowledge tables enable RLS and grant clients published reads only; writes are denied to `anon` and `authenticated`, while `service_role` has the expected write grants. All three RPCs are `SECURITY INVOKER`, accessible to `anon`/`authenticated`, and do not grant execution to `PUBLIC`. When a release is temporarily marked unpublished inside the rollback-only fixture, catalog, fact, passage, release, filter, and search reads no longer expose it.

The data-integrity checks found every fact and passage bound to the same release, UNITID, and registered source. Every fact evidence URL and passage URL also appears in that source's registered URLs or source-hash metadata. A deliberate cross-institution source update failed its foreign-key check. Exact numeric filters returned the expected equality match; the separate regression fixture passed private `TUITIONFEE_OUT`, resident/out-of-state net-price, and broad CIP filtering checks.

The lexical search returned the requested Bakersfield institution with source publisher, URL, and field provenance. Inside a rolled-back transaction, two synthetic 2,048-dimension vectors produced the expected cosine-distance order. Short query vectors, mismatched model/version, malformed stored dimensions, partial embedding metadata, and embedding/content-hash mismatches were rejected. These synthetic vectors verify SQL arithmetic and constraints only; they are not evidence of NVIDIA embedding quality or relevance.

The original saved rows remained attached to their owners. An active owner could add new reviewed UNITID `110486`; another user could not read, insert, or delete that user's row; anonymous and missing-session access failed; unknown UNITID `999999` failed the catalog foreign key. The saved-college foreign key is `ON DELETE RESTRICT`, and the legacy active-session function/policies were not changed by M2.

The final `20261004101430_m2_knowledge_release_staging.sql` migration adds a versioned catalog snapshot and a service-role-only, `SECURITY INVOKER` publish RPC guarded by a transaction advisory lock. The seeder staged and read back the 100 identity rows, 29 sources, 144 bindings, 4,464 facts, and 1,252 passages, then published the matching release hash and counts. The additional fixture proved staged rows stay invisible while an older release is current; anonymous publication is denied; count mismatches and record/identity inconsistencies do not switch releases; and a complete publish exposes the new full snapshot atomically. The current catalog reflected the staged change, RPCs rejected the old expected release ID, and the three saved rows remained valid. The fixture rolled its synthetic release back, leaving the seeded current release intact.

To repeat the database rehearsal, start from the saved baseline dump, create the pre-migration fixture, apply the checked-in migration, then seed the checked-in data through the guarded CLI:

```sh
docker exec -i collegesearch-goal-db-20261004 createdb -U supabase_admin --template=template0 collegesearch_m2_verify
docker exec -i collegesearch-goal-db-20261004 pg_restore -U supabase_admin -d collegesearch_m2_verify --no-owner --exit-on-error < work/m2-postgres-baseline.dump
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < tests/fixtures/m2-seed-legacy-saved-colleges.sql
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261004094151_m2_college_knowledge.sql
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261004101430_m2_knowledge_release_staging.sql
node scripts/seed-college-knowledge.mjs --docker-container collegesearch-goal-db-20261004 --database collegesearch_m2_verify
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < tests/fixtures/m2-college-knowledge-regressions.sql
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < tests/fixtures/m2-verify-college-knowledge.sql
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < tests/fixtures/m2-verify-release-staging.sql
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < tests/fixtures/m2-install-synthetic-embedding.sql
node scripts/seed-college-knowledge.mjs --docker-container collegesearch-goal-db-20261004 --database collegesearch_m2_verify
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < tests/fixtures/m2-verify-synthetic-embedding-preserved.sql
docker exec -i collegesearch-goal-db-20261004 psql -X -U supabase_admin -d collegesearch_m2_verify -v ON_ERROR_STOP=1 -f - < tests/fixtures/m2-restore-synthetic-embedding.sql
```

The rehearsal caught and blocked an earlier draft whose `filter_college_facts` used nonexistent `jsonb_object_length(jsonb)` and an early staging publish function with an ambiguous `release_id` reference. The implementation was corrected to count `jsonb_object_keys` and qualify staged table references. All final checks passed against the corrected migration sequence. These results establish local SQL behavior; they do not claim hosted catalog publication.

To create credential-free SQL batches for the already-reviewed hosted project, validate the release marker and export the ordered staging files:

```sh
node scripts/build-college-knowledge.mjs --check
node scripts/seed-college-knowledge.mjs \
  --hosted-project ptdbmseeooboqbpyvcgw \
  --write-hosted-sql-dir work/college-knowledge-hosted-ptdbmseeooboqbpyvcgw
```

The export writes `manifest.json`, `README.md`, and currently 96 SQL files under `work/college-knowledge-hosted-ptdbmseeooboqbpyvcgw/`. The manifest records the dataset release hash, target project ref, ordered filenames, byte lengths, and SHA-256 hashes. Each SQL file is below 100 KB, contains no schema changes or credentials, and can be retried safely; conflicting immutable rows stop the batch. Apply the files in lexical order through the Supabase SQL tool connected to the target project. The first file creates the unpublished release metadata, institution identities are inserted only when missing, and `060-verify-and-publish.sql` validates expected row counts/hash and switches the current release atomically. Confirm the connected project matches the ref printed at the top of every file. Generating these files makes no network request; the REST path is separately opt-in and requires server-side Supabase credentials.

The generated 96-file SQL sequence was also run in lexical order with `psql --single-transaction` against the clean, isolated `collegesearch_m2_verify` clone. It completed successfully as an identical-release retry: one current release, 100 current catalog rows and snapshot rows, 29 sources, 144 bindings, 4,464 facts, 1,252 passages, zero embeddings, and the same three saved rows across two synthetic users. This exercises the exported `DO` blocks and final publish SQL locally; it does not establish hosted publication or hosted-role execution.
