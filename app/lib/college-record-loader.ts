import { readFile } from "node:fs/promises";
import path from "node:path";
import recordManifest from "@/data/college-records/manifest.json";
import type { College, CollegeDataset } from "./college-data";

type CollegeRecordManifest = {
  schemaVersion: 1;
  releaseId: string;
  cacheVersion: string;
  release: CollegeDataset["release"];
  colleges: Array<{ unitId: number; slug: string; catalogCategory: College["catalogCategory"] }>;
};

const manifest = recordManifest as CollegeRecordManifest;
const unitIds = new Set<number>(manifest.colleges.map(({ unitId }) => unitId));
const unitIdBySlug = new Map(manifest.colleges.map((college) => [college.slug, college.unitId]));
const maxCachedRecords = 16;
const maxCachedBytes = 2 * 1024 * 1024;
const cache = new Map<number, { college: College; bytes: number }>();
const inFlight = new Map<number, Promise<{ college: College; bytes: number }>>();
let cachedBytes = 0;

export const collegeRecordManifest = manifest;

function readCached(unitId: number) {
  const cached = cache.get(unitId);
  if (!cached) return null;
  cache.delete(unitId);
  cache.set(unitId, cached);
  return cached.college;
}

function retain(unitId: number, record: { college: College; bytes: number }) {
  if (record.bytes > maxCachedBytes) return;
  const previous = cache.get(unitId);
  if (previous) {
    cachedBytes -= previous.bytes;
    cache.delete(unitId);
  }
  while (cache.size >= maxCachedRecords || cachedBytes + record.bytes > maxCachedBytes) {
    const oldestId = cache.keys().next().value;
    if (oldestId === undefined) break;
    const oldest = cache.get(oldestId);
    if (oldest) cachedBytes -= oldest.bytes;
    cache.delete(oldestId);
  }
  cache.set(unitId, record);
  cachedBytes += record.bytes;
}

async function readCollege(unitId: number): Promise<{ college: College; bytes: number }> {
  const raw = await readFile(path.join(process.cwd(), "data", "college-records", `${unitId}.json`), "utf8");
  const payload = JSON.parse(raw) as {
    schemaVersion?: unknown;
    releaseId?: unknown;
    cacheVersion?: unknown;
    college?: unknown;
  };
  if (payload.schemaVersion !== manifest.schemaVersion || payload.releaseId !== manifest.releaseId ||
      payload.cacheVersion !== manifest.cacheVersion ||
      !payload.college || typeof payload.college !== "object" || Array.isArray(payload.college)) {
    throw new Error(`College record ${unitId} does not match the current release.`);
  }
  const college = payload.college as College;
  if (college.unitId !== unitId || !college.slug || unitIdBySlug.get(college.slug) !== unitId) {
    throw new Error(`College record ${unitId} has an invalid identity.`);
  }
  return { college, bytes: Buffer.byteLength(raw) };
}

async function loadCollege(unitId: number): Promise<College | null> {
  if (!Number.isSafeInteger(unitId) || !unitIds.has(unitId)) return null;
  const cached = readCached(unitId);
  if (cached) return cached;
  let pending = inFlight.get(unitId);
  if (!pending) {
    pending = readCollege(unitId);
    inFlight.set(unitId, pending);
  }
  try {
    const record = await pending;
    retain(unitId, record);
    return record.college;
  } finally {
    if (inFlight.get(unitId) === pending) inFlight.delete(unitId);
  }
}

export async function collegeBySlug(slug: string): Promise<College | null> {
  if (typeof slug !== "string") return null;
  const unitId = unitIdBySlug.get(slug);
  return unitId === undefined ? null : loadCollege(unitId);
}

export function selectCollegeRecordUnitIds(requested: readonly number[]): number[] {
  const selected: number[] = [];
  const seen = new Set<number>();
  for (const unitId of requested) {
    if (!Number.isSafeInteger(unitId) || !unitIds.has(unitId) || seen.has(unitId)) continue;
    seen.add(unitId);
    selected.push(unitId);
    if (selected.length === 4) break;
  }
  return selected;
}

export async function collegesByUnitIds(requested: readonly number[]): Promise<College[]> {
  const selected = selectCollegeRecordUnitIds(requested);
  const colleges = await Promise.all(selected.map(loadCollege));
  return colleges.filter((college): college is College => Boolean(college));
}
