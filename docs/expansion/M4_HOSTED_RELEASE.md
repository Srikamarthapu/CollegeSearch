# Hosted release verification — October 4, 2026

## Database

Applied the additive M2 knowledge, M2 release staging, and M3 private adviser migrations to the existing CollegeSearch project `ptdbmseeooboqbpyvcgw`. No database reset, account replacement, or saved-row deletion was used. Account/save counts were 0/0 before and after this rollout.

Published the reviewed release at `2026-10-04 10:45:44.888478 UTC`:

- Release: `sha256:20a224a56e54e8fda0f37b791bab45db4ac890c38f7ce57afe98c9a5d4838da4`.
- 100 catalog records, 29 sources, 144 source bindings, 4,464 facts, 1,252 passages.
- One current published release; zero real embeddings and zero adviser conversations.
- All 96 immutable, bounded SQL staging batches applied. A temporary Supabase MCP rate limit interrupted at batch 41; import resumed after its 60-second retry window, with slower pacing. No partial release was made public. The final service-only publish function checked completeness and switched publication atomically.
- Sensitive Vercel variables are redacted on pull; the REST seeder rejected that placeholder without writing. Used the reviewed credential-free SQL export through the authorized Supabase connector instead. No secret was printed or committed.

The actual application retrieval adapter passed six read-only scenarios against hosted Supabase using its public API key: California engineering, Texas resident net-price bounds, small campuses, Northeast private tuition, a specific two-college comparison, and unknown descriptive material. Every returned record/fact/passage was checked against the reviewed artifact. This verifies structured and keyword retrieval; it does not establish semantic vector relevance.

Security advisor: zero warning/error findings. Two informational `rls_enabled_no_policy` notices describe `public.adviser_requests` and `private.adviser_global_usage`; both intentionally deny ordinary client access and are service-only. Local ownership, revoked-session, quota, idempotency, deletion/cascade and concurrency tests are in the M2/M3 SQL reports.

## App deployment

Deployed commit `db94a38` to the existing production demo at https://collegesearch-steel.vercel.app. Vercel deployment `dpl_GqJZyomPsnqpviChTi78dHy25Ahx` is READY; the alias and deployment inspection agree. The hosted native Next.js build passed. The previous production deployment is retained for rollback.

Live HTTP checks passed: `/explore`, `/adviser`, `/my-colleges`, and the campus-pin favicon returned 200; adviser and retention APIs rejected unauthenticated requests with 401. An authorized retention request returned 200 with zero conversations deleted. `CRON_SECRET` is a sensitive production-only variable and cleanup is scheduled at 04:17 UTC. This verifies a manual invocation; it does not claim that the scheduled job has already fired.

The deployed explorer shows 100 colleges. Desktop and 390px adviser checks confirmed the honest In preparation state, bounded gutters, compact history sign-in, and no horizontal overflow. Captures are in `outputs/m4-audit/14-live-explore-desktop.jpg`, `15-live-adviser-desktop.jpg`, `16-live-adviser-390.jpg`, and `17-live-catalog-final.jpg`. The browser reported no warning/error logs. A deployment-scoped Vercel error-log query for the preceding 15 minutes returned no entries; this is a point-in-time check, not continuous monitoring.

AI availability remains disabled: no NVIDIA key, production authorization, completed evaluation, or measured allowances are configured. Source changes are committed locally; this rollout was made through Vercel CLI and does not imply a Git push or merge.

## Owner setup

The local key placeholder is `/Users/kamarthapusri/Projects/CollegeSearch/.env.local`, ignored by Git and restricted to mode 600. Add the key after `NVIDIA_API_KEY=`; do not paste it into chat or commit it.

Internal evaluation can later load this file explicitly:

```sh
NVIDIA_MODE=evaluation node --env-file=.env.local scripts/evaluate-nvidia-adviser.mjs --evaluate
NVIDIA_MODE=evaluation node --env-file=.env.local scripts/embed-college-knowledge.mjs --evaluate
```

These scripts use synthetic student questions and public college evidence. The embedding command evaluates a 24-passage sample only. Model selection, real quality/latency/token measurements, affordable free limits, full-index publication, and applicable NVIDIA hosted production permission still need completion before public AI activation. Stripe remains deferred. Hosted email delivery/account recovery and live signed-in user journeys also need release testing before a public launch.

## Review cleanup

Stopped the two task-owned local preview servers on ports 4183/4184 and the isolated `collegesearch-goal-db-20261004` container after verification. The database container and its rehearsal data remain available to restart. Other local previews and services were left alone. The live catalog tab is retained for review.
