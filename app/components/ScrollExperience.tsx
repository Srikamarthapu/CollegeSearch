"use client";

import { ReactLenis } from "lenis/react";
import { useEffect, useState } from "react";

export function ScrollExperience() {
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  return (
    <>
      {!reducedMotion ? (
        <ReactLenis
          root
          options={{
            anchors: { offset: -92 },
            autoRaf: true,
            lerp: 0.16,
            wheelMultiplier: 1,
            prevent: (node) =>
              node instanceof HTMLElement &&
              Boolean(node.closest("[data-lenis-prevent]")),
          }}
        />
      ) : null}

    </>
  );
}
