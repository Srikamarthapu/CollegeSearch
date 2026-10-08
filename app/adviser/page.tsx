import type { Metadata } from "next";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SiteFooter } from "@/app/components/SiteFooter";
import { FitNavigation } from "@/app/components/FitNavigation";
import { getAdviserPublicStatus } from "@/app/lib/adviser/server";
import { AdviserWorkspace } from "./AdviserWorkspace";
import styles from "./adviser.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "College adviser · CollegeSearch",
  description: "Talk through college preferences with source-linked research, clear cost context and private conversation history.",
};
export default function AdviserPage() {
  return <><SiteHeader /><main id="main-content" className={`page-shell ${styles.page}`}>
    <FitNavigation active="adviser" />
    <header className={styles.heading}><span className={styles.eyebrow}>FIND MY FIT</span>
      <h1>Talk through your college options.</h1>
      <p>Start with what matters to you. Build a research list with clear reasons, trade-offs and sources you can check.</p>
    </header>
    <AdviserWorkspace availability={getAdviserPublicStatus()} />
  </main><SiteFooter /></>;
}
