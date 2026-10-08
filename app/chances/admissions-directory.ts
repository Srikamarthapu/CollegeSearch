import { colleges } from "@/app/lib/college-data";
import { FEATURED_DIRECTORY_UNIT_IDS } from "@/app/lib/college-directory-state";
import {
  ADMISSIONS_SEARCH_LIMIT,
  admissionsSearchResults,
  initialAdmissionsColleges,
  toChancesCollege,
} from "./admissions-record";

const admissionsColleges = colleges.map(toChancesCollege);

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
