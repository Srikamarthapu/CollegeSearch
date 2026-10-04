import styles from "./NegativeNetPriceNote.module.css";

export function NegativeNetPriceNote({ value }: { value: number | null }) {
  if (value === null || value >= 0) return null;
  return (
    <small className={styles.note}>
      For this reported group, grants and scholarships exceeded cost of
      attendance. That does not guarantee a college is free for an individual
      student.
    </small>
  );
}
