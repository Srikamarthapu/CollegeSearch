import type { Metadata } from "next";

import { colleges } from "@/app/lib/college-data";
import { projectCollegesForClient } from "@/app/lib/college-client-record";
import { SavedColleges } from "./SavedColleges";

const clientColleges = projectCollegesForClient(colleges);

export const metadata: Metadata = {
  title: "Saved colleges | CollegeSearch",
  description: "Review and compare the colleges saved on this device.",
};

export default function SavedPage() {
  return <SavedColleges colleges={clientColleges} />;
}
