import type { Metadata } from "next";
import { directoryCollegeIdentities } from "@/app/lib/college-directory";
import { SavedColleges } from "@/app/saved/SavedColleges";

export const metadata: Metadata = {
  title: "My colleges | CollegeSearch",
  description: "Keep your saved colleges, research notes, and application deadlines together.",
};

const collegeIdentities = directoryCollegeIdentities();

export default function MyCollegesPage() {
  return <SavedColleges collegeIdentities={collegeIdentities} />;
}
