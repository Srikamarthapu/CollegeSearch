import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { projectCollegesForClient } from "../app/lib/college-client-record.ts";
import { csvCell, researchCsv } from "../app/lib/research-export.ts";
import type { ClientCollege } from "../app/lib/college-client-record.ts";

test("CSV cells preserve user punctuation while neutralizing spreadsheet formulas", () => {
  assert.equal(csvCell('A "quoted", thought\nline 2'), '"A ""quoted"", thought\nline 2"');
  for (const dangerous of ["=HYPERLINK(1)", " +1", "\t@SUM(1)", "-1"]) assert.ok(csvCell(dangerous).startsWith('"\''));
});

test("research exports retain missing states, exact periods, sources and notes", () => {
  const observation = { value: null, periodLabel: "2023-2024 aid cohort", sourceUrl: "https://example.edu/data" };
  const college = {unitId: 1, name: "Example", city: "Town", state: "CA", slug: "example", observations: Object.fromEntries(["averageNetPrice", "admitRate", "graduationRate", "undergraduateEnrollment", "medianEarnings", "tuitionOutOfState"].map(key => [key, observation]))} as unknown as ClientCollege;
  const csv = researchCsv([college], {1: {version: 1, notes: "Ask about advising", checked: ["major"]}}, "https://collegesearch.example");
  assert.match(csv, /https:\/\/collegesearch\.example\/colleges\/example/);
  assert.match(csv, /Not reported/);
  assert.match(csv, /2023-2024 aid cohort/);
  assert.match(csv, /https:\/\/example.edu\/data/);
  assert.match(csv, /Ask about advising/);
  assert.match(csv, /Verify my major is currently offered/);
  assert.match(csv, /Overall admit rate \(fraction\)/);
});


test("every real projected college exports without profile-only fields", async () => {
  const dataset = JSON.parse(await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"));
  const projected = projectCollegesForClient(dataset.colleges);
  const csv = researchCsv(projected, {}, "https://collegesearch.example");
  assert.equal(csv.split("\r\n").length, projected.length + 1);
  for (const college of projected) {
    assert.ok(csv.includes(csvCell(college.name)));
    assert.ok(csv.includes(csvCell(college.observations.averageNetPrice.periodLabel)));
  }
});
