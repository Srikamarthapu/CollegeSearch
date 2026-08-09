import { rename, writeFile } from "node:fs/promises";

/**
 * Publish generated data without exposing a partially written JSON file.
 * The temporary file lives beside the destination so the final rename stays
 * on the same filesystem and is atomic on supported platforms.
 */
export async function atomicWriteFile(destination, contents) {
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, destination);
}
