# Full college knowledge embedding pipeline

The 24-passage evaluation utility remains bounded and separate. Full indexing uses `scripts/index-college-knowledge.mjs`, which binds each vector to the raw-source release, the canonical compiled passages, the configured embedding model, and an operator-supplied model-version label. The script derives the expected count from the canonical seed; the current reviewed corpus contains 1,252 passages.

The default command is read-only and makes no provider or database calls:

```sh
node scripts/index-college-knowledge.mjs --max-calls 32
```

To evaluate the hosted embedding endpoint later, first set `NVIDIA_MODE=evaluation`, `NVIDIA_API_KEY`, and a specific `NVIDIA_EMBEDDING_MODEL_VERSION` in the ignored local environment file. Then opt in explicitly:

```sh
node scripts/index-college-knowledge.mjs --evaluate --max-calls 32
```

The key is read only by the opted-in local command and is never written to the checkpoint, completed artifact, terminal report, or generated SQL. Each run processes passages sequentially, makes at most the requested number of embedding calls (1–64, 32 by default), and does not retry failed provider calls. A partial run can be resumed with the same release, model, and version label. It atomically checkpoints every 32 successful embeddings and on failure or run completion; an abrupt stop between checkpoints can require redoing up to 31 calls.

The version label must be explicit before full indexing. It is an operator-reviewed snapshot label used to prevent accidentally combining work across configured versions; it does not prove that NVIDIA's hosted model alias maps to an immutable upstream NIM revision. Record the configured model, label, and artifact timestamps when reviewing a run. If the upstream alias may have changed, choose a new label and build a separate index rather than resuming an older checkpoint.

The partial checkpoint is `status: "partial"` and includes the complete release/model/version/content binding, per-passage source identity and content hash, float32 vectors, counts, and an integrity digest. The separate completed artifact is written only when every canonical passage has exactly one valid vector. It uses `status: "complete"`, lists all canonical passage IDs in sorted order, stores exactly 2,048 finite float32 values per passage, rejects zero vectors, and includes the artifact SHA-256. Completeness and integrity are validated before the artifact is returned for a separate SQL export. The 24-passage evaluation sample cannot be promoted or mistaken for this full artifact.

This is a generation and validation pipeline only. It does not make database requests, stage rows, or enable public retrieval. Vector validity, full corpus coverage, and an artifact checksum do not establish model quality, provider cost, or production permission. No hosted embedding call has been made yet; the current key is intentionally blank, so call counts, latency, token usage, and quality remain unmeasured. The atomic publisher and completed SQL rehearsal are documented in [M5_SQL_VERIFICATION.md](M5_SQL_VERIFICATION.md).
