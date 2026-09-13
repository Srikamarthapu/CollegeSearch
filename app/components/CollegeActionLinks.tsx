import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { collegeActions } from "@/app/lib/college-actions";
import styles from "./CollegeActionLinks.module.css";

export function CollegeActionLinks({ unitId }: { unitId: number }) {
  const actions = collegeActions(unitId);
  if (!actions) return null;
  return (
    <section className={styles.section} aria-labelledby="college-next-steps">
      <div className={styles.heading}>
        <div><span>Next steps · Official resources</span><h2 id="college-next-steps">Turn your research into a plan.</h2></div>
        <Link href="/plan">My deadlines <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
      <div className={styles.links}>
        {Object.entries(actions).map(([key, action]) => (
          <article key={key}>
            {action.status === "verified" && action.url ? <a href={action.url} target="_blank" rel="noreferrer">{action.label}<ArrowUpRight size={18} aria-hidden="true" /></a> : <strong>{action.label}</strong>}
            <small>{action.status === "verified" ? `Link checked ${action.checkedOn}` : "Link could not be verified"}</small>
            {action.note ? <p>{action.note}</p> : null}
            {key === "netPriceCalculator" ? <p>Check the aid year and eligibility. A calculator gives an estimate, not an aid offer.</p> : null}
            <a className={styles.source} href={action.publisherSourceUrl} target="_blank" rel="noreferrer">College source page</a>
          </article>
        ))}
      </div>
      <p className={styles.note}>Links were checked for availability and purpose. Confirm your application cycle, applicant type, program, and deadline directly with the college before adding a date.</p>
    </section>
  );
}
