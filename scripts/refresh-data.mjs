import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquireDataPublicationLock,
  publishStagedFiles,
} from "./lib/data-transaction.mjs";
import {
  assertOverlaySnapshotUnchanged,
  validateStagedRelease,
} from "./lib/data-refresh-validation.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const dataDirectory = resolve(repositoryRoot, "data");
const liveOverlayPath = join(dataDirectory, "institution-overlays.json");
const publicationLock = await acquireDataPublicationLock({ dataDirectory });
let stagingDirectory = null;
let preserveRecoveryState = false;

function runScript(relativePath, extraEnvironment = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve(repositoryRoot, relativePath)], {
      cwd: repositoryRoot,
      env: { ...process.env, ...extraEnvironment },
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(
          new Error(
            `${relativePath} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`,
          ),
        );
      }
    });
  });
}

async function readJson(fileName) {
  if (!stagingDirectory) throw new Error("Data refresh staging is not initialized.");
  return JSON.parse(await readFile(join(stagingDirectory, fileName), "utf8"));
}

try {
  stagingDirectory = await mkdtemp(join(dataDirectory, ".refresh-"));
  await publicationLock.setStagingDirectory(stagingDirectory);
  const stagedOverlayPath = join(stagingDirectory, "institution-overlays.json");
  await copyFile(liveOverlayPath, stagedOverlayPath);
  const overlaySnapshotBytes = await readFile(stagedOverlayPath);
  const overlayEnvironment = {
    INSTITUTION_OVERLAYS_PATH: stagedOverlayPath,
  };

  await runScript("scripts/verify-institution-overlays.mjs", overlayEnvironment);
  await runScript("scripts/import-uc-accountability.mjs", {
    DATA_OUTPUT_DIR: stagingDirectory,
  });
  await runScript("scripts/import-uc-admissions-snapshots.mjs", {
    DATA_OUTPUT_DIR: stagingDirectory,
  });
  await runScript("scripts/import-scorecard.mjs", {
    DATA_INPUT_DIR: stagingDirectory,
    DATA_OUTPUT_DIR: stagingDirectory,
    ...overlayEnvironment,
  });

  const [finalizedAdmissions, latestAdmissions, generatedColleges] = await Promise.all([
    readJson("uc-admissions-2025.json"),
    readJson("uc-admissions-latest.json"),
    readJson("colleges.json"),
  ]);
  const { fileNames } = validateStagedRelease({
    finalizedAdmissions,
    latestAdmissions,
    generatedColleges,
  });
  await Promise.all(fileNames.map(readJson));
  assertOverlaySnapshotUnchanged(
    overlaySnapshotBytes,
    await readFile(liveOverlayPath),
  );
  await publishStagedFiles({
    stagingDirectory,
    dataDirectory,
    fileNames,
    publicationLock,
  });
  console.log(`Published ${fileNames.length} generated data files as one refresh transaction.`);
} catch (error) {
  if (error?.rollbackIncomplete) {
    preserveRecoveryState = true;
    console.error(
      `RECOVERY REQUIRED: live data may be mixed. Preserve ${error.recoveryDirectory} and ${error.lockDirectory}; affected files: ${error.affectedFiles.join(", ")}.`,
    );
  }
  throw error;
} finally {
  if (!preserveRecoveryState) {
    try {
      if (stagingDirectory) {
        await rm(stagingDirectory, { recursive: true, force: true });
      }
    } finally {
      await publicationLock.release();
    }
  }
}
