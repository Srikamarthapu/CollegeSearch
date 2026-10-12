import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { register } from "tsx/esm/api";

register();

const [
  { projectCollegeForClient },
  { toChancesCollege },
  directoryModule,
  stateModule,
  { colleges: mergedColleges, release },
  { projectEligibleMatchColleges },
  { observationSourceKind },
  recordLoader,
] =
  await Promise.all([
    import("../app/lib/college-client-record.ts"),
    import("../app/chances/admissions-record.ts"),
    import("../app/lib/college-directory.ts"),
    import("../app/lib/college-directory-state.ts"),
    import("../app/lib/college-data.ts"),
    import("../app/match/college-artifact.ts"),
    import("../app/lib/college-record-presentation.ts"),
    import("../app/lib/college-record-loader.ts"),
  ]);

const sourceNames = [
  "colleges.json",
  "college-tuition.json",
  "college-cost-overrides.json",
  "college-actions.json",
];
const logoSourceNames = [
  "college-logo-sources-01-25.json",
  "college-logo-sources-26-50.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("generated directory, admissions, and runtime artifacts preserve source projections and release identity", async () => {
  const [
    sourceBuffers,
    clientBuffer,
    admissionsBuffer,
    summaryBuffer,
    matchBuffer,
    trustMetadataBuffer,
    recordManifestBuffer,
    markerBuffer,
    logoSourceBuffers,
  ] =
    await Promise.all([
      Promise.all(sourceNames.map((name) => readFile(new URL(`../data/${name}`, import.meta.url)))),
      readFile(new URL("../data/college-directory-client.json", import.meta.url)),
      readFile(new URL("../data/college-admissions-directory.json", import.meta.url)),
      readFile(new URL("../data/college-runtime-summary.json", import.meta.url)),
      readFile(new URL("../data/college-match-directory.json", import.meta.url)),
      readFile(new URL("../data/college-trust-metadata.json", import.meta.url)),
      readFile(new URL("../data/college-records/manifest.json", import.meta.url)),
      readFile(new URL("../data/college-knowledge-release.json", import.meta.url)),
      Promise.all(logoSourceNames.map((name) => readFile(new URL(`../data/${name}`, import.meta.url)))),
    ]);
  const [catalogBytes, tuitionBytes, overridesBytes, actionsBytes] = sourceBuffers;
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const tuition = JSON.parse(tuitionBytes.toString("utf8"));
  const overrides = JSON.parse(overridesBytes.toString("utf8"));
  const actions = JSON.parse(actionsBytes.toString("utf8"));
  const releaseId = `sha256:${sha256(catalogBytes)}`;
  const sourceHashes = Object.fromEntries(
    sourceNames.map((name, index) => [name, `sha256:${sha256(sourceBuffers[index])}`]),
  );
  const cacheVersion = `sha256:${sha256(
    sourceNames.map((name) => `${name}:${sourceHashes[name]}`).join("\n"),
  )}`;
  const marker = JSON.parse(markerBuffer.toString("utf8"));
  assert.equal(marker.releaseId, releaseId);

  const tuitionById = new Map(tuition.colleges.map((row) => [row.unitId, row]));
  const overridesById = new Map(overrides.colleges.map((row) => [row.unitId, row]));
  const clientColleges = catalog.colleges.map((college) => {
    const tuitionRow = tuitionById.get(college.unitId);
    assert.ok(tuitionRow, `tuition record exists for ${college.unitId}`);
    const costs = overridesById.get(college.unitId)?.costs ?? {
      tuitionInState: tuitionRow.tuition.inState,
      tuitionOutOfState: tuitionRow.tuition.outOfState,
      feesInState: tuitionRow.fees.inState,
      feesOutOfState: tuitionRow.fees.outOfState,
      feeBasis: "required",
    };
    return projectCollegeForClient({ ...college, costs });
  });
  const admissionsColleges = catalog.colleges.map(toChancesCollege);
  const actionsById = new Map(actions.colleges.map((row) => [row.unitId, row]));
  assert.equal(actionsById.size, actions.colleges.length);

  const clientArtifact = JSON.parse(clientBuffer.toString("utf8"));
  assert.deepEqual(clientArtifact, {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    sourceHashes,
    colleges: clientColleges,
  });
  assert.deepEqual(JSON.parse(admissionsBuffer.toString("utf8")), {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    colleges: admissionsColleges,
  });
  assert.deepEqual(JSON.parse(matchBuffer.toString("utf8")), {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    sourceHashes,
    colleges: JSON.parse(JSON.stringify(projectEligibleMatchColleges(mergedColleges))),
  });
  assert.deepEqual(JSON.parse(recordManifestBuffer.toString("utf8")), {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    sourceHashes,
    release,
    colleges: mergedColleges.map(({ unitId, slug, catalogCategory }) => ({
      unitId,
      slug,
      catalogCategory,
    })),
  });

  const firstPartyAdmissions = mergedColleges.filter(
    (college) => !observationSourceKind(college.observations.admitRate).isFederal,
  );
  const federalAdmissions = mergedColleges.filter(
    (college) => observationSourceKind(college.observations.admitRate).isFederal,
  );
  const reviewedInstitutionRecords = mergedColleges.filter((college) =>
    Object.values(college.observations).some(
      (observation) =>
        observation !== null &&
        !observation.sourceId.startsWith("uc-") &&
        !observationSourceKind(observation).isFederal,
    ),
  );
  const reviewedCollegeAdmissions = reviewedInstitutionRecords.filter(
    (college) => !observationSourceKind(college.observations.admitRate).isFederal,
  );
  const partialInstitutionRecords = reviewedInstitutionRecords.filter(
    (college) => observationSourceKind(college.observations.admitRate).isFederal,
  );
  const logoSources = logoSourceBuffers.flatMap((buffer) => JSON.parse(buffer.toString("utf8")));
  const namesBySlug = new Map(mergedColleges.map(({ slug, name }) => [slug, name]));
  const expectedLogoNames = Object.fromEntries(
    [...new Set(logoSources.map(({ slug }) => slug))]
      .filter((slug) => namesBySlug.has(slug))
      .map((slug) => [slug, namesBySlug.get(slug)]),
  );
  const trustSourceHashes = Object.fromEntries(
    [...sourceNames, ...logoSourceNames].map((name, index) => {
      const bytes = index < sourceBuffers.length
        ? sourceBuffers[index]
        : logoSourceBuffers[index - sourceBuffers.length];
      return [name, `sha256:${sha256(bytes)}`];
    }),
  );
  const trustCacheVersion = `sha256:${sha256(
    [...sourceNames, ...logoSourceNames]
      .map((name) => `${name}:${trustSourceHashes[name]}`)
      .join("\n"),
  )}`;
  assert.deepEqual(JSON.parse(trustMetadataBuffer.toString("utf8")), {
    schemaVersion: 1,
    releaseId,
    cacheVersion: trustCacheVersion,
    sourceHashes: trustSourceHashes,
    release,
    coverage: {
      institutionCount: mergedColleges.length,
      reviewedInstitutionRecordCount: reviewedInstitutionRecords.length,
      reviewedCollegeAdmissionCount: reviewedCollegeAdmissions.length,
      firstPartyAdmissionCount: firstPartyAdmissions.length,
      federalAdmissionCount: federalAdmissions.length,
      preliminaryUcSnapshotCount: firstPartyAdmissions.filter((college) =>
        college.observations.admitRate.sourceId.startsWith("uc-"),
      ).length,
      partialInstitutionNames: partialInstitutionRecords.map(({ name }) => name),
      tuitionReportedCount: mergedColleges.filter(
        (college) => college.costs.tuitionOutOfState.value !== null,
      ).length,
    },
    tuitionSourceUrl: tuition.release.sourceUrl,
    budgetReview: {
      collegeCount: overrides.colleges.length,
      reviewedOn: overrides.reviewedOn,
      colleges: overrides.colleges.map((row) => ({
        unitId: row.unitId,
        publisher: row.costs.tuitionOutOfState.publisher,
        budgetSourceUrl: row.budget.sourceUrl,
      })),
    },
    logoCollegeNames: expectedLogoNames,
  });

  const recordDirectory = new URL("../data/college-records/", import.meta.url);
  for (let index = 0; index < mergedColleges.length; index += 32) {
    const batch = mergedColleges.slice(index, index + 32);
    const records = await Promise.all(batch.map(async (college) =>
      JSON.parse((await readFile(new URL(`${college.unitId}.json`, recordDirectory))).toString("utf8")),
    ));
    assert.deepEqual(records, batch.map((college) => ({
      schemaVersion: 1,
      releaseId,
      cacheVersion,
      college,
    })));
  }

  const summary = JSON.parse(summaryBuffer.toString("utf8"));
  assert.equal(summary.releaseId, releaseId);
  assert.equal(summary.cacheVersion, cacheVersion);
  assert.equal(summary.institutionCount, catalog.colleges.length);
  assert.deepEqual(summary.unitIds, catalog.colleges.map(({ unitId }) => unitId));
  assert.equal(summary.directoryFacets.totalInstitutions, catalog.colleges.length);
  assert.equal(summary.directoryFacets.releaseId, releaseId);
  assert.ok(summary.directoryFacets.majorOptions.length > 0);
  assert.equal(directoryModule.directoryFacets().totalInstitutions, catalog.colleges.length);
});

