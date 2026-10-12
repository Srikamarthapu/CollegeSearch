import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { register } from "tsx/esm/api";

register();

const [{ projectCollegeForClient }, { toChancesCollege }, directoryModule, stateModule] =
  await Promise.all([
    import("../app/lib/college-client-record.ts"),
    import("../app/chances/admissions-record.ts"),
    import("../app/lib/college-directory.ts"),
    import("../app/lib/college-directory-state.ts"),
  ]);

const sourceNames = [
  "colleges.json",
  "college-tuition.json",
  "college-cost-overrides.json",
  "college-actions.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("generated directory, admissions, and runtime artifacts preserve source projections and release identity", async () => {
  const [sourceBuffers, clientBuffer, admissionsBuffer, summaryBuffer, markerBuffer] =
    await Promise.all([
      Promise.all(sourceNames.map((name) => readFile(new URL(`../data/${name}`, import.meta.url)))),
      readFile(new URL("../data/college-directory-client.json", import.meta.url)),
      readFile(new URL("../data/college-admissions-directory.json", import.meta.url)),
      readFile(new URL("../data/college-runtime-summary.json", import.meta.url)),
      readFile(new URL("../data/college-knowledge-release.json", import.meta.url)),
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
