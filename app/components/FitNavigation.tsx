import Link from "next/link";
import styles from "@/app/adviser/adviser.module.css";

export function FitNavigation({ active }: { active: "preferences" | "adviser" }) {
  return <div className={styles.fitNavigationShell}><nav className={styles.fitNavigation} aria-label="Find my fit tools">
    <Link href="/match" aria-current={active === "preferences" ? "page" : undefined}>Preference match</Link>
    <Link href="/adviser" aria-current={active === "adviser" ? "page" : undefined}>College adviser</Link>
  </nav></div>;
}
