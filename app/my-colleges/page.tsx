import type { Metadata } from "next";
import { colleges } from "@/app/lib/college-data";
import { collegeActions } from "@/app/lib/college-actions";
import { projectCollegesForClient } from "@/app/lib/college-client-record";
import { SavedColleges } from "@/app/saved/SavedColleges";

export const metadata: Metadata = {
  title: "My colleges | CollegeSearch",
  description: "Keep your saved colleges, research notes, and application deadlines together.",
};

const clientColleges = projectCollegesForClient(colleges);
const deadlineColleges = colleges.map(({ unitId, name }) => {
  const actions = collegeActions(unitId);
  return {
    unitId,
    name,
    deadlineSourceUrl: actions?.deadlines.status === "verified" ? actions.deadlines.url : undefined,
    admissionsSourceUrl: actions?.admissions.status === "verified" ? actions.admissions.url : undefined,
  };
});

export default function MyCollegesPage() {
  return <SavedColleges colleges={clientColleges} deadlineColleges={deadlineColleges} />;
}
