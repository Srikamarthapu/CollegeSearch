import type { DirectoryCollegeIdentity } from "./college-directory";

export type CollegeIdentityDirectory = {
  items: DirectoryCollegeIdentity[];
  releaseId: string;
  total: number;
};

function optionalHttpUrl(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseCollegeIdentityDirectory(value: unknown): CollegeIdentityDirectory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(payload.total) ||
    Number(payload.total) < 1 ||
    typeof payload.releaseId !== "string" ||
    payload.releaseId.length < 1 ||
    !Array.isArray(payload.items) ||
    payload.items.length !== payload.total
  ) return null;

  const ids = new Set<number>();
  const items: DirectoryCollegeIdentity[] = [];
  for (const item of payload.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const college = item as Record<string, unknown>;
    if (
      !Number.isSafeInteger(college.unitId) ||
      Number(college.unitId) <= 0 ||
      ids.has(Number(college.unitId)) ||
      typeof college.name !== "string" ||
      !college.name ||
      !Array.isArray(college.aliases) ||
      college.aliases.some((alias) => typeof alias !== "string") ||
      typeof college.city !== "string" ||
      !college.city ||
      typeof college.state !== "string" ||
      !college.state ||
      !optionalHttpUrl(college.deadlineSourceUrl) ||
      !optionalHttpUrl(college.admissionsSourceUrl)
    ) return null;
    ids.add(Number(college.unitId));
    items.push(college as DirectoryCollegeIdentity);
  }
  return { items, total: Number(payload.total), releaseId: payload.releaseId };
}

function normalizedSearch(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function boundedDeadlineCollegeOptions(
  colleges: readonly DirectoryCollegeIdentity[],
  query: string,
  savedCollegeIds: readonly number[],
  selectedCollegeId: number | null,
  limit = 40,
) {
  const savedIds = new Set(savedCollegeIds);
  const retainedIds = new Set(savedCollegeIds);
  if (selectedCollegeId) retainedIds.add(selectedCollegeId);
  const term = normalizedSearch(query).slice(0, 100);
  const ranked = colleges
    .filter((college) => {
      if (retainedIds.has(college.unitId) || !term) return true;
      return [college.name, ...college.aliases, college.city, college.state]
        .some((value) => normalizedSearch(value).includes(term));
    })
    .sort((a, b) => {
      const aName = normalizedSearch(a.name);
      const bName = normalizedSearch(b.name);
      const aRank = term && aName.startsWith(term) ? 0 : term && a.aliases.some((alias) => normalizedSearch(alias).startsWith(term)) ? 1 : 2;
      const bRank = term && bName.startsWith(term) ? 0 : term && b.aliases.some((alias) => normalizedSearch(alias).startsWith(term)) ? 1 : 2;
      return aRank - bRank || a.name.localeCompare(b.name) || a.unitId - b.unitId;
    });
  const retained = ranked.filter((college) => retainedIds.has(college.unitId));
  const remainingLimit = Math.max(0, limit - retained.length);
  const visible = [
    ...retained,
    ...ranked.filter((college) => !retainedIds.has(college.unitId)).slice(0, remainingLimit),
  ];
  return {
    saved: visible.filter((college) => savedIds.has(college.unitId)),
    other: visible.filter((college) => !savedIds.has(college.unitId)),
  };
}

export function deadlineCollegeOptionLabel(college: DirectoryCollegeIdentity) {
  return `${college.name} — ${college.city}, ${college.state}`;
}
