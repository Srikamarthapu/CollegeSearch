import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import styles from "../update-password/auth-page.module.css";

export default function AuthCodeErrorPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="auth-error-title">
        <span className={styles.icon} aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <span className={styles.eyebrow}>Account link</span>
        <h1 id="auth-error-title">That sign-in link did not work.</h1>
        <p>
          It may have expired or already been used. Return to CollegeSearch and
          request a fresh link or try signing in again.
        </p>
        <Link className={styles.primaryLink} href="/">
          <ArrowLeft size={17} aria-hidden="true" />
          Return to CollegeSearch
        </Link>
      </section>
    </main>
  );
}
