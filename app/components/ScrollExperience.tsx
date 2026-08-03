"use client";

import { ReactLenis } from "lenis/react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useState } from "react";

export function ScrollExperience() {
  const [reducedMotion, setReducedMotion] = useState(true);
  const { scrollYProgress } = useScroll();
  const atlasY = useTransform(scrollYProgress, [0, 1], [-34, 42]);
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    mass: 0.22,
  });

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
            lerp: 0.085,
            wheelMultiplier: 0.92,
            prevent: (node) =>
              node instanceof HTMLElement &&
              Boolean(node.closest("[data-lenis-prevent]")),
          }}
        />
      ) : null}

      <div className="page-atlas" aria-hidden="true">
        <motion.img
          src="/atlas-texture.webp"
          alt=""
          style={reducedMotion ? undefined : { y: atlasY }}
        />
        <div className="research-trail">
          <span>Research trail</span>
          <span className="research-trail-track">
            <motion.span
              style={reducedMotion ? { scaleY: 0.18 } : { scaleY: progress }}
            />
          </span>
        </div>
      </div>
    </>
  );
}
