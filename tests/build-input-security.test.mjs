import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));
const staticImageExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".icns",
  ".jpeg",
  ".jpg",
  ".jxl",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return nested.flat();
}

test("app build inputs avoid the currently vulnerable image-size parser", async () => {
  const files = await walk(appDirectory);
  const staticImages = files.filter((file) =>
    staticImageExtensions.has(extname(file).toLowerCase()),
  );
  assert.deepEqual(
    staticImages,
    [],
    "Keep app metadata and imported images as code or public URL assets until vinext ships a patched image-size dependency.",
  );

  const binaryImportPattern =
    /(?:from\s*|import\s*\()\s*["'][^"']+\.(?:avif|bmp|gif|heic|heif|ico|icns|jpe?g|jxl|png|tiff?|webp)["']/i;
  for (const file of files.filter((candidate) =>
    sourceExtensions.has(extname(candidate).toLowerCase()),
  )) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      binaryImportPattern,
      `${relative(appDirectory, file)} statically imports an image build input`,
    );
  }
});
