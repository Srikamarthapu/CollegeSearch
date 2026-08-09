import type { Metadata } from "next";

import { AccountPageClient } from "./AccountPageClient";

export const metadata: Metadata = {
  title: "Account | CollegeSearch",
  description: "Review the authentication status for this CollegeSearch deployment.",
};

export default function AccountPage() {
  return <AccountPageClient />;
}
