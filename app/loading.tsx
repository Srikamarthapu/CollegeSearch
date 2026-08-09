export default function Loading() {
  return (
    <main id="main-content" className="page-shell comparison-page">
      <section className="comparison-empty" aria-live="polite" aria-busy="true">
        <span className="page-section-index">Loading</span>
        <h1>Opening the evidence record…</h1>
        <p>Source labels and reporting periods stay attached while the view loads.</p>
      </section>
    </main>
  );
}