test("server directory entrypoints consume compact artifacts instead of runtime source catalogs", async () => {
  const [directorySource, admissionsSource, layoutSource, statusSource] = await Promise.all([
    readFile(new URL("../app/lib/college-directory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chances/admissions-directory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/adviser/public-status.ts", import.meta.url), "utf8"),
  ]);
  assert.match(directorySource, /college-directory-client\.json/);
  assert.doesNotMatch(directorySource, /from ["'][^"']*college-data(?:\.ts)?["']/);
  assert.match(admissionsSource, /college-admissions-directory\.json/);
  assert.doesNotMatch(admissionsSource, /from ["'][^"']*college-data(?:\.ts)?["']/);
  assert.match(layoutSource, /college-runtime-summary\.json/);
  assert.doesNotMatch(layoutSource, /college-data|college-tuition/);
  assert.match(statusSource, /college-runtime-summary\.json/);
  assert.doesNotMatch(statusSource, /college-data|college-tuition/);
});

test("compact artifact keeps initial, normalized search, and selected-college directory semantics", async () => {
  const sourceColleges = JSON.parse(
    readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8"),
  ).colleges;
  const tuition = JSON.parse(
    readFileSync(new URL("../data/college-tuition.json", import.meta.url), "utf8"),
  );
  const overrides = JSON.parse(
    readFileSync(new URL("../data/college-cost-overrides.json", import.meta.url), "utf8"),
  );
  const tuitionById = new Map(tuition.colleges.map((row) => [row.unitId, row]));
  const overridesById = new Map(overrides.colleges.map((row) => [row.unitId, row]));
  const sourceProjection = sourceColleges.map((college) => {
    const tuitionRow = tuitionById.get(college.unitId);
    const costs = overridesById.get(college.unitId)?.costs ?? {
      tuitionInState: tuitionRow.tuition.inState,
      tuitionOutOfState: tuitionRow.tuition.outOfState,
      feesInState: tuitionRow.fees.inState,
      feesOutOfState: tuitionRow.fees.outOfState,
      feeBasis: "required",
    };
    return projectCollegeForClient({ ...college, costs });
  });
  const baseline = stateModule.sortDirectoryColleges(
    sourceProjection,
    stateModule.EMPTY_DIRECTORY_FILTERS.sort,
    "",
  );
  const expectedFirstPage = baseline.slice(0, stateModule.DIRECTORY_PAGE_SIZE).map(({ unitId }) => unitId);
  const first = directoryModule.searchCollegeDirectory({
    filters: stateModule.EMPTY_DIRECTORY_FILTERS,
    selectedIds: [110635],
  });
  const second = directoryModule.searchCollegeDirectory({
    filters: stateModule.EMPTY_DIRECTORY_FILTERS,
    selectedIds: [243744],
  });
  assert.deepEqual(first.items.map(({ unitId }) => unitId), expectedFirstPage);
  assert.deepEqual(second.items.map(({ unitId }) => unitId), expectedFirstPage);
  assert.deepEqual(first.selectedItems.map(({ unitId }) => unitId), [110635]);
  assert.deepEqual(second.selectedItems.map(({ unitId }) => unitId), [243744]);

  const query = (value) => directoryModule.searchCollegeDirectory({
    filters: { ...stateModule.EMPTY_DIRECTORY_FILTERS, query: value },
  });
  assert.deepEqual(
    query("UC Berkeley").items.map(({ unitId }) => unitId),
    query("  uc   berkeley ").items.map(({ unitId }) => unitId),
  );
  assert.equal(query("UC Berkeley").items[0]?.unitId, 110635);
  const { filterCollegesByQuery } = await import("../app/lib/college-search.ts");
  const expectedSearchIds = stateModule.sortDirectoryColleges(
    filterCollegesByQuery(sourceProjection, "UC Berkeley", directoryModule.directoryFacets().majorOptions),
    stateModule.EMPTY_DIRECTORY_FILTERS.sort,
    "",
  ).map(({ unitId }) => unitId);
  assert.deepEqual(query("UC Berkeley").items.map(({ unitId }) => unitId), expectedSearchIds);

  const savedOnly = directoryModule.searchCollegeDirectory({
    filters: { ...stateModule.EMPTY_DIRECTORY_FILTERS, savedOnly: true },
    savedIds: [110635],
  });
  assert.deepEqual(savedOnly.items.map(({ unitId }) => unitId), [110635]);
});

