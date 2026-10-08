import { formatObservation, type ClientCollege } from "@/app/lib/college-client-record";
import {
  cardTuitionMetrics,
  hasReliableSingleTuitionRate,
  primaryTuitionMetric,
} from "@/app/lib/tuition-labels";
import styles from "./CardTuition.module.css";

export function CardTuition({ college }: { college: Pick<ClientCollege, "ownership" | "costs"> }) {
  const hasSingleRate = hasReliableSingleTuitionRate(college);
  const metrics = hasSingleRate
    ? [primaryTuitionMetric(college)]
    : cardTuitionMetrics(college);

  return <dl className={styles.prices} aria-label="Annual tuition before aid">
    {metrics.map(({ label, observation }, index) => <div
      className={index === 0 ? styles.primary : styles.secondary}
      key={label}
    >
      <dt>{hasSingleRate ? "Tuition" : label} <span>/ year</span></dt>
      <dd>
        <strong>{formatObservation(observation)}</strong>
        <span>{hasSingleRate && college.ownership === "Public"
          ? `In-state & out-of-state · ${observation.periodLabel}`
          : observation.periodLabel}</span>
      </dd>
    </div>)}
  </dl>;
}
