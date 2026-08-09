import { CollegeSearchApp } from "./CollegeCompassApp";
import { colleges } from "./lib/college-data";
import { projectCollegesForClient } from "./lib/college-client-record";

const clientColleges = projectCollegesForClient(colleges);

export default function Home() {
  return <CollegeSearchApp colleges={clientColleges} />;
}
