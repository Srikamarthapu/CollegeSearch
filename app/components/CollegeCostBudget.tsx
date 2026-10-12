import costOverrides from "@/data/college-cost-overrides.json";
import type { College } from "@/app/lib/college-data";
import styles from "./CollegeCostBudget.module.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CollegeCostBudget({ college }: { college: College }) {
  const record = costOverrides.colleges.find((item) => item.unitId === college.unitId);
  if (!record) return (
    <p className={styles.unavailable}>
      Tuition covers instruction. The separate fees below do not include housing, meals, books or travel.
      A complete attendance budget has not been independently reviewed for this college. {" "}
      <a href={college.website} target="_blank" rel="noreferrer">Check the college’s current cost of attendance</a> before planning your budget.
    </p>
  );
  const { budget } = record;
  const fees = record.costs.feesOutOfState.value;
  const tuition = record.costs.tuitionOutOfState.value;
  return (
    <section className={styles.budget} aria-labelledby="annual-budget-heading">
      <div className={styles.intro}>
        <span className={styles.eyebrow}>2026–2027 · Before financial aid</span>
        <h3 id="annual-budget-heading">Plan for the whole year</h3>
        <p>{budget.title}</p>
        <div className={styles.total}>
          <span>{budget.nonresidentSupplement ? "In-state attendance budget" : "Standard attendance budget"}</span>
          <strong>{money.format(budget.total)}{!budget.nonresidentSupplement && <small> + travel</small>}</strong>
          {budget.nonresidentSupplement && <span>Out-of-state: <b>{money.format(budget.total + budget.nonresidentSupplement)}</b></span>}
        </div>
        <a href={budget.sourceUrl} target="_blank" rel="noreferrer">View the official budget ↗</a>
      </div>
      <div>
        <dl className={styles.rows}>
          {budget.rows.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money.format(Number(amount))}</dd></div>)}
        </dl>
        <p className={styles.subtotal}>{college.ownership === "Public" ? "Out-of-state tuition + required fees" : "Tuition + student fees allowance"}: <strong>{money.format(tuition + fees)}</strong> / academic year. This tuition-and-fee subtotal excludes living expenses; the attendance budget includes the listed living costs.</p>
      </div>
      <p className={styles.notes}>{budget.notes} <span>Official pages checked {costOverrides.reviewedOn}.</span></p>
    </section>
  );
}
