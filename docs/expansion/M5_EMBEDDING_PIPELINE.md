# Full college knowledge embedding pipeline

The 24-passage evaluation utility remains bounded and separate. Full indexing uses `scripts/index-college-knowledge.mjs`, which binds each vector to the raw-source release, the canonical compiled passages, the configured embedding model, and an operator-supplied model-version label. The script derives the expected count from the canonical seed; the current reviewed corpus contains 9,070 passages. The canonical data release contains 173,029 exact structured facts separately from these grouped descriptive passages.

The default command is read-only and makes no provider or database calls:

```sh
node scripts/index-college-knowledge.mjs --max-calls 32
```

To start a new local evaluation run, first set `NVIDIA_MODE=evaluation`, `NVIDIA_API_KEY`, and a specific `NVIDIA_EMBEDDING_MODEL_VERSION` in the ignored local environment file. Then opt in explicitly:

```sh
node scripts/index-college-knowledge.mjs --evaluate --max-calls 32
```

The key is read only by the opted-in local command and is never written to the checkpoint, completed artifact, terminal report, or generated SQL. Each request contains at most 32 passages (`input_type: "passage"`); each run makes at most the requested number of HTTP calls (1–64, 32 by default), with retries disabled so the ceiling counts actual requests. A partial run can be resumed with the same release, model, and version label. It atomically checkpoints complete batches at intervals of at most 512 passages, at the run limit, and on provider failure. An abrupt stop can require redoing at most 511 passages since the last checkpoint.

The version label must be explicit before full indexing. It is an operator-reviewed snapshot label used to prevent accidentally combining work across configured versions; it does not prove that NVIDIA's hosted model alias maps to an immutable upstream NIM revision. Record the configured model, label, and artifact timestamps when reviewing a run. If the upstream alias may have changed, choose a new label and build a separate index rather than resuming an older checkpoint.

The partial checkpoint is `status: "partial"` and includes the complete release/model/version/content binding, per-passage source identity and content hash, float32 vectors, counts, and an integrity digest. The separate completed artifact is written only when every canonical passage has exactly one valid vector. It uses `status: "complete"`, lists all canonical passage IDs in sorted order, stores exactly 2,048 finite float32 values per passage, rejects zero vectors, and includes the artifact SHA-256. Hashing and artifact writing stream the JSON content to avoid constructing one giant checksum or output string. The local JSON artifact cap is 512 MiB; the 24-passage evaluation sample cannot be promoted or mistaken for this full artifact.

This is a generation and validation pipeline only. The completed 9,070-passage artifact was generated and revalidated locally in 284 requests with no failures or database writes. A single three-query embedding batch then exercised local hybrid search against a disposable clone; that clone was dropped and the baseline local database stayed unchanged. No hosted embeddings were written and public retrieval remains disabled. Vector validity, full corpus coverage, and a checksum do not establish model quality, provider cost, or production permission. The official API reference accepts a list of strings but publishes no array-count maximum. A bounded 32-input synthetic public-college probe succeeded with 32 ordered 2,048-dimensional vectors, an 825,311-byte response, 1,001 prompt/total tokens, and 1,387 ms latency; this supports the local request cap of 32, but does not guarantee larger batches. Full measured and local SQL evidence is in [M7_NVIDIA_EVALUATION.md](M7_NVIDIA_EVALUATION.md); publisher safety rehearsals are in [M5_SQL_VERIFICATION.md](M5_SQL_VERIFICATION.md).
