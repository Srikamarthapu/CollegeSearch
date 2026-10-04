import { getAdviserPublicStatus } from "@/app/lib/adviser/server";
import { CollegeSearchApp } from "./CollegeCompassApp";
import {
  searchCollegeDirectory,
  directoryFacets,
} from "./lib/college-directory";
import { parseDirectoryFilters } from "./lib/college-directory-state";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomePageProps) {
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
    />
  );
}
