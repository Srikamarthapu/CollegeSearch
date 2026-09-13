import type { Metadata } from "next";

import { colleges } from "@/app/lib/college-data";
import { projectCollegesForClient } from "@/app/lib/college-client-record";
import { SavedColleges } from "./SavedColleges";

const clientColleges = projectCollegesForClient(colleges);

export const metadata: Metadata = {
  title: "Saved colleges | CollegeSearch",
  description: "Review, sync, and compare your saved colleges.",
};

export default function SavedPage() {
  return <SavedColleges colleges={clientColleges} />;
}
