import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { broadFieldDefinitions } from "../app/lib/broad-fields.ts";

const datasetBytes = await readFile(new URL("../data/colleges.json", import.meta.url));
const dataset = JSON.parse(datasetBytes.toString("utf8"));
const manifest = JSON.parse(await readFile(new URL("../data/college-catalog.json", import.meta.url), "utf8"));
const marker = JSON.parse(await readFile(new URL("../data/college-knowledge-release.json", import.meta.url), "utf8"));
const releaseId = `sha256:${createHash("sha256").update(datasetBytes).digest("hex")}`;
const scorecardSource = dataset.release.sources.find((source) => source.id === "college-scorecard-institution-2026-06-10");

test("M7 dataset release is pinned to the reviewed federal catalog artifact", () => {
  assert.equal(dataset.release.institutionCount, 3912);
  assert.equal(dataset.colleges.length, 3912);
  assert.equal(manifest.institutions.length, dataset.colleges.length);
  assert.equal(new Set(dataset.colleges.map((college) => college.unitId)).size, dataset.colleges.length);
  assert.equal(new Set(dataset.colleges.map((college) => college.slug)).size, dataset.colleges.length);
  assert.deepEqual(
    Object.fromEntries(["Public", "Private nonprofit", "Private for-profit"].map((ownership) => [
      ownership,
      dataset.colleges.filter((college) => college.ownership === ownership).length,
    ])),
    { Public: 1666, "Private nonprofit": 1486, "Private for-profit": 760 },
  );
  assert.deepEqual(
    Object.fromEntries(["Four-year", "Two-year"].map((level) => [
      level,
      dataset.colleges.filter((college) => college.institutionLevel === level).length,
    ])),
    { "Four-year": 2486, "Two-year": 1426 },
  );
  assert.equal(dataset.colleges.filter((college) => college.mainCampus).length, 3430);
  assert.equal(dataset.colleges.filter((college) => !college.mainCampus).length, 482);
  assert.equal(dataset.colleges.filter((college) => !["PR", "GU", "VI", "AS", "MP"].includes(college.state)).length, 3831);
  assert.equal(dataset.colleges.filter((college) => ["PR", "GU", "VI", "AS", "MP"].includes(college.state)).length, 81);
  assert.equal(scorecardSource.artifactSha256, manifest.source.artifactSha256);
  assert.equal(scorecardSource.artifactUrl, manifest.source.artifactUrl);
  assert.equal(manifest.source.artifactSha256, "f56a181b000ca4914e924c16b6b81dcc656e25aeb2ac68ab7d271ac0f29ffd58");
  assert.equal(marker.releaseId, releaseId);
  assert.match(manifest.selectionRules.currentlyOperatingField, /PEPS as of April 30, 2026/i);
});

test("all 38 federal broad fields preserve source-backed degree and delivery semantics", () => {
  const definitionsByCode = new Map(broadFieldDefinitions.map((definition) => [definition.code, definition]));
  const scorecardSources = new Map(dataset.release.sources.map((source) => [source.id, source]));
  const observedCodes = new Set();
  let majorRows = 0;
  let dualDegreeRows = 0;
  for (const college of dataset.colleges) {
    for (const major of college.majors) {
      majorRows += 1;
      const match = major.sourceField.match(/^PCIP(\d{2}) \+ CIP(\d{2})(BACHL|ASSOC)(?: \+ CIP(\d{2})ASSOC)?$/);
      assert.ok(match, `${college.unitId} ${major.name} has a direct PCIP/CIP field locator`);
      const [, code, firstCode, firstLevel, secondCode] = match;
      assert.equal(code, firstCode);
      if (secondCode) assert.equal(code, secondCode);
      const definition = definitionsByCode.get(code);
      assert.ok(definition, `PCIP${code} is an official mapped broad field`);
      observedCodes.add(code);
      assert.equal(major.name, definition.name);
      assert.equal(major.sourceId, scorecardSource.id);
      assert.ok(scorecardSources.has(major.sourceId));
      assert.equal(major.reportingYear, 2025);
      assert.equal(major.periodLabel, "2024-2025 programs and awards");
      assert.equal(major.finality, "provisional");
      assert.ok(major.cohort.includes("IPEDS 2024-2025 awards"));
      assert.ok(Number.isFinite(major.share) && major.share >= 0 && major.share <= 1);
      assert.equal(typeof major.bachelorsAvailable, "boolean");
      assert.equal(typeof major.associatesAvailable, "boolean");
      assert.ok(major.bachelorsAvailable || major.associatesAvailable);

      const expectedLevel = major.bachelorsAvailable && major.associatesAvailable
        ? "bachelors-and-associate"
        : major.bachelorsAvailable ? "bachelors" : "associate";
      assert.equal(major.degreeLevel, expectedLevel);
      const expectedLocator = [
        `PCIP${code}`,
        ...(major.bachelorsAvailable ? [`CIP${code}BACHL`] : []),
        ...(major.associatesAvailable ? [`CIP${code}ASSOC`] : []),
      ].join(" + ");
      assert.equal(major.sourceField, expectedLocator);
      assert.ok(major.sourceField.includes(firstLevel === "BACHL" ? "BACHL" : "ASSOC"));

      if (major.bachelorsAvailable && major.associatesAvailable) dualDegreeRows += 1;
      const includesDistance = major.deliveryMode === "includes-distance-program";
      assert.ok(["delivery-not-specified", "includes-distance-program"].includes(major.deliveryMode));
      if (includesDistance) {
        assert.match(major.evidence, /includes a distance-learning program/i);
        assert.match(major.definition, /at least one reported program/i);
        assert.match(major.definition, /does not show that every program/i);
      } else {
        assert.match(major.definition, /does not establish delivery mode/i);
      }
      assert.match(major.definition, /share of all institution-wide awards/i);
      assert.match(major.definition, /not a major-specific admission rate/i);
    }
  }
  assert.equal(definitionsByCode.size, 38);
  assert.deepEqual([...observedCodes].sort(), [...definitionsByCode.keys()].sort());
  assert.equal(majorRows, 47175);
  assert.equal(dualDegreeRows, 3920);
});
