import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studentStylesheets = [
  "../app/globals.css",
  "../app/match/match.module.css",
  "../app/chances/chances.module.css",
  "../app/majors/majors.module.css",
  "../app/account/account.module.css",
  "../app/components/auth/auth.module.css",
  "../app/auth/update-password/auth-page.module.css",
  "../app/data-health/data-health.module.css",
  "../app/saved/saved.module.css",
];

test("student-facing stylesheets avoid unreadable microcopy", async () => {
  for (const relativePath of studentStylesheets) {
    const stylesheet = await readFile(
      new URL(relativePath, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      stylesheet,
      /font-size:\s*(?:[1-9]|10)px\b/,
      `${relativePath} keeps supporting text at 11px or larger`,
    );
  }
});
