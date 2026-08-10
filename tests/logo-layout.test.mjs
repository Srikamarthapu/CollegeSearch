import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("portrait and landscape college marks stay contained in fixed logo frames", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.college-logo\s*\{[^}]*position:\s*relative;/s,
    "the logo frame establishes a definite positioning box",
  );
  assert.match(
    css,
    /\.college-logo img\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*padding:\s*inherit;[^}]*object-fit:\s*contain;/s,
    "the image fills the definite frame, inherits its safe area, and preserves its aspect ratio",
  );
});
