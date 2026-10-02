"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
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
  const [slide, setSlide] = useState({ index: 0, animate: false });
  const active = slide.index;
  const [announcement, setAnnouncement] = useState("");
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
    const timer = window.setInterval(() => setSlide((current) => {
      const next = (current.index + 1) % campusPhotos.length;
      return { index: next, animate: next === current.index + 1 };
    }), 6500);
    return () => window.clearInterval(timer);
  }, [rotating]);

  function select(index: number) {
    const next = (index + campusPhotos.length) % campusPhotos.length;
    setPlaying(false);
    // Jump directly when picking a distant campus or wrapping the gallery.
    setSlide((current) => ({ index: next, animate: Math.abs(next - current.index) === 1 }));
    setAnnouncement(`${campusPhotos[next].shortName}, ${next + 1} of ${campusPhotos.length}`);
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
        <span>Around campus</span>
        <span>{String(active + 1).padStart(2, "0")} / {String(campusPhotos.length).padStart(2, "0")}</span>
      </div>
      <div className={styles.window}>
        <div className={styles.track} data-active={active} data-animate={slide.animate} style={{ transform: `translateX(-${active * 100}%)` }}>
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
                <Image unoptimized src={item.src} width={item.width} height={item.height} alt={item.alt} loading={index < 2 ? "eager" : "lazy"} style={{ objectPosition: item.objectPosition }} />
                <span className={styles.caption}>
                  <span>{item.location}</span>
                  <strong>{item.shortName}<ArrowUpRight size={19} aria-hidden="true" /></strong>
                </span>
              </Link>
            </div>
          ))}
        </div>
        <div className={styles.controls}>
          <button type="button" onClick={() => select(active - 1)} aria-label="Previous campus"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => select(active + 1)} aria-label="Next campus"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.picker}>
          <select aria-label="Choose a campus photo" value={active} onChange={(event) => select(Number(event.target.value))}>
            {campusPhotos.map((item, index) => (
              <option key={item.unitId} value={index}>{item.shortName}</option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
        {!reducedMotion ? <button
          className={styles.rotation}
          type="button"
          onPointerDown={() => { pointerPlaying.current = playing; }}
          onPointerCancel={() => { pointerPlaying.current = null; }}
          onKeyDown={() => { pointerPlaying.current = null; }}
          onClick={() => {
            const resume = !(pointerPlaying.current ?? playing);
            if (resume) setAnnouncement("");
            setPlaying(resume);
            pointerPlaying.current = null;
          }}
          aria-label={playing ? "Pause campus slideshow" : "Play campus slideshow"}
        >{playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} <span className={styles.rotationLabel}>{playing ? "Pause" : "Play"}</span></button> : <span className={styles.motionNote}>Browse photos</span>}
      </div>
      <p className="sr-only" role="status" aria-atomic="true">{announcement}</p>
      <p className={styles.credit}>
        Photo: <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.creator}</a> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> · {photo.photoDate.slice(0, 4)} · cropped for display
      </p>
    </section>
  );
}
