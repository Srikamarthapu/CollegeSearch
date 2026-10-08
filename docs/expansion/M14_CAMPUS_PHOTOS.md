# M14 campus-photo evidence and review

## Shipped scope

The profile runtime has **47 visual/source-reviewed campus photographs for 47 of 3,912 catalog colleges (1.20%)**. The remaining **3,865 profiles use the designed no-photo fallback**. This is intentionally incomplete: a generic campus image, name-search result, logo, generated image, or unreviewed candidate is never substituted.

The approved set contains the 15 previously reviewed institutions, with stronger profile-banner replacements for Caltech, Princeton, and the University of Washington, plus 32 newly reviewed institutions. The exact per-college identity, local asset hash and dimensions, Commons source, creator, license, alt text, crop, and review date are recorded in `data/profile-campus-photo-approved.json`.

October 7 additions and replacements are deterministic local web derivatives at no more than 500,000 bytes each. Each entry's crop notes record its local dimensions and JPEG encoding quality. The Commons source and download URLs remain attached so the local derivative can be traced to the licensed source.

## Identity and source method

`scripts/refresh-campus-photo-candidates.mjs` joins the catalog to Wikidata only through exact equality between the catalog UNITID and Wikidata property P1771, the Integrated Postsecondary Education Data System ID. It then reads P18 image candidates and retrieves dimensions, creator, license, source description, and source categories from the Wikimedia Commons API.

The October 7 snapshot contains 1,686 P18 rows covering 1,630 exact catalog UNITIDs. Of those, 1,209 UNITIDs passed the mechanical raster, resolution, landscape, subject-signal, and license filters. Passing that filter does not approve an image. Every candidate remains `pending-visual-review` and `usableInProduct: false` in `data/profile-campus-photo-candidates.json`.

Approval additionally required:

- pixels that clearly show the exact institution's campus or a campus building;
- Commons description or categories that identify the institution without branch conflict;
- a coherent 3.6:1 desktop crop and 16:9 mobile crop;
- complete creator and license evidence; and
- factual image-specific alt text and crop notes.

When an exact Wikidata entity had multiple P18 values, the reviewed Commons title is pinned explicitly in `scripts/promote-campus-photo-review.mjs`. The selected files were the Emory Administration Building, Syracuse aerial campus view, and Penn College Hall. The other P18 values were not silently promoted.

## Runtime boundary

`app/lib/profile-campus-photos.ts` combines the original reviewed set in `app/lib/campus-photos.ts` with the 32 additions in `data/profile-campus-photo-additions.json`. `getProfileCampusPhoto(unitId, slug)` requires both the numeric UNITID and catalog slug to match. The 3.3 MB candidate queue is never imported into runtime code and is excluded from the deployment artifact.

`scripts/promote-campus-photo-review.mjs` contains only the 32 explicit review decisions and produces the additions manifest and optimized local assets. `scripts/sync-campus-photo-approved-manifest.mjs` then hashes the local files and produces the review/audit manifest. Refreshing candidates alone cannot make an image product-usable.

## Review rejections and holds

The first focused batch reviewed 30 exact-ID candidates. Eighteen were promoted. Eleven were rejected for active construction, poor or dated image quality, weak campus context, distracting artifacts, or an incoherent wide crop. The University of Missouri image passed visual review but was held because the source lacked sufficient machine-readable creator evidence.

The second focused batch reviewed 18 candidates for familiar institutions. Four were rejected: American University's text-dominant entrance wall, Maryland's backlit sundial view, Boston University's signage-heavy utilitarian facade, and NYU's logo-dominant street scene. Fourteen were promoted.

Several familiar institutions remain unapproved because their exact P18 is portrait-oriented, low resolution, logo-like, poorly sourced, or unsuitable in a banner. This includes current candidates for USC, Ohio State, Penn State, Florida, Wisconsin, Georgetown, Carnegie Mellon, and Yale. The gap is evidence-limited, not filled with guessed imagery.

## Reproduction and verification

Run from the repository root:

```sh
node scripts/refresh-campus-photo-candidates.mjs
node scripts/promote-campus-photo-review.mjs
node scripts/sync-campus-photo-approved-manifest.mjs
node --test tests/profile-campus-photos.test.ts
```

The focused photo test verifies all 47 UNITID/slug pairs, candidate non-leakage, local file existence, SHA-256 hashes, decoded dimensions, source/license fields, alt text, and the 500,000-byte ceiling for October assets. The 523-test full regression and 10 M14-focused tests passed. The native Next production build, TypeScript and full ESLint also passed before a final small change that enabled responsive banner image widths. Local desktop and 390px review covered reviewed-photo, no-photo fallback and compact-card states. After that optimization, the Vinext build and focused rendered-banner check, native Next build, TypeScript and targeted lint passed. The production browser confirmed the optimized image loads without console errors. Deployment and hosted verification remain pending; no hosted completion is claimed here.
