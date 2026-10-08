import type { Metadata } from "next";
import { SavedColleges } from "@/app/saved/SavedColleges";

export const metadata: Metadata = {
  title: "My colleges | CollegeSearch",
  description: "Keep your saved colleges, research notes, and application deadlines together.",
};

export default function MyCollegesPage() {
  return <SavedColleges />;
}
