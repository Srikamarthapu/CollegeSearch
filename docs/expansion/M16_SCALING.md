# Scaling foundation

This change targets the first page load, repeat catalog reads, adviser work that outlives a browser request, and the passage lookup used by adviser retrieval. It does not claim unlimited capacity or enable the public AI provider.

## Startup and caching

Home/explore now load a build-generated client projection instead of parsing and validating the full source catalog and tuition archives on each cold module initialization. Layout metadata and account collection identifiers use a small generated summary; admissions uses its own projection. Build hooks regenerate these artifacts, and parity tests compare every projected institution against the source records. Source URLs, tuition definitions, reporting periods, and the catalog release remain intact.

The directory projection is 14,054,645 bytes, versus 106,351,018 bytes for the raw catalog plus tuition archives. The summary is 29,682 bytes and admissions is 2,460,278 bytes. An isolated Node 22 module-load diagnostic measured 4.75 seconds / about 210 MB additional heap for the original full catalog versus 0.55 seconds / about 55 MB for the directory. These are module diagnostics, not deployed page-load measurements.

Profiles read one generated record; Compare reads at most four. A small allowlist manifest maps slugs and UNITIDs to 3,912 complete, source-preserving record files outside the public directory. Each file is checked against the release and combined source-cache version; reads share in-flight work and use a 16-record / 2 MiB LRU. Build/dev/type-check hooks generate these files, full-catalog parity checks verify their contents, and explicit Next output tracing packages them for both routes. Find My Fit uses a separate 9,035,408-byte projection of the same 2,486 eligible colleges and preserves the existing scores and evidence.

Data Health, Data Sources, and Methodology now use a 54,223-byte generated trust summary. Coverage counts, partial-record names, tuition and budget sources, and logo source names are derived from the original validated inputs. The actual artifact-verification snapshot and per-request freshness calculation remain unchanged. Broad-field pages use a 4,813,096-byte artifact for 38 fields, with repeated provenance strings stored in dictionaries and decoded into the same displayed records. All field values, availability flags, reporting periods, source links, ordering, and missing-college examples are checked against the original computation.

A process-local LRU has a 30-second TTL, at most 32 entries, a 6 MiB serialized-payload budget, and a 512 KiB per-entry cap. Its key includes the source-derived cache version, normalized filters, sorting, and pagination. Saved-list results bypass it; selected comparison records are assembled separately from the cached public page.

CDN caching is limited to credential-free GET requests for:

- `/api/colleges` without parameters: 60-second shared TTL and 300-second stale revalidation window.
- `/api/colleges/admissions` without parameters: five-minute shared TTL and 30-minute stale revalidation window.
- `/api/colleges/identities?release=<current-cache-version>`: one-hour shared TTL and one-day stale revalidation window. The version includes hashes of the catalog, tuition, cost overrides, and action sources.

Search terms, filters, comparison identifiers, saved records, POST lookups, cookie-bearing requests, and authorization-bearing requests remain private/no-store. HTML also remains private/no-store because each document has a unique CSP nonce. Public JSON takes a separate restrictive CSP path without creating an auth-refresh session. The browser uses the shared endpoint only for the exact unfiltered first page and the public versioned identity list.

Credentialed requests and HEAD requests to canonical public URLs internally rewrite to a distinct private query variant before cache selection. This prevents an already-warm public CDN entry from overriding the origin's private response policy. The private variant returns the same public data, skips unnecessary auth refresh, and never gains shared-cache eligibility.

The logo is now a 31,546-byte WebP instead of a 398,623-byte PNG. Campus carousel images use responsive sizes and Next's negotiated AVIF/WebP delivery, with only the active image given high fetch priority. Photos, attribution, timing, and motion preferences are preserved.

## Database and jobs

The passage lookup now has `(release_id, unit_id)` indexed. Hosted query-plan inspection confirms the candidate lookup uses `college_passages_release_unit_idx`; the joined catalog/source lookups use their existing indexes. Existing fact, owner, and saved-college indexes already match their queries and were not duplicated. Retrieval remains bounded to 100 candidates and batches fact evidence in groups of 20 because each response carries full evidence records; there is no per-college request loop.

The database advisor's eight informational foreign-key findings were reviewed against actual queries. Conversation cleanup uses the existing conversation index, messages use their conversation-leading index, and expiry cleanup is indexed. Facts and passages use their release/campus indexes before filtering source IDs. Unit-only catalog restriction checks are not application deletion paths: catalog identities and source releases are immutable. Adding every suggested index would duplicate useful prefixes or optimize operations the app does not perform.

Adviser work is persisted before returning `202`, with owner-only status reads, idempotency, session checks, leases, bounded retries, and prompt erasure. A conditional Supabase cron dispatcher provides recovery beyond the opportunistic Next `after()` invocation. The dedicated worker secret is separate from the existing retention cron secret. See `M16_ADVISER_QUEUE.md` for operations and the deliberately conservative single-worker limit.

The browser pauses polling while hidden, keeps a single request in flight, and fences responses by account, request, and revision. A rejected session stops polling and clears that user's private UI state without signing another account out. Temporary session-verification failures pause for an explicit retry while retaining the current draft. Missing jobs reconcile against history before restoring a draft; transient network/server failures retain backoff. A history refresh cannot remove a newly queued job before its completion is read or overwrite a newer/deleted request.

## Verification and limits

The baseline's sequential warm production document requests had TTFB between 249 and 802 ms. A browser navigation to the existing explorer completed quickly and showed usable controls without errors; the reported 15–20 second delay was not reproduced in those warm checks. Browser cache state, geography, network, and platform cold starts can change results, so these observations do not establish a global load-time guarantee.

The first integrated run passed 543 tests, TypeScript, ESLint, Vinext build, and native Next production build. Desktop/mobile checks covered search, the deadline planner, overflow, and image loading. Hosted migration grants deny enqueue/claim to browser roles; the worker and one-minute scheduler were verified live. The authenticated Vault-to-worker probe returned the expected disabled-provider state and updated the database dispatch pause. No live model request was made.

Live verification caught issues that local checks did not establish: a Cookie request could reuse the public URL's CDN entry, and a 30-student anonymous document burst timed out on Compare/profile routes that still initialized the full catalog. After the private-cache rewrite and selective record loading, deployment `dpl_HEaUp6skfqzovXAq8q6KVZWCeNN5` passed all 25 live cache/security/asset checks. The same bounded classroom workload (30 simulated visitors, 120 document requests) passed 120/120, with p50 174.5 ms, p95 379.8 ms, and maximum 1,522 ms. The earlier run failed six requests at the ten-second timeout. These are anonymous HTTP document timings from one test location, not browser interactivity measurements or a capacity guarantee.

The wider smoke probe then found `/data-health` still initializing the full archives and timing out. Final correction and repeat-probe evidence for the remaining trust/broad-field pages will be recorded here after verification.

Public AI remains gated. Before broad launch, exercise concurrent signed-in users and real queued model completions, inspect p95/p99 latency and queue age, and size database/provider capacity from those results. All record shards are packaged with dynamic profile/Compare functions; only requested records are parsed, but the packaged corpus still occupies about 78 MB. A much larger catalog may warrant external versioned artifact storage. Production dependency audit reports zero advisories; eight existing development-toolchain advisory entries remain (the transitive `braces` graph in ESLint/Vinext), and suggested breaking downgrades were not applied as part of performance work.
