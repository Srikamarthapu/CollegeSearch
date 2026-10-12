# Scaling foundation

This change targets the first page load, repeat catalog reads, adviser work that outlives a browser request, and the passage lookup used by adviser retrieval. It does not claim unlimited capacity or enable the public AI provider.

## Startup and caching

Home/explore now load a build-generated client projection instead of parsing and validating the full source catalog and tuition archives on each cold module initialization. Layout metadata and account collection identifiers use a small generated summary; admissions uses its own projection. Build hooks regenerate these artifacts, and parity tests compare every projected institution against the source records. Source URLs, tuition definitions, reporting periods, and the catalog release remain intact.

The directory projection is 14,054,645 bytes, versus 106,351,018 bytes for the raw catalog plus tuition archives. The summary is 29,682 bytes and admissions is 2,460,278 bytes. An isolated Node 22 module-load diagnostic measured 4.75 seconds / about 210 MB additional heap for the original full catalog versus 0.55 seconds / about 55 MB for the directory. These are module diagnostics, not deployed page-load measurements.

A process-local LRU has a 30-second TTL, at most 32 entries, a 6 MiB serialized-payload budget, and a 512 KiB per-entry cap. Its key includes the source-derived cache version, normalized filters, sorting, and pagination. Saved-list results bypass it; selected comparison records are assembled separately from the cached public page.

CDN caching is limited to credential-free GET requests for:

- `/api/colleges` without parameters: 60-second shared TTL and 300-second stale revalidation window.
- `/api/colleges/admissions` without parameters: the route's bounded public TTL.
- `/api/colleges/identities?release=<current-cache-version>`: one-hour shared TTL and one-day stale revalidation window. The version includes hashes of the catalog, tuition, cost overrides, and action sources.

Search terms, filters, comparison identifiers, saved records, POST lookups, cookie-bearing requests, and authorization-bearing requests remain private/no-store. HTML also remains private/no-store because each document has a unique CSP nonce. Public JSON takes a separate restrictive CSP path without creating an auth-refresh session. The browser uses the shared endpoint only for the exact unfiltered first page and the public versioned identity list.

The logo is now a 31,546-byte WebP instead of a 398,623-byte PNG. Campus carousel images use responsive sizes and Next's negotiated AVIF/WebP delivery, with only the active image given high fetch priority. Photos, attribution, timing, and motion preferences are preserved.

## Database and jobs

The passage lookup now has `(release_id, unit_id)` indexed. Hosted query-plan inspection confirms the candidate lookup uses `college_passages_release_unit_idx`; the joined catalog/source lookups use their existing indexes. Existing fact, owner, and saved-college indexes already match their queries and were not duplicated. Retrieval remains bounded to 100 candidates and batches fact evidence in groups of 20 because each response carries full evidence records; there is no per-college request loop.

Adviser work is persisted before returning `202`, with owner-only status reads, idempotency, session checks, leases, bounded retries, and prompt erasure. A conditional Supabase cron dispatcher provides recovery beyond the opportunistic Next `after()` invocation. The dedicated worker secret is separate from the existing retention cron secret. See `M16_ADVISER_QUEUE.md` for operations and the deliberately conservative single-worker limit.

## Verification and limits

The baseline's sequential warm production document requests had TTFB between 249 and 802 ms. A browser navigation to the existing explorer completed quickly and showed usable controls without errors; the reported 15–20 second delay was not reproduced in those warm checks. Browser cache state, geography, network, and platform cold starts can change results, so these observations do not establish a global load-time guarantee.

Final integrated and deployment evidence will be recorded here after verification. Public AI remains gated; queue verification must distinguish transactional and mocked-provider tests from real hosted model execution. Before broad launch, exercise concurrent signed-in users, inspect p95/p99 latency and queue age, and size database/provider capacity from those results.
