import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  acquireDataPublicationLock,
  DataPublicationError,
  publishStagedFiles,
} from "../scripts/lib/data-transaction.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "college-search-transaction-"));
  const dataDirectory = join(root, "data");
  const stagingDirectory = join(dataDirectory, ".refresh-test");
  await Promise.all([
    mkdir(dataDirectory, { recursive: true }),
    mkdir(stagingDirectory, { recursive: true }),
  ]);
  return { root, dataDirectory, stagingDirectory };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("publishes every staged data file together", async (context) => {
  const paths = await fixture();
  context.after(() => rm(paths.root, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(paths.dataDirectory, "a.json"), "old-a"),
    writeFile(join(paths.dataDirectory, "b.json"), "old-b"),
    writeFile(join(paths.stagingDirectory, "a.json"), "new-a"),
    writeFile(join(paths.stagingDirectory, "b.json"), "new-b"),
  ]);

  await publishStagedFiles({
    ...paths,
    fileNames: ["a.json", "b.json"],
  });

  assert.equal(await readFile(join(paths.dataDirectory, "a.json"), "utf8"), "new-a");
  assert.equal(await readFile(join(paths.dataDirectory, "b.json"), "utf8"), "new-b");
  assert.equal(await pathExists(join(paths.dataDirectory, ".refresh.lock")), false);
});

test("restores existing and previously absent files when publication fails", async (context) => {
  const paths = await fixture();
  context.after(() => rm(paths.root, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(paths.dataDirectory, "a.json"), "old-a"),
    writeFile(join(paths.dataDirectory, "b.json"), "old-b"),
    writeFile(join(paths.stagingDirectory, "a.json"), "new-a"),
    writeFile(join(paths.stagingDirectory, "b.json"), "new-b"),
    writeFile(join(paths.stagingDirectory, "new.json"), "brand-new"),
  ]);

  let failed = false;
  const renameWithFailure = async (source, destination) => {
    if (!failed && source.endsWith("b.json") && !source.includes(".backups")) {
      failed = true;
      throw new Error("simulated publication failure");
    }
    await rename(source, destination);
  };

  await assert.rejects(
    publishStagedFiles({
      ...paths,
      fileNames: ["a.json", "new.json", "b.json"],
      renameFile: renameWithFailure,
    }),
    /simulated publication failure/,
  );
  assert.equal(await readFile(join(paths.dataDirectory, "a.json"), "utf8"), "old-a");
  assert.equal(await readFile(join(paths.dataDirectory, "b.json"), "utf8"), "old-b");
  assert.equal(await pathExists(join(paths.dataDirectory, "new.json")), false);
  assert.equal(await pathExists(join(paths.dataDirectory, ".refresh.lock")), false);
});

test("preserves backups and a recovery lock when rollback is incomplete", async (context) => {
  const paths = await fixture();
  context.after(() => rm(paths.root, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(paths.dataDirectory, "a.json"), "old-a"),
    writeFile(join(paths.dataDirectory, "b.json"), "old-b"),
    writeFile(join(paths.stagingDirectory, "a.json"), "new-a"),
    writeFile(join(paths.stagingDirectory, "b.json"), "new-b"),
  ]);

  const renameWithIncompleteRollback = async (source, destination) => {
    if (source === join(paths.stagingDirectory, "b.json")) {
      throw new Error("simulated publication failure");
    }
    if (source === join(paths.stagingDirectory, ".backups", "a.json")) {
      throw new Error("simulated rollback failure");
    }
    await rename(source, destination);
  };

  let caught;
  try {
    await publishStagedFiles({
      ...paths,
      fileNames: ["a.json", "b.json"],
      renameFile: renameWithIncompleteRollback,
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof DataPublicationError);
  assert.equal(caught.rollbackIncomplete, true);
  assert.deepEqual(caught.affectedFiles, ["a.json"]);
  assert.equal(await readFile(join(paths.dataDirectory, "a.json"), "utf8"), "new-a");
  assert.equal(
    await readFile(join(paths.stagingDirectory, ".backups", "a.json"), "utf8"),
    "old-a",
  );
  const owner = JSON.parse(
    await readFile(join(paths.dataDirectory, ".refresh.lock", "owner.json"), "utf8"),
  );
  assert.equal(owner.state, "recovery-required");
  assert.equal(owner.recoveryDirectory, paths.stagingDirectory);
  assert.deepEqual(owner.affectedFiles, ["a.json"]);
});

test("rejects duplicate targets before changing live data", async (context) => {
  const paths = await fixture();
  context.after(() => rm(paths.root, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(paths.dataDirectory, "a.json"), "old-a"),
    writeFile(join(paths.stagingDirectory, "a.json"), "new-a"),
  ]);

  await assert.rejects(
    publishStagedFiles({
      ...paths,
      fileNames: ["a.json", "a.json"],
    }),
    /duplicate filenames/,
  );
  assert.equal(await readFile(join(paths.dataDirectory, "a.json"), "utf8"), "old-a");
  assert.equal(await readFile(join(paths.stagingDirectory, "a.json"), "utf8"), "new-a");
  assert.equal(await pathExists(join(paths.dataDirectory, ".refresh.lock")), false);
});

test("rejects missing and non-file staged targets before publication", async (context) => {
  const paths = await fixture();
  context.after(() => rm(paths.root, { recursive: true, force: true }));
  await Promise.all([
    writeFile(join(paths.dataDirectory, "a.json"), "old-a"),
    writeFile(join(paths.stagingDirectory, "a.json"), "new-a"),
    mkdir(join(paths.stagingDirectory, "directory.json")),
  ]);

  await assert.rejects(
    publishStagedFiles({
      ...paths,
      fileNames: ["a.json", "missing.json"],
    }),
    (error) => error?.code === "ENOENT",
  );
  await assert.rejects(
    publishStagedFiles({
      ...paths,
      fileNames: ["a.json", "directory.json"],
    }),
    /must be a regular file/,
  );
  assert.equal(await readFile(join(paths.dataDirectory, "a.json"), "utf8"), "old-a");
  assert.equal(await readFile(join(paths.stagingDirectory, "a.json"), "utf8"), "new-a");
  assert.equal(await pathExists(join(paths.dataDirectory, ".refresh.lock")), false);
});

test("serializes publication locks and releases only the owning token", async (context) => {
  const paths = await fixture();
  context.after(() => rm(paths.root, { recursive: true, force: true }));
  const first = await acquireDataPublicationLock({ dataDirectory: paths.dataDirectory });

  await assert.rejects(
    acquireDataPublicationLock({ dataDirectory: paths.dataDirectory }),
    (error) => error?.code === "DATA_REFRESH_LOCKED",
  );
  await first.release();

  const second = await acquireDataPublicationLock({ dataDirectory: paths.dataDirectory });
  const ownerPath = join(paths.dataDirectory, ".refresh.lock", "owner.json");
  const owner = JSON.parse(await readFile(ownerPath, "utf8"));
  await writeFile(ownerPath, `${JSON.stringify({ ...owner, token: "someone-else" })}\n`);
  await assert.rejects(
    second.release(),
    (error) => error?.code === "DATA_REFRESH_LOCK_OWNERSHIP_LOST",
  );
  assert.equal(await pathExists(join(paths.dataDirectory, ".refresh.lock")), true);
});
