"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="page-shell comparison-page">
      <section className="comparison-empty" role="alert">
        <AlertTriangle size={31} aria-hidden="true" />
        <span className="page-section-index">Recovery</span>
        <h1>The evidence view could not load.</h1>
        <p>
          Try the view again. If it still fails, no saved browser data will be
          deleted by retrying.
        </p>
        <button className="page-primary-action" type="button" onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" />
          Try again
        </button>
      </section>
    </main>
  );
}
