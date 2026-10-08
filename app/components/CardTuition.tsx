import { formatObservation, type ClientCollege } from "@/app/lib/college-client-record";
import { cardTuitionMetrics } from "@/app/lib/tuition-labels";
import styles from "./CardTuition.module.css";

export function CardTuition({ college }: { college: Pick<ClientCollege, "ownership" | "costs"> }) {
  return <dl className={styles.prices} aria-label="Annual tuition before aid">
    {cardTuitionMetrics(college).map(({ label, observation }, index) => <div
      className={index === 0 ? styles.primary : styles.secondary}
      key={label}
    >
      <dt>{college.ownership === "Public" ? label : "Tuition"} <span>/ year</span></dt>
      <dd>
        <strong>{formatObservation(observation)}</strong>
        <span>{observation.periodLabel}</span>
      </dd>
    </div>)}
  </dl>;
}
