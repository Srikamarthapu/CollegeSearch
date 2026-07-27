"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </MotionConfig>
  );
}
