import { CollegeSearchApp } from "@/app/CollegeCompassApp";
import { colleges } from "@/app/lib/college-data";
import { projectCollegesForClient } from "@/app/lib/college-client-record";

const clientColleges = projectCollegesForClient(colleges);

export default function ExplorePage() {
  return <CollegeSearchApp colleges={clientColleges} mode="explore" />;
}
