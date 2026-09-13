# CollegeSearch isolated restore rehearsal — passed

Executed September 13, 2026 using a fresh temporary Supabase project, PostgreSQL 17.6 and CLI 2.117.0. No hosted data, existing app database, retained CollegeSearch volume, SMTP service or website deployment was accessed or changed.

The real local Auth API created three confirmed synthetic users and three sessions. A custom-format archive of `auth`, `public`, `private` and migration history restored into a second empty database. It recovered all three users/sessions and four saved-college rows. The app's columns, constraints, grants, session-function ownership/security/search path, four RLS policies and both migration versions matched the source.

Six acceptance cases passed: owner A read/write plus cross-owner denial; owner B isolation; anonymous identity denial; anonymous role table/RPC denial; revoked-session read/write denial; and exact post-backup account-deletion reconciliation. The checkpoint deliberately restored a user deleted after backup. Its deletion receipt was then applied by exact UUID and its session/saved rows cascaded away, preserving the other accounts.

Cleanup passed. All four temporary containers and their temporary volumes/network were removed. Before and after inventories contained the same original 26 container identities, 15 volume names and 7 network identities. Temporary keys, logs that could contain keys and the synthetic Auth dump were removed; the archive hash and sanitized evidence remain.

Evidence: `report.json`, `cleanup.json`, `assertions.json`, the source/target schema manifests, `assert-restored.sql`, and `commands.md` in this directory.

This establishes local logical recovery mechanics for the application schemas and synthetic Auth/session data. The restored policies were exercised with PostgreSQL roles and JWT claims; no Auth HTTP service was connected to the restored target. It does not establish a hosted/off-site backup, retention or operational owner, complete provider metadata recovery, SMTP, external JWT signature checks, or school-scale restoration time.
