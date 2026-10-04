# M0 dependency remediation

Checked October 4, 2026 on Node v22.22.3 / npm 10.9.8. Only `package.json` and `package-lock.json` were changed. Existing React, Supabase, Vite, Vinext, and unrelated overrides remain pinned as before.

## Changes

- Updated `next` and `eslint-config-next` together from 16.3.5 to 16.3.8, staying on Next 16. The Next advisory's affected range ends below 16.3.6.
- Updated `@cloudflare/vite-plugin` from 1.54.8 to 1.62.5 and Wrangler from 4.131.1 to 4.147.0. The plugin's published peer range requires Wrangler `^4.147.0`; the updated chain resolves Miniflare 5.20261001.0-alpha and Undici 7.29.1.
- Added narrow npm overrides for `fast-uri` 3.1.8 and the two installed `brace-expansion` ranges: 1.1.21 for `minimatch@3.1.5`, and 5.0.12 for `minimatch@10.2.5`. Each override stays inside its parent's declared major range and is reflected in the lockfile.

## Audit disposition

The supplied baseline reports 15 advisories: 1 critical, 10 high, and 4 moderate. After the updates, `npm audit --json` reports 8 high, with 0 critical, 0 moderate, and 0 low. `npm audit --omit=dev --json` reports 0. The addressed Next, Cloudflare/Wrangler/Miniflare/Undici, `fast-uri`, and `brace-expansion` findings no longer appear.

The remaining eight npm audit entries share one root dependency advisory: `braces@3.0.3` has no published patched version according to the GitHub advisory as of this check. It is reached through these development-tool paths:

- `eslint-config-next@16.3.8` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch@4.0.8` → `braces@3.0.3`.
- `vinext@1.0.0-beta.9` → `vite-plugin-commonjs@0.10.4` → `vite-plugin-dynamic-import@1.6.0` → `fast-glob` → `micromatch@4.0.8` → `braces@3.0.3`.

`npm audit fix --force` proposes downgrading `eslint-config-next` to 14.2.35 and Vinext to 0.0.15. Both would cross the existing Next/Vinext major-version line and were rejected. The remaining packages are in the development toolchain; the production-only audit is clean. Keep this as an open dependency finding and revisit after `braces` publishes a patch or these upstream chains adopt one. No reachability claim beyond the dependency paths and npm's dev classification was made.

## Verification

- `npx tsc --noEmit` — passed (`m0-typecheck.log`).
- `npm run build:vercel` — passed (`m0-build-vercel.log`). Next.js emitted a repository-root warning because it found `/Users/kamarthapusri/package-lock.json` outside this Git checkout; the build still completed. This file is outside the assigned package-file scope and was left untouched.
- `npm run build` — passed (`m0-build-vinext.log`). Vinext reports that static analysis cannot classify some dynamic routes; it completes the build successfully.
- `node --test tests/*.test.mjs tests/*.test.ts` — 336 passed, 0 failed (`m0-tests.log`).
- `npm run lint` — passed (`m0-lint.log`).
- `git diff --check` — passed.
- `npm audit --json` — 8 high remaining (`m0-audit-after.json`); `npm audit --omit=dev --json` — 0 (`m0-audit-production.json`).

Install output is in `m0-npm-install.log`. The starting report remains `goal-initial-npm-audit.json`.

## Primary sources checked

- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js ImageResponse security advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)
- [`braces` advisory; no patched versions published](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [`brace-expansion` patched releases](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)
- [`fast-uri` patched releases](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)
- [Cloudflare Vite plugin 1.62.5 registry metadata](https://www.npmjs.com/package/@cloudflare/vite-plugin/v/1.62.5)
- [Wrangler 4.147.0 registry metadata](https://www.npmjs.com/package/wrangler/v/4.147.0)
