"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useRef } from "react";

type SpotlightStyle = CSSProperties & {
  "--spotlight-x"?: string;
  "--spotlight-y"?: string;
  "--spotlight-color"?: string;
};

export function SourceSpotlight({
  children,
  className = "",
  spotlightColor = "rgba(216, 163, 72, 0.16)",
}: {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!cardRef.current || event.pointerType === "touch") return;
    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty(
      "--spotlight-x",
      `${event.clientX - rect.left}px`,
    );
    cardRef.current.style.setProperty(
      "--spotlight-y",
      `${event.clientY - rect.top}px`,
    );
  }

  const style: SpotlightStyle = {
    "--spotlight-x": "72%",
    "--spotlight-y": "18%",
    "--spotlight-color": spotlightColor,
  };

  return (
    <div
      ref={cardRef}
      className={`source-spotlight ${className}`}
      style={style}
      onPointerMove={handlePointerMove}
    >
      {children}
    </div>
  );
}
