import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  boundedDeadlineCollegeOptions,
  deadlineCollegeOptionLabel,
  parseCollegeIdentityDirectory,
} from "../app/lib/college-identity-directory.ts";
import type { DirectoryCollegeIdentity } from "../app/lib/college-directory.ts";

const colleges: DirectoryCollegeIdentity[] = [
  { unitId: 1, name: "Alpha College", aliases: ["AC"], city: "Springfield", state: "IL" },
  { unitId: 2, name: "Alpha College", aliases: ["Alpha West"], city: "Springfield", state: "MA" },
  { unitId: 3, name: "Beta University", aliases: ["BU"], city: "Phoenix", state: "AZ", admissionsSourceUrl: "https://beta.example/admissions" },
  ...Array.from({ length: 50 }, (_, index) => ({
    unitId: index + 10,
    name: `School ${String(index).padStart(2, "0")}`,
    aliases: [],
    city: `City ${index}`,
    state: "CA",
  })),
];

test("identity payload parsing rejects partial, duplicate, and unsafe directories", () => {
  const payload = { items: colleges, total: colleges.length, releaseId: "release-1" };
  assert.equal(parseCollegeIdentityDirectory(payload)?.items.length, colleges.length);
  assert.equal(parseCollegeIdentityDirectory({ ...payload, total: colleges.length + 1 }), null);
  assert.equal(parseCollegeIdentityDirectory({ ...payload, items: [...colleges, colleges[0]], total: colleges.length + 1 }), null);
  assert.equal(parseCollegeIdentityDirectory({ ...payload, items: [{ ...colleges[0], admissionsSourceUrl: "javascript:alert(1)" }], total: 1 }), null);
});

test("deadline choices are bounded while retaining saved and selected colleges", () => {
  const options = boundedDeadlineCollegeOptions(colleges, "school", [1, 2], 3);
  assert.deepEqual(options.saved.map((college) => college.unitId), [1, 2]);
  assert.ok(options.other.some((college) => college.unitId === 3));
  assert.equal(options.saved.length + options.other.length, 40);
});

test("deadline search matches aliases and locations and labels duplicate names", () => {
  assert.deepEqual(
    boundedDeadlineCollegeOptions(colleges, "BU", [], null).other.map((college) => college.unitId),
    [3],
  );
  assert.deepEqual(
    boundedDeadlineCollegeOptions(colleges, "Phoenix", [], null).other.map((college) => college.unitId),
    [3],
  );
  assert.equal(deadlineCollegeOptionLabel(colleges[0]), "Alpha College — Springfield, IL");
  assert.equal(deadlineCollegeOptionLabel(colleges[1]), "Alpha College — Springfield, MA");
});

test("the planner page does not serialize the full identity directory on initial render", async () => {
  const page = await readFile(new URL("../app/my-colleges/page.tsx", import.meta.url), "utf8");
  const planner = await readFile(new URL("../app/saved/SavedColleges.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /directoryCollegeIdentities|collegeIdentities=/);
  assert.match(planner, /fetch\("\/api\/colleges\/identities"/);
  assert.match(planner, /identityDirectory\.status === "ready"[\s\S]*<DeadlinePlanner/);
});
