import { BrandMark } from "./components/BrandMark";
import styles from "./loading.module.css";

const navigationWidths = ["wide", "medium", "wide", "short", "medium"] as const;

export default function Loading() {
  return (
    <div className={styles.screen}>
      <p className={styles.srOnly} role="status">
        Loading CollegeSearch...
      </p>

      <header className={styles.header} aria-hidden="true">
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <BrandMark />
          </div>

          <div className={styles.navigation}>
            {navigationWidths.map((width, index) => (
              <span
                className={`${styles.navPlaceholder} ${styles[width]}`}
                key={`${width}-${index}`}
              />
            ))}
          </div>

          <span className={styles.accountPlaceholder} />
        </div>
      </header>

      <main id="main-content" className={styles.main} aria-hidden="true">
        <section className={styles.intro}>
          <div className={styles.introCopy}>
            <span className={`${styles.skeleton} ${styles.eyebrow}`} />
            <div className={styles.titleLines}>
              <span className={`${styles.skeleton} ${styles.titleLine}`} />
              <span className={`${styles.skeleton} ${styles.titleLine} ${styles.titleLineShort}`} />
            </div>
            <div className={styles.descriptionLines}>
              <span className={`${styles.skeleton} ${styles.descriptionLine}`} />
              <span className={`${styles.skeleton} ${styles.descriptionLine}`} />
              <span className={`${styles.skeleton} ${styles.descriptionLine} ${styles.descriptionLineShort}`} />
            </div>
            <div className={styles.actionPlaceholders}>
              <span className={`${styles.skeleton} ${styles.actionPrimary}`} />
              <span className={`${styles.skeleton} ${styles.actionSecondary}`} />
            </div>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureHeading}>
              <span className={`${styles.skeleton} ${styles.featureIcon}`} />
              <span className={`${styles.skeleton} ${styles.featureKicker}`} />
            </div>
            <span className={`${styles.skeleton} ${styles.featureTitle}`} />
            <span className={`${styles.skeleton} ${styles.featureTitle} ${styles.featureTitleShort}`} />
            <div className={styles.featureRows}>
              <div className={styles.featureRow}>
                <span className={`${styles.skeleton} ${styles.featureDot}`} />
                <span className={`${styles.skeleton} ${styles.featureRowLine}`} />
              </div>
              <div className={styles.featureRow}>
                <span className={`${styles.skeleton} ${styles.featureDot}`} />
                <span className={`${styles.skeleton} ${styles.featureRowLine} ${styles.featureRowLineShort}`} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.workspace}>
          <div className={styles.toolbarHeading}>
            <span className={`${styles.skeleton} ${styles.toolbarLabel}`} />
            <span className={`${styles.skeleton} ${styles.toolbarHint}`} />
          </div>
          <div className={styles.toolbar}>
            <span className={`${styles.skeleton} ${styles.searchField}`} />
            <span className={`${styles.skeleton} ${styles.selectField}`} />
            <span className={`${styles.skeleton} ${styles.filterButton}`} />
          </div>
        </section>

        <section className={styles.results}>
          <div className={styles.resultsHeading}>
            <div className={styles.resultsTitleGroup}>
              <span className={`${styles.skeleton} ${styles.resultsKicker}`} />
              <span className={`${styles.skeleton} ${styles.resultsTitle}`} />
            </div>
            <span className={`${styles.skeleton} ${styles.resultsMeta}`} />
          </div>

          <div className={styles.cardGrid}>
            {[0, 1, 2].map((card) => (
              <article className={styles.resultCard} key={card}>
                <div className={styles.cardIdentity}>
                  <span className={`${styles.skeleton} ${styles.cardMark}`} />
                  <div className={styles.cardIdentityText}>
                    <span className={`${styles.skeleton} ${styles.cardTitle}`} />
                    <span className={`${styles.skeleton} ${styles.cardSubtitle}`} />
                  </div>
                </div>
                <div className={styles.cardMetric}>
                  <span className={`${styles.skeleton} ${styles.metricLabel}`} />
                  <span className={`${styles.skeleton} ${styles.metricValue}`} />
                </div>
                <div className={styles.cardDetails}>
                  <span className={`${styles.skeleton} ${styles.detailLine}`} />
                  <span className={`${styles.skeleton} ${styles.detailLine} ${styles.detailLineShort}`} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
