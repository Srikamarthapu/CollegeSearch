import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const SOURCE_PAGE =
  "https://accountability.universityofcalifornia.edu/2026/chapters/chapter-2.html";
const SOURCE_URL =
  "https://accountability.universityofcalifornia.edu/2026/documents/data-tables/chapter02data2026.xlsx";
const SOURCE_SHEET = "2.1.1";
const REPORTING_YEAR = 2025;
const localIsoDate = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const campuses = new Map([
  ["Berkeley", { unitId: 110635, name: "University of California-Berkeley" }],
  ["Davis", { unitId: 110644, name: "University of California-Davis" }],
  ["Irvine", { unitId: 110653, name: "University of California-Irvine" }],
  ["Los Angeles", { unitId: 110662, name: "University of California-Los Angeles" }],
  ["Merced", { unitId: 445188, name: "University of California-Merced" }],
  ["Riverside", { unitId: 110671, name: "University of California-Riverside" }],
  ["San Diego", { unitId: 110680, name: "University of California-San Diego" }],
  ["Santa Barbara", { unitId: 110705, name: "University of California-Santa Barbara" }],
  ["Santa Cruz", { unitId: 110714, name: "University of California-Santa Cruz" }],
]);

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function parseAttributes(tag) {
  return Object.fromEntries(
    Array.from(tag.matchAll(/([\w:.-]+)="([^"]*)"/g), ([, key, value]) => [
      key,
      decodeXml(value),
    ]),
  );
}

function parseSharedStrings(xml) {
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), ([, item]) =>
    Array.from(item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), ([, text]) =>
      decodeXml(text),
    ).join(""),
  );
}

function parseWorkbookSheetPath(files, sheetName) {
  const workbookXml = strFromU8(files["xl/workbook.xml"]);
  const sheetTag = Array.from(workbookXml.matchAll(/<sheet\b[^>]*\/?>/g))
    .map(([tag]) => ({ tag, attributes: parseAttributes(tag) }))
    .find(({ attributes }) => attributes.name === sheetName);

  if (!sheetTag) {
    throw new Error(`UC workbook does not contain sheet ${sheetName}.`);
  }

  const relationshipsXml = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const relationship = Array.from(
    relationshipsXml.matchAll(/<Relationship\b[^>]*\/?>/g),
  )
    .map(([tag]) => parseAttributes(tag))
    .find((attributes) => attributes.Id === sheetTag.attributes["r:id"]);

  if (!relationship) {
    throw new Error(`Could not resolve sheet ${sheetName} in UC workbook.`);
  }

  const target = relationship.Target.replace(/^\/?xl\//, "");
  return `xl/${target}`;
}

function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? "";
  return [...letters].reduce(
    (index, letter) => index * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];

  for (const [, rowXml] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];

    for (const cellMatch of rowXml.matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
    )) {
      const attributes = parseAttributes(`<c ${cellMatch[1]}>`);
      const cellXml = cellMatch[2];
      const index = columnIndex(attributes.r);
      const rawValue = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inlineValue = Array.from(
        cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g),
        ([, value]) => decodeXml(value),
      ).join("");

      let value = null;
      if (attributes.t === "s" && rawValue !== undefined) {
        value = sharedStrings[Number(rawValue)] ?? null;
      } else if (attributes.t === "inlineStr") {
        value = inlineValue;
      } else if (rawValue !== undefined) {
        const numeric = Number(rawValue);
        value = Number.isFinite(numeric) ? numeric : decodeXml(rawValue);
      }

      row[index - 1] = value;
    }

    rows.push(row);
  }

  return rows;
}

function validateCounts({ campus, applicants, admits, enrollees }) {
  for (const [label, value] of Object.entries({ applicants, admits, enrollees })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid ${label} count for UC ${campus}.`);
    }
  }

  if (admits > applicants || enrollees > admits) {
    throw new Error(`UC ${campus} admissions counts are internally inconsistent.`);
  }
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`UC Accountability workbook request failed (${response.status}).`);
}

const workbookBytes = new Uint8Array(await response.arrayBuffer());
const files = unzipSync(workbookBytes);
const sharedStrings = files["xl/sharedStrings.xml"]
  ? parseSharedStrings(strFromU8(files["xl/sharedStrings.xml"]))
  : [];
const sheetPath = parseWorkbookSheetPath(files, SOURCE_SHEET);
const sheetXml = files[sheetPath];

if (!sheetXml) {
  throw new Error(`UC workbook sheet file ${sheetPath} is missing.`);
}

const rows = parseWorksheet(strFromU8(sheetXml), sharedStrings);
const headerIndex = rows.findIndex(
  (row) =>
    row[0] === "Campus" &&
    row[1] === "Fall" &&
    row[2] === "Fall Applicants" &&
    row[3] === "Fall Admits" &&
    row[4] === "Fall Enrollees",
);

if (headerIndex < 0) {
  throw new Error("UC admissions table header was not found.");
}

const observations = rows
  .slice(headerIndex + 1)
  .filter(
    (row) =>
      campuses.has(row[0]) &&
      row[1] === REPORTING_YEAR &&
      row.slice(2, 5).every(Number.isFinite),
  )
  .map((row) => {
    const [campus, fall, applicants, admits, enrollees] = row;
    const identity = campuses.get(campus);
    validateCounts({ campus, applicants, admits, enrollees });

    return {
      ...identity,
      campus,
      fall,
      applicants,
      admits,
      enrollees,
      admitRate: admits / applicants,
      yieldRate: enrollees / admits,
    };
  })
  .sort((a, b) => a.unitId - b.unitId);

if (observations.length !== campuses.size) {
  throw new Error(
    `Expected ${campuses.size} UC campuses; found ${observations.length}.`,
  );
}

const output = {
  release: {
    id: "uc-accountability-2026-chapter-2",
    publisher: "University of California",
    sourceName: "UC Accountability Report 2026 — Chapter 2 data tables",
    sourcePage: SOURCE_PAGE,
    sourceUrl: SOURCE_URL,
    sourceSheet: SOURCE_SHEET,
    reportingYear: REPORTING_YEAR,
    cohort: "Fall 2025 freshman applicants",
    finality: "finalized",
    sourceField:
      "Derived admit rate: Fall Admits divided by Fall Applicants",
    accessedOn:
      process.env.SOURCE_ACCESSED_ON ||
      localIsoDate(),
    workbookSha256: createHash("sha256").update(workbookBytes).digest("hex"),
    notes:
      "Campus rows are application-level counts. Universitywide counts are unduplicated and should not be summed from campus rows.",
  },
  campuses: observations,
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../data/uc-admissions-2025.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(
  `Imported ${observations.length} UC campuses from ${SOURCE_SHEET} to ${outputPath}.`,
);