test("college record loading is allowlisted and compare reads at most four selected records", async () => {
  const manifest = recordLoader.collegeRecordManifest;
  const known = manifest.colleges.slice(0, 6);
  const requested = [0, known[0].unitId, known[0].unitId, ...known.slice(1).map(({ unitId }) => unitId)];
  const selectedIds = recordLoader.selectCollegeRecordUnitIds(requested);
  assert.deepEqual(selectedIds, known.slice(0, 4).map(({ unitId }) => unitId));
  assert.deepEqual(recordLoader.selectCollegeRecordUnitIds([0, -1, 999999999]), []);

  const [profile, comparison] = await Promise.all([
    recordLoader.collegeBySlug(known[0].slug),
    recordLoader.collegesByUnitIds(requested),
  ]);
  assert.deepEqual(profile, mergedColleges.find(({ unitId }) => unitId === known[0].unitId));
  assert.deepEqual(
    comparison,
    known.slice(0, 4).map(({ unitId }) => mergedColleges.find((college) => college.unitId === unitId)),
  );
  assert.equal(await recordLoader.collegeBySlug("../../colleges.json"), null);
  assert.deepEqual(await recordLoader.collegesByUnitIds([999999999]), []);
});

test("profile and compare runtime imports stay detached from the full source catalog", async () => {
  const [profilePage, comparePage, nextConfig] = await Promise.all([
    readFile(new URL("../app/colleges/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/compare/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  for (const pageSource of [profilePage, comparePage]) {
    assert.doesNotMatch(pageSource, /^import\s+(?!type\b)[^\n]*college-data/m);
    assert.match(pageSource, /from ["']@\/app\/lib\/college-record-loader["']/);
  }
  assert.match(profilePage, /import type \{ Observation \} from ["']@\/app\/lib\/college-data["']/);
  assert.match(comparePage, /import type \{ College, Observation \} from ["']@\/app\/lib\/college-data["']/);
  assert.match(nextConfig, /"\/colleges\/\*": \["\.\/data\/college-records\/\*\.json"\]/);
  assert.match(nextConfig, /"\/compare": \["\.\/data\/college-records\/\*\.json"\]/);
});

test("trust pages render generated release and coverage metadata without runtime source catalogs", async () => {
  const [healthPage, sourcesPage, methodologyPage] = await Promise.all([
    readFile(new URL("../app/data-health/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/data-sources/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/methodology/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const pageSource of [healthPage, sourcesPage, methodologyPage]) {
    assert.match(pageSource, /college-trust-metadata\.json/);
    assert.doesNotMatch(
      pageSource,
      /^import\s+(?!type\b)[^\n]*from\s+["'][^"']*(?:college-data(?:\.ts)?|college-tuition\.json|college-cost-overrides\.json|colleges\.json)/m,
    );
  }
  assert.match(sourcesPage, /import type \{ SourceRelease \} from ["']@\/app\/lib\/college-data["']/);
  assert.match(healthPage, /institution-source-verification\.json/);
  assert.match(healthPage, /verificationRecency\(/);
  assert.match(healthPage, /Date\.now\(\)/);
  assert.match(healthPage, /export const dynamic = ["']force-dynamic["']/);
});
