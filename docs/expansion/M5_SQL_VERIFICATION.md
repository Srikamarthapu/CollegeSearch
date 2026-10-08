# Complete embedding publication rehearsal

Verified October 4, 2026. This closes the missing full-corpus publication path; it does not establish model quality or enable public AI.

`scripts/publish-college-embeddings.mjs` validates a complete checksummed artifact against the current reviewed dataset bytes and release marker. It exports one SQL transaction, without calling a provider or connecting to a database. A 24-passage evaluation sample or incomplete checkpoint cannot be used as a full release.

The transaction acquires the existing knowledge-release advisory lock and write locks that still permit readers. It stages every vector, compares the complete stored passage text and provenance to the reviewed artifact, verifies the exact current published release and full passage count, then updates all vectors and release model/version together. A failure rolls back both. Retrying an identical artifact is harmless. Replacing a different index requires explicitly naming its expected current model and version; a stale expectation fails. Public client roles cannot publish. Existing source metadata, facts, catalog identities, accounts and saves are not rewritten.

The target database name is checked inside SQL. Database names such as `postgres` are shared by many projects, so this is not proof of project identity: an operator must verify the target connection before executing the file. No hosted publication is attempted while NVIDIA production-use permission and evaluation remain unresolved.

## Actual SQL results

The opt-in integration script creates a new disposable `collegesearch_embeddings_verify` database from the isolated `collegesearch_m2_verify` baseline, uses synthetic nonzero 2,048-dimensional vectors for all 1,252 canonical passages, and removes only that disposable clone afterward.

```sh
node scripts/check-embedding-publication.mjs \
  --docker-container collegesearch-goal-db-20261004
```

All twelve checks passed:

1. Anonymous publication denied.
2. Incorrect target database denied.
3. Unpublished/current-release mismatch denied.
4. Changed passage content denied, even when its stored hash was not updated.
5. All 1,252 vectors and release metadata published together.
6. Identical artifact retry succeeded.
7. Changed vectors could not reuse an existing model/version label, even with explicit replacement options.
8. Replacement without an expected existing model/version denied.
9. Injected failure after all updates but before commit restored the previous vectors and release metadata.
10. Explicit full replacement succeeded.
11. All three pre-existing synthetic saved-college rows were preserved.
12. The public hybrid retrieval RPC returned results with the matching new model/version and expected data release.

Result: `work/m5-embedding-sql.log`. Zero NVIDIA requests and zero hosted writes. These synthetic vectors prove database behavior, not semantic relevance. The baseline verifier remains unembedded; no synthetic vectors were published to the demo.

The runtime provider and retrieval adapter also now reject vectors that overflow PostgreSQL float32 storage or become entirely zero after conversion, with explicit keyword fallback. Fifteen focused provider/retrieval tests passed; `work/m5-vector-guards.log`. Storage semantics were checked against [pgvector's vector reference](https://github.com/pgvector/pgvector#vector-type).

## Export after a real, reviewed full run

```sh
node scripts/publish-college-embeddings.mjs \
  --artifact work/COMPLETE-INDEX.json --database postgres
node scripts/publish-college-embeddings.mjs \
  --artifact work/COMPLETE-INDEX.json --database postgres \
  --write-sql work/publish-complete-index.sql
node scripts/publish-college-embeddings.mjs \
  --artifact work/COMPLETE-INDEX.json --database postgres \
  --verify-sql work/publish-complete-index.sql
```

The first command is validation only; the second writes a new file and refuses to overwrite an existing path. The third compares its exact bytes with a fresh canonical export to catch edits or drift before execution. Structured output records both artifact and SQL SHA-256 digests. Use an already configured, verified database connection to apply the verified entire file with `psql -X -v ON_ERROR_STOP=1 -f work/publish-complete-index.sql`. Do not split the transaction into independent SQL-tool calls. Credentials must remain outside the generated file and Git.

Real generation, semantic retrieval evaluation, human model review, measured usage limits and authorized production access remain required before AI activation. The existing 2,048-dimensional exact vector scan is retained for this small corpus; no approximate index or loss of precision was introduced.

Integrated verification after the pipeline changes: 405 tests passed, no failures/skips; normal lint, typecheck and the native Next production build passed. The build generated all 131 pages and emitted only the already documented external-lockfile warning. Logs are `work/m5-full-tests.log`, `work/m5-lint.log`, `work/m5-typecheck.log`, and `work/m5-next-build.log`. SQL export/verification CLI tests also passed, including refusal to overwrite a file and rejection after a same-size SQL edit.
