#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

import { projectCollegeForClient } from "../app/lib/college-client-record.ts";
import { toChancesCollege } from "../app/chances/admissions-record.ts";

register();
const [{ colleges: validatedColleges, release }, { projectEligibleMatchColleges }] = await Promise.all([
  import("../app/lib/college-data.ts"),
  import("../app/match/college-artifact.ts"),
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceNames = [
  "colleges.json",
  "college-tuition.json",
  "college-cost-overrides.json",
  "college-actions.json",
];
const outputNames = [
  "data/college-directory-client.json",
  "data/college-admissions-directory.json",
  "data/college-runtime-summary.json",
  "data/college-match-directory.json",
  "data/college-records/manifest.json",
  "app/lib/college-directory-cache-version.ts",
];
const recordDirectory = path.join(root, "data", "college-records");
const checkOnly = process.argv.includes("--check");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function uniqueMap(rows, label) {
  const result = new Map();
  for (const row of rows) {
    if (!Number.isSafeInteger(row?.unitId) || result.has(row.unitId)) {
      throw new Error(`${label} has a duplicate or invalid UNITID.`);
    }
    result.set(row.unitId, row);
  }
  return result;
}

async function buildArtifacts() {
  const [sourceBuffers, markerBuffer] = await Promise.all([
    Promise.all(sourceNames.map((name) => readFile(path.join(root, "data", name)))),
    readFile(path.join(root, "data", "college-knowledge-release.json")),
  ]);
  const [catalogBytes, tuitionBytes, costOverridesBytes, actionsBytes] = sourceBuffers;
  const marker = JSON.parse(markerBuffer.toString("utf8"));
  const releaseId = `sha256:${sha256(catalogBytes)}`;
  if (marker.releaseId !== releaseId) {
    throw new Error(
      `College directory source is stale: knowledge release marker must match ${releaseId}. Run scripts/build-college-knowledge.mjs first.`,
    );
  }

  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const tuition = JSON.parse(tuitionBytes.toString("utf8"));
  const costOverrides = JSON.parse(costOverridesBytes.toString("utf8"));
  const actions = JSON.parse(actionsBytes.toString("utf8"));
  const tuitionById = uniqueMap(tuition.colleges, "Tuition evidence");
  const overridesById = uniqueMap(costOverrides.colleges, "Cost overrides");
  uniqueMap(actions.colleges, "College actions");
  if (!Array.isArray(catalog.colleges) || catalog.colleges.length === 0) {
    throw new Error("College catalog is missing its institution rows.");
  }
  if (tuitionById.size !== catalog.colleges.length) {
    throw new Error("Tuition evidence does not cover the complete college catalog.");
  }

  const clientColleges = catalog.colleges.map((college) => {
    const tuitionRow = tuitionById.get(college.unitId);
    if (!tuitionRow) throw new Error(`${college.name}: missing tuition evidence record.`);
    const costOverride = overridesById.get(college.unitId);
    const costs = costOverride?.costs ?? {
      tuitionInState: tuitionRow.tuition.inState,
      tuitionOutOfState: tuitionRow.tuition.outOfState,
      feesInState: tuitionRow.fees.inState,
      feesOutOfState: tuitionRow.fees.outOfState,
      feeBasis: "required",
    };
    return projectCollegeForClient({ ...college, costs });
  });
  const admissionsColleges = catalog.colleges.map(toChancesCollege);

  const federalAdmissions = catalog.colleges.filter((college) => {
    const observation = college.observations.admitRate;
    return (
      !observation.sourceId.startsWith("uc-") &&
      observation.publisher === "U.S. Department of Education"
    );
  }).length;
  const ucAdmissions = catalog.colleges.filter((college) =>
    college.observations.admitRate.sourceId.startsWith("uc-"),
  ).length;
  const reviewedInstitutionRecords = catalog.colleges.filter((college) =>
    Object.values(college.observations).some(
      (observation) =>
        observation !== null &&
        !observation.sourceId.startsWith("uc-") &&
        observation.publisher !== "U.S. Department of Education",
    ),
  ).length;
  const states = [...new Set(catalog.colleges.map((college) => college.state))].sort();
  const ownerships = ["Public", "Private nonprofit", "Private for-profit"].filter(
    (ownership) => catalog.colleges.some((college) => college.ownership === ownership),
  );
  const settings = [...new Set(
    catalog.colleges
      .map((college) => college.setting)
      .filter((setting) => setting !== "Setting unavailable"),
  )].sort();
  const majorOptions = [...new Set(
    catalog.colleges.flatMap((college) => college.majors.map((major) => major.name)),
  )].sort();

  const sourceHashes = Object.fromEntries(
    sourceNames.map((name, index) => [name, `sha256:${sha256(sourceBuffers[index])}`]),
  );
  const cacheVersionInput = sourceNames
    .map((name) => `${name}:${sourceHashes[name]}`)
    .join("\n");
  const cacheVersion = `sha256:${sha256(cacheVersionInput)}`;
  const recordManifest = {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    sourceHashes,
    release,
    colleges: validatedColleges.map(({ unitId, slug, catalogCategory }) => ({
      unitId,
      slug,
      catalogCategory,
    })),
  };
  const matchArtifact = {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    sourceHashes,
    colleges: projectEligibleMatchColleges(validatedColleges),
  };
  const artifact = {
    schemaVersion: 1,
    releaseId,
    cacheVersion,
    sourceHashes,
    colleges: clientColleges,
  };
  const runtimeSummary = {
    releaseId,
    cacheVersion,
    institutionCount: clientColleges.length,
    unitIds: clientColleges.map(({ unitId }) => unitId),
    directoryFacets: {
      states,
      ownerships,
      institutionLevels: ["Four-year", "Two-year"],
      settings,
      majorOptions,
      totalInstitutions: clientColleges.length,
      releaseId,
      evidenceCounts: {
        firstPartyAdmissions: clientColleges.length - federalAdmissions,
        reviewedCollegeAdmissions: clientColleges.length - federalAdmissions - ucAdmissions,
        reviewedInstitutionRecords,
      },
    },
  };
  const outputs = new Map([
    ["data/college-directory-client.json", `${JSON.stringify(artifact)}\n`],
    [
      "data/college-admissions-directory.json",
      `${JSON.stringify({ schemaVersion: 1, releaseId, cacheVersion, colleges: admissionsColleges })}\n`,
    ],
    ["data/college-runtime-summary.json", `${JSON.stringify(runtimeSummary)}\n`],
    ["data/college-match-directory.json", `${JSON.stringify(matchArtifact)}\n`],
    ["data/college-records/manifest.json", `${JSON.stringify(recordManifest)}\n`],
    [
      "app/lib/college-directory-cache-version.ts",
      `// Generated by scripts/build-college-directory-artifact.mjs. Do not edit by hand.\nexport const COLLEGE_DIRECTORY_CACHE_VERSION = ${JSON.stringify(cacheVersion)};\n`,
    ],
  ]);

  let recordBytes = 0;
  const expectedRecordNames = new Set(validatedColleges.map(({ unitId }) => `${unitId}.json`));
  const existingRecordNames = await readdir(recordDirectory).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const existingShardNames = existingRecordNames.filter((name) => /^\d+\.json$/.test(name));

  if (checkOnly) {
    for (const outputName of outputNames) {
      let existing;
      try {
        existing = await readFile(path.join(root, outputName), "utf8");
      } catch {
        throw new Error(`${outputName} is missing; run node scripts/build-college-directory-artifact.mjs.`);
      }
      if (existing !== outputs.get(outputName)) {
        throw new Error(`${outputName} is stale; run node scripts/build-college-directory-artifact.mjs.`);
      }
    }
    if (
      existingShardNames.length !== expectedRecordNames.size ||
      existingShardNames.some((name) => !expectedRecordNames.has(name))
    ) {
      throw new Error("data/college-records has missing or stale record shards; regenerate the artifacts.");
    }
    for (let index = 0; index < validatedColleges.length; index += 32) {
      await Promise.all(validatedColleges.slice(index, index + 32).map(async (college) => {
        const record = `${JSON.stringify({ schemaVersion: 1, releaseId, cacheVersion, college })}\n`;
        let existing;
        try {
          existing = await readFile(path.join(recordDirectory, `${college.unitId}.json`), "utf8");
        } catch {
          throw new Error(`College record ${college.unitId} is missing; regenerate the artifacts.`);
        }
        if (existing !== record) {
          throw new Error(`College record ${college.unitId} is stale; regenerate the artifacts.`);
        }
        recordBytes += Buffer.byteLength(record);
      }));
    }
  } else {
    await mkdir(recordDirectory, { recursive: true });
    for (let index = 0; index < validatedColleges.length; index += 32) {
      await Promise.all(validatedColleges.slice(index, index + 32).map(async (college) => {
        const record = `${JSON.stringify({ schemaVersion: 1, releaseId, cacheVersion, college })}\n`;
        recordBytes += Buffer.byteLength(record);
        await writeFile(path.join(recordDirectory, `${college.unitId}.json`), record);
      }));
    }
    for (const name of existingShardNames) {
      if (/^\d+\.json$/.test(name) && !expectedRecordNames.has(name)) {
        await unlink(path.join(recordDirectory, name));
      }
    }
    for (const outputName of outputNames.filter((name) => name !== "data/college-records/manifest.json")) {
      await writeFile(path.join(root, outputName), outputs.get(outputName));
    }
    await writeFile(
      path.join(root, "data/college-records/manifest.json"),
      outputs.get("data/college-records/manifest.json"),
    );
  }

  return {
    releaseId,
    cacheVersion,
    institutions: clientColleges.length,
    bytes: Buffer.byteLength(outputs.get("data/college-directory-client.json")),
    admissionsBytes: Buffer.byteLength(outputs.get("data/college-admissions-directory.json")),
    matchInstitutions: matchArtifact.colleges.length,
    recordBytes,
  };
}

const result = await buildArtifacts();
console.log(JSON.stringify({ ...result, checked: checkOnly }));
