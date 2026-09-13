import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const path = process.env.INSTITUTION_VERIFICATION_REPORT_PATH
  ? resolve(process.env.INSTITUTION_VERIFICATION_REPORT_PATH)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../data/institution-source-verification.json");
const report = JSON.parse(await readFile(path, "utf8"));
const text = (value) => String(value ?? "").replace(/[\r\n|]/g, " ").replace(/[<>]/g, "");
console.log(`## Institutional source verification: ${text(report.status)}`);
console.log(`\nChecked ${text(report.checkedAt)}. ${report.counts.passed}/${report.counts.total} artifacts passed; ${report.counts.failed} failed; ${report.counts.notChecked} not checked.`);
console.log("\nThis checks current availability, format and the approved fingerprint. It does not update the factual review date, reporting period, or approved observations.");
if (report.error) console.log(`\nManifest error: ${text(report.error.message)}`);
const failures = report.sources.filter((source) => source.status !== "passed");
if (failures.length) {
  console.log("\n| Source | Result | Last approved review | Detail |");
  console.log("| --- | --- | --- | --- |");
  for (const source of failures) {
    console.log(`| ${text(source.sourceName)} | ${text(source.status)} | ${text(source.lastApprovedEvidence.reviewedOn)} | ${text(source.error?.message)} |`);
  }
}
