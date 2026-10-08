"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { campusPhotos } from "@/app/lib/campus-photos";
import styles from "./CampusCarousel.module.css";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const readReducedMotion = () => window.matchMedia(motionQuery).matches;
const serverReducedMotion = () => true;

type SlideState = { index: number; loaded: number[] };
function advanceSlide(current: SlideState, direction: number): SlideState {
  const count = campusPhotos.length;
  const index = (current.index + direction + count) % count;
  return {
    index,
    // Preload neighbors and retain visited images so interrupted fades stay smooth.
    loaded: [...new Set([...current.loaded, index, (index + 1) % count, (index - 1 + count) % count])],
  };
}

export function CampusCarousel() {
  const [slide, setSlide] = useState<SlideState>({ index: 0, loaded: [0, 1, campusPhotos.length - 1] });
  const active = slide.index;
  const [announcement, setAnnouncement] = useState("");
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, readReducedMotion, serverReducedMotion);
  const container = useRef<HTMLElement>(null);
  const photo = campusPhotos[active];

  useEffect(() => {
    let intersecting = false;
    const updateVisibility = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      updateVisibility();
    });
    if (container.current) observer.observe(container.current);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const rotating = !hovered && !keyboardFocused && visible && !reducedMotion;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => {
      setSlide((current) => advanceSlide(current, 1));
      setAnnouncement("");
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [active, rotating]);

  function select(direction: number) {
    const next = (active + direction + campusPhotos.length) % campusPhotos.length;
    setSlide((current) => advanceSlide(current, direction));
    setAnnouncement(campusPhotos[next].shortName + ", " + campusPhotos[next].location);
  }

  return (
    <section
      ref={container}
      className={styles.carousel}
      aria-label="A look around campus"
      aria-roledescription="carousel"
      onPointerEnter={(event) => { if (event.pointerType !== "touch") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onPointerDownCapture={() => setKeyboardFocused(false)}
      onFocusCapture={(event) => setKeyboardFocused(event.target.matches(":focus-visible"))}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardFocused(false);
      }}
    >
      <div className={styles.window} data-active={active}>
        {campusPhotos.map((item, index) => (
          <div
            key={item.unitId}
            className={styles.slide}
            data-campus={item.slug}
            role="group"
            aria-roledescription="slide"
            aria-label={item.shortName}
            aria-hidden={index !== active}
            inert={index !== active}
          >
            {slide.loaded.includes(index) ? (
              <Image unoptimized src={item.src} width={item.width} height={item.height} alt={item.alt} loading={index === active ? "eager" : "lazy"} style={{ objectPosition: item.objectPosition }} />
            ) : null}
            <span className={styles.caption}>
              <span>{item.location}</span>
              <strong>{item.shortName}</strong>
            </span>
          </div>
        ))}
        <div className={styles.controls}>
          <button type="button" onClick={() => select(-1)} aria-label="Previous campus"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => select(1)} aria-label="Next campus"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <p className="sr-only" role="status" aria-atomic="true">{announcement}</p>
      <p className={styles.credit}>
        Photo: <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.creator}</a> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> · {photo.photoDate.slice(0, 4)} · cropped for display
      </p>
    </section>
  );
}
