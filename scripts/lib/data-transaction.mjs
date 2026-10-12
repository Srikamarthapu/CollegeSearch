import { randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { basename, join, resolve } from "node:path";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function acquireDataPublicationLock({
  dataDirectory,
  stagingDirectory = null,
}) {
  const dataRoot = resolve(dataDirectory);
  const lockDirectory = join(dataRoot, ".refresh.lock");
  const ownerPath = join(lockDirectory, "owner.json");
  const token = randomUUID();
  try {
    await mkdir(lockDirectory);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner = "owner metadata unavailable";
    try {
      owner = await readFile(ownerPath, "utf8");
    } catch (readError) {
      if (readError?.code !== "ENOENT") throw readError;
    }
    const lockError = new Error(
      `Another data publication owns ${lockDirectory}. Verify that no refresh is running before recovering the lock. Owner: ${owner}`,
    );
    lockError.code = "DATA_REFRESH_LOCKED";
    lockError.lockDirectory = lockDirectory;
    throw lockError;
  }

  try {
    await writeFile(
      ownerPath,
      `${JSON.stringify(
        {
          token,
          pid: process.pid,
          hostname: hostname(),
          startedAt: new Date().toISOString(),
          state: "running",
          stagingDirectory: stagingDirectory ? resolve(stagingDirectory) : null,
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
  } catch (error) {
    await rm(lockDirectory, { recursive: true, force: true });
    throw error;
  }

  let released = false;
  async function readOwnedRecord() {
    let owner;
    try {
      owner = JSON.parse(await readFile(ownerPath, "utf8"));
    } catch (error) {
      const ownershipError = new Error(
        `Cannot update data publication lock ${lockDirectory}: owner metadata is unavailable or invalid.`,
        { cause: error },
      );
      ownershipError.code = "DATA_REFRESH_LOCK_OWNERSHIP_LOST";
      throw ownershipError;
    }
    if (owner.token !== token) {
      const ownershipError = new Error(
        `Cannot update data publication lock ${lockDirectory}: ownership token changed.`,
      );
      ownershipError.code = "DATA_REFRESH_LOCK_OWNERSHIP_LOST";
      throw ownershipError;
    }
    return owner;
  }

  async function replaceOwnedRecord(patch) {
    const owner = await readOwnedRecord();
    const temporaryOwnerPath = join(lockDirectory, `owner-${token}.json`);
    await writeFile(
      temporaryOwnerPath,
      `${JSON.stringify({ ...owner, ...patch }, null, 2)}\n`,
      { flag: "wx" },
    );
    await rename(temporaryOwnerPath, ownerPath);
  }

  return {
    lockDirectory,
    token,
    async setStagingDirectory(nextStagingDirectory) {
      await replaceOwnedRecord({
        stagingDirectory: resolve(nextStagingDirectory),
      });
    },
    async markRecoveryRequired({ recoveryDirectory, affectedFiles }) {
      await replaceOwnedRecord({
        state: "recovery-required",
        recoveryDirectory: resolve(recoveryDirectory),
        affectedFiles,
      });
    },
    async release() {
      if (released) return;
      await readOwnedRecord();
      await rm(lockDirectory, { recursive: true, force: true });
      released = true;
    },
  };
}

export class DataPublicationError extends AggregateError {
  constructor(errors, { recoveryDirectory, lockDirectory, affectedFiles }) {
    super(
      errors,
      `Data publication failed and rollback was incomplete. Recovery files remain in ${recoveryDirectory}.`,
    );
    this.name = "DataPublicationError";
    this.code = "DATA_ROLLBACK_INCOMPLETE";
    this.rollbackIncomplete = true;
    this.recoveryDirectory = recoveryDirectory;
    this.lockDirectory = lockDirectory;
    this.affectedFiles = affectedFiles;
  }
}

/**
 * Publish a complete staged data generation as one recoverable transaction.
 * Every staged path must be a plain filename and live beside its destination
 * filesystem so each individual rename is atomic. The multi-file sequence is
 * lock-protected and rollback-capable, but it is not one filesystem operation.
 */
export async function publishStagedFiles({
  stagingDirectory,
  dataDirectory,
  fileNames,
  renameFile = rename,
  publicationLock: providedPublicationLock,
}) {
  if (!Array.isArray(fileNames)) {
    throw new Error("A data transaction needs a filename array.");
  }
  const uniqueFileNames = [...new Set(fileNames)];
  if (uniqueFileNames.length === 0) {
    throw new Error("A data transaction needs at least one staged file.");
  }
  if (uniqueFileNames.length !== fileNames.length) {
    throw new Error("A data transaction cannot publish duplicate filenames.");
  }
  for (const fileName of uniqueFileNames) {
    if (
      typeof fileName !== "string" ||
      basename(fileName) !== fileName ||
      fileName === "." ||
      fileName === ".."
    ) {
      throw new Error(`Unsafe staged data filename ${fileName}.`);
    }
  }

  const stagingRoot = resolve(stagingDirectory);
  const dataRoot = resolve(dataDirectory);
  const publicationLock =
    providedPublicationLock ??
    (await acquireDataPublicationLock({
      dataDirectory: dataRoot,
      stagingDirectory: stagingRoot,
    }));
  const releasePublicationLock = !providedPublicationLock;
  let preservePublicationLock = false;
  const backupDirectory = join(stagingRoot, ".backups");
  try {
    await mkdir(backupDirectory, { recursive: true });

    const records = [];
    for (const fileName of uniqueFileNames) {
      const stagedPath = join(stagingRoot, fileName);
      const targetPath = join(dataRoot, fileName);
      const backupPath = join(backupDirectory, fileName);
      const stagedStatus = await lstat(stagedPath);
      if (!stagedStatus.isFile()) {
        throw new Error(`Staged data target ${fileName} must be a regular file.`);
      }
      const hadOriginal = await exists(targetPath);
      records.push({ stagedPath, targetPath, backupPath, hadOriginal });
    }
    for (const record of records) {
      if (record.hadOriginal) {
        await copyFile(record.targetPath, record.backupPath);
      }
    }

    const published = [];
    try {
      for (const record of records) {
        await renameFile(record.stagedPath, record.targetPath);
        published.push(record);
      }
    } catch (publishError) {
      const rollbackFailures = [];
      for (const record of [...published].reverse()) {
        try {
          if (record.hadOriginal) {
            await renameFile(record.backupPath, record.targetPath);
          } else {
            await unlink(record.targetPath);
          }
        } catch (rollbackError) {
          rollbackFailures.push({ record, error: rollbackError });
        }
      }
      if (rollbackFailures.length > 0) {
        preservePublicationLock = true;
        const affectedFiles = rollbackFailures.map(({ record }) =>
          basename(record.targetPath),
        );
        try {
          await publicationLock.markRecoveryRequired({
            recoveryDirectory: stagingRoot,
            affectedFiles,
          });
        } catch (lockMetadataError) {
          rollbackFailures.push({ record: null, error: lockMetadataError });
        }
        throw new DataPublicationError(
          [publishError, ...rollbackFailures.map(({ error }) => error)],
          {
            recoveryDirectory: stagingRoot,
            lockDirectory: publicationLock.lockDirectory,
            affectedFiles,
          },
        );
      }
      throw publishError;
    }
  } finally {
    if (releasePublicationLock && !preservePublicationLock) {
      await publicationLock.release();
    }
  }
}
