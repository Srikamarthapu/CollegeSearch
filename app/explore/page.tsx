import { getAdviserPublicStatus } from "@/app/lib/adviser/server";
import { CollegeSearchApp } from "@/app/CollegeCompassApp";
import {
  searchCollegeDirectory,
  directoryFacets,
} from "@/app/lib/college-directory";
import { parseDirectoryFilters } from "@/app/lib/college-directory-state";

type ExplorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (typeof value === "string") params.set(key, value);
  }
  const initialFilters = parseDirectoryFilters(params, directoryFacets());
  const initialPage = searchCollegeDirectory({
    filters: initialFilters,
    selectedIds: (params.get("compare") ?? "").split(",").map(Number),
  });
  return (
    <CollegeSearchApp
      initialPage={initialPage}
      initialFilters={initialFilters}
      adviserAvailable={getAdviserPublicStatus().available}
      mode="explore"
    />
  );
}
