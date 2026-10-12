# Vercel working demo — September 30, 2026

Live public demo: https://collegesearch-steel.vercel.app

Added a native Next.js Vercel build command and configuration, with deployment ignores for secrets, local work, audit artifacts and macOS metadata. Native Next compiled successfully, completed type checking and generated 80 pages. Vercel production deployment is ready. Public home, explorer, comparison, saved list and planner returned 200. Actual browser search, guest save/reload, comparison and cleanup passed with no captured warnings/errors; the final home screenshot is in outputs/vercel-demo/live-demo.png.

The privileged Supabase environment variable is server-only and marked sensitive on Vercel; it was absent from all 97 client build files. The public origin is reachable without Vercel login. Vercel's protected deployment-specific URL is distinct from the public production alias.

The existing free CollegeSearch database had paused after inactivity; restart was requested. Its new production site URL and four callback entries were applied and verified without removing earlier redirects or changing undeclared auth security settings. Database restoration status and final endpoint results are recorded alongside this file. Real signup/recovery email delivery still needs SMTP validation. This working demo does not close the full school-launch acceptance ledger.
