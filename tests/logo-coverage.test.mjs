import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  collegeLogoAsset,
  collegeLogoInitials,
} from "../app/components/college-logo-data.mjs";
import logoSourcesFirst from "../data/college-logo-sources-01-25.json" with {
  type: "json",
};
import logoSourcesSecond from "../data/college-logo-sources-26-50.json" with {
  type: "json",
};

const logoSources = [...logoSourcesFirst, ...logoSourcesSecond];
const currentColleges = JSON.parse(
  await readFile(new URL("../data/colleges.json", import.meta.url), "utf8"),
).colleges;
const catalogInstitutions = JSON.parse(
  await readFile(
    new URL("../data/college-catalog.json", import.meta.url),
    "utf8",
  ),
).institutions.map((institution) => ({
  unitId: institution.unitId,
  name: institution.expectedName,
  slug: institution.slug,
}));

test("sourced college marks map to existing local assets", async () => {
  const sourceSlugs = new Set();

  for (const source of logoSources) {
    assert.ok(!sourceSlugs.has(source.slug), `duplicate logo source: ${source.slug}`);
    sourceSlugs.add(source.slug);
    assert.match(source.asset, /^\/college-logos\/[a-z0-9-]+\.(svg|png|jpg)$/);
    assert.match(source.sourceUrl, /^https:\/\//);
    assert.ok(source.usageNote.trim(), `missing usage note: ${source.slug}`);
    assert.equal(collegeLogoAsset(source.slug), source.asset);
    await access(resolve("public", source.asset.slice(1)));
  }

  for (const college of catalogInstitutions) {
    const sourcedAsset = collegeLogoAsset(college.slug);
    if (sourcedAsset) {
      assert.ok(sourceSlugs.has(college.slug));
      await access(resolve("public", sourcedAsset.slice(1)));
    } else {
      assert.ok(collegeLogoInitials(college.name));
    }
  }

  const catalogByUnitId = new Map(
    catalogInstitutions.map((college) => [college.unitId, college]),
  );
  assert.deepEqual(
    currentColleges.map((college) => {
      const catalogCollege = catalogByUnitId.get(college.unitId);
      assert.ok(catalogCollege, `missing catalog college ${college.unitId}`);
      return [catalogCollege.name, catalogCollege.slug];
    }),
    currentColleges.map((college) => [college.name, college.slug]),
    "the reviewed catalog retains existing logo-covered college identities",
  );
  assert.equal(logoSources.length, sourceSlugs.size);
});

test("unsourced colleges receive a text monogram instead of a guessed mark", async () => {
  const component = await readFile(
    new URL("../app/components/CollegeLogo.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../app/components/CollegeLogo.module.css", import.meta.url),
    "utf8",
  );

  assert.equal(collegeLogoAsset("college-without-a-sourced-mark"), null);
  assert.equal(collegeLogoInitials("University of California, Berkeley"), "CB");
  assert.equal(
    collegeLogoInitials("California State University-Bakersfield"),
    "BA",
  );
  assert.equal(
    collegeLogoInitials("California State University-Channel Islands"),
    "CI",
  );
  assert.equal(
    collegeLogoInitials("California State University-San Bernardino"),
    "SB",
  );
  assert.equal(
    collegeLogoInitials("California State Polytechnic University-Humboldt"),
    "HU",
  );
  assert.equal(collegeLogoInitials(""), "C");
  assert.match(component, /collegeLogoAsset\(college\.slug\)/);
  assert.match(component, /collegeLogoInitials\(college\.name\)/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(styles, /\.fallback\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
});
