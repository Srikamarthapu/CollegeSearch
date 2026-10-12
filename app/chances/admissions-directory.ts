import { FEATURED_DIRECTORY_UNIT_IDS } from "@/app/lib/college-directory-state";
import admissionsDirectory from "@/data/college-admissions-directory.json";
import { COLLEGE_DIRECTORY_CACHE_VERSION } from "@/app/lib/college-directory-cache-version";
import {
  ADMISSIONS_SEARCH_LIMIT,
  admissionsSearchResults,
  initialAdmissionsColleges,
  type ChancesCollege,
} from "./admissions-record";

const admissionsColleges = admissionsDirectory.colleges as ChancesCollege[];
if (admissionsDirectory.cacheVersion !== COLLEGE_DIRECTORY_CACHE_VERSION) {
  throw new Error(
    "The generated admissions directory is stale. Run scripts/build-college-directory-artifact.mjs.",
  );
}

export function searchAdmissionsColleges(query: string) {
  return admissionsSearchResults(
    admissionsColleges,
    query,
    FEATURED_DIRECTORY_UNIT_IDS,
    ADMISSIONS_SEARCH_LIMIT,
  );
}

export function initialAdmissionsDirectory(requestedIds: readonly number[]) {
  return initialAdmissionsColleges(
    admissionsColleges,
    requestedIds,
    FEATURED_DIRECTORY_UNIT_IDS,
  );
}
