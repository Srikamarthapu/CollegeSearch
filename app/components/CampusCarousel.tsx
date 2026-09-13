"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
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

export function CampusCarousel() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, readReducedMotion, serverReducedMotion);
  const container = useRef<HTMLElement>(null);
  const pointerPlaying = useRef<boolean | null>(null);
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

  const rotating = playing && !hovered && visible && !reducedMotion;
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % campusPhotos.length), 6500);
    return () => window.clearInterval(timer);
  }, [rotating]);

  function select(index: number) {
    setPlaying(false);
    setActive((index + campusPhotos.length) % campusPhotos.length);
  }

  return (
    <section
      ref={container}
      className={styles.carousel}
      aria-label="A look around campus"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPlaying(false);
      }}
    >
      <div className={styles.heading}>
        <span>A look around campus</span>
        <span>{String(active + 1).padStart(2, "0")} / {String(campusPhotos.length).padStart(2, "0")}</span>
      </div>
      <div className={styles.window}>
        <div className={styles.track} data-active={active}>
          {campusPhotos.map((item, index) => (
            <div
              key={item.unitId}
              className={styles.slide}
              data-campus={item.slug}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${campusPhotos.length}: ${item.shortName}`}
              aria-hidden={index !== active}
              inert={index !== active}
            >
              <Link href={`/colleges/${item.slug}`} tabIndex={index === active ? 0 : -1} aria-label={`Explore ${item.shortName}`}>
                <Image unoptimized src={item.src} width={item.width} height={item.height} alt={item.alt} loading={index < 2 ? "eager" : "lazy"} />
                <span className={styles.caption}>
                  <span>{item.location}</span>
                  <strong>{item.shortName}<ArrowUpRight size={19} aria-hidden="true" /></strong>
                </span>
              </Link>
            </div>
          ))}
        </div>
        <div className={styles.controls}>
          <button type="button" onClick={() => select(active - 1)} aria-label="Previous campus"><ChevronLeft size={18} /></button>
          <button type="button" onClick={() => select(active + 1)} aria-label="Next campus"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.dots} aria-label="Choose a campus photo">
          {campusPhotos.map((item, index) => (
            <button key={item.unitId} type="button" aria-label={`Show ${item.shortName} photo`} aria-pressed={active === index} onClick={() => select(index)}><span /></button>
          ))}
        </div>
        {!reducedMotion ? <button
          className={styles.rotation}
          type="button"
          onPointerDown={() => { pointerPlaying.current = playing; }}
          onPointerCancel={() => { pointerPlaying.current = null; }}
          onKeyDown={() => { pointerPlaying.current = null; }}
          onClick={() => {
            setPlaying(!(pointerPlaying.current ?? playing));
            pointerPlaying.current = null;
          }}
          aria-label={playing ? "Pause campus slideshow" : "Play campus slideshow"}
        >{playing ? <Pause size={12} /> : <Play size={12} />} {playing ? "Pause" : "Play"}</button> : <span className={styles.motionNote}>Browse photos</span>}
      </div>
      <p className={styles.credit} aria-live={rotating ? "off" : "polite"} aria-atomic="true">
        Photo: <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.creator}</a> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> · {photo.photoDate.slice(0, 4)} · cropped for display
      </p>
    </section>
  );
}
