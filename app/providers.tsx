"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { AuthProvider } from "./components/auth/AuthProvider";
import { SavedCollegesProvider } from "./components/saved/SavedCollegesProvider";
import { ScrollExperience } from "./components/ScrollExperience";

export function Providers({
  children,
  knownCollegeIds,
}: {
  children: ReactNode;
  knownCollegeIds: readonly number[];
}) {
  return (
    <AuthProvider>
      <SavedCollegesProvider knownCollegeIds={knownCollegeIds}>
        <MotionConfig
          reducedMotion="user"
          transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <ScrollExperience />
          {children}
        </MotionConfig>
      </SavedCollegesProvider>
    </AuthProvider>
  );
}
