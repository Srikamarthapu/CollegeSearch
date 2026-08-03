import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT =
  "https://admission.universityofcalifornia.edu/campuses-majors";

const localIsoDate = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const campuses = [
  { slug: "berkeley", campus: "Berkeley", unitId: 110635, name: "University of California-Berkeley" },
  { slug: "davis", campus: "Davis", unitId: 110644, name: "University of California-Davis" },
  { slug: "irvine", campus: "Irvine", unitId: 110653, name: "University of California-Irvine" },
  { slug: "ucla", campus: "Los Angeles", unitId: 110662, name: "University of California-Los Angeles" },
  { slug: "merced", campus: "Merced", unitId: 445188, name: "University of California-Merced" },
  { slug: "riverside", campus: "Riverside", unitId: 110671, name: "University of California-Riverside" },
  { slug: "san-diego", campus: "San Diego", unitId: 110680, name: "University of California-San Diego" },
  { slug: "santa-barbara", campus: "Santa Barbara", unitId: 110705, name: "University of California-Santa Barbara" },
  { slug: "santa-cruz", campus: "Santa Cruz", unitId: 110714, name: "University of California-Santa Cruz" },
];

function integerStat(html, label) {
  const pattern = new RegExp(
    `<p[^>]*>\\s*${label}:?\\s*</p>\\s*<p[^>]*class="[^"]*stat[^"]*"[^>]*>([\\d,]+)`,
    "i",
  );
  const value = html.match(pattern)?.[1];
  return value ? Number(value.replaceAll(",", "")) : null;
}

function percentageStat(html, label) {
  const pattern = new RegExp(
    `<p[^>]*>\\s*${label}:?\\s*</p>\\s*<p[^>]*class="[^"]*stat[^"]*"[^>]*>([\\d.]+)`,
    "i",
  );
  const value = html.match(pattern)?.[1];
  return value ? Number(value) : null;
}

async function fetchCampus(identity) {
  const sourceUrl = `${SOURCE_ROOT}/${identity.slug}/first-year-admit-data.html`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `UC ${identity.campus} admissions page failed (${response.status}).`,
    );
  }

  const html = await response.text();
  const sourceSha256 = createHash("sha256").update(html).digest("hex");
  const fall = Number(
    html.match(/snapshot of the admitted first-year class for fall (\d{4})/i)?.[1],
  );
  const applicants = integerStat(html, "Applicants");
  const admits = integerStat(html, "Admits");
  const publishedAdmitRate = percentageStat(html, "Overall admit rate");

  if (
    !Number.isInteger(fall) ||
    !Number.isInteger(applicants) ||
    !Number.isInteger(admits) ||
    !Number.isFinite(publishedAdmitRate) ||
    applicants <= 0 ||
    admits <= 0 ||
    admits > applicants
  ) {
    throw new Error(`UC ${identity.campus} snapshot is incomplete or invalid.`);
  }

  const admitRate = admits / applicants;
  const roundedRate = Math.round(admitRate * 1000) / 10;
  if (Math.abs(roundedRate - publishedAdmitRate) > 0.05) {
    throw new Error(
      `UC ${identity.campus} rate does not match its official published rate.`,
    );
  }

  return {
    ...identity,
    fall,
    applicants,
    admits,
    admitRate,
    publishedAdmitRate,
    sourceUrl,
    sourceSha256,
  };
}

const observations = (await Promise.all(campuses.map(fetchCampus))).sort(
  (left, right) => left.unitId - right.unitId,
);
const reportingYears = new Set(observations.map((campus) => campus.fall));

if (observations.length !== campuses.length || reportingYears.size !== 1) {
  throw new Error("UC campus snapshots are missing or use mixed reporting years.");
}

const reportingYear = observations[0].fall;
const output = {
  release: {
    id: `uc-admissions-fall-${reportingYear}-snapshots`,
    publisher: "University of California",
    sourceName: `UC Admissions Fall ${reportingYear} campus snapshots`,
    sourceUrl: `${SOURCE_ROOT}/`,
    sourceUrls: observations.map((campus) => campus.sourceUrl),
    sourceHashes: observations.map(({ sourceUrl, sourceSha256 }) => ({
      sourceUrl,
      sha256: sourceSha256,
    })),
    reportingYear,
    cohort: `Fall ${reportingYear} first-year admission snapshot`,
    finality: "snapshot",
    sourceField: "Applicants, admits, and overall admit rate",
    accessedOn:
      process.env.SOURCE_ACCESSED_ON ||
      localIsoDate(),
    notes:
      "These campus snapshots publish applicants and admits, but not enrollees. Finalized enrollment and yield remain attached to the prior UC Accountability cohort.",
  },
  campuses: observations,
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const archivePath = resolve(
  scriptDirectory,
  `../data/uc-admissions-${reportingYear}.json`,
);
const latestPath = resolve(scriptDirectory, "../data/uc-admissions-latest.json");
await mkdir(dirname(archivePath), { recursive: true });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
await Promise.all([
  writeFile(archivePath, serialized),
  writeFile(latestPath, serialized),
]);

console.log(
  `Imported ${observations.length} UC Fall ${reportingYear} campus snapshots to ${latestPath}.`,
);
