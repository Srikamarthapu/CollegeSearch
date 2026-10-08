"use client";

import { ArrowDown, ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";
import { CampusCarousel } from "./CampusCarousel";
import styles from "./DiscoveryHero.module.css";

export function DiscoveryHero({ catalogSize, onExplore }: { catalogSize: number; onExplore: () => void }) {
  return (
    <section className={styles.hero} aria-labelledby="discovery-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>YOUR COLLEGE SEARCH</p>
        <h1 id="discovery-title">Find a college<br /><em>that fits you.</em></h1>
        <p className={styles.description}>Explore your options, understand the costs, and keep your next steps together.</p>
        <div className={styles.actions}>
          <button type="button" onClick={onExplore}>Explore colleges <ArrowDown size={18} aria-hidden="true" /></button>
          <Link href="/match">Find my fit <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <Link className={styles.sources} href="/data-sources">
          <BookOpen size={17} aria-hidden="true" />
          <span><strong>{catalogSize.toLocaleString()} colleges.</strong> Official sources. Clear reporting years.</span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <CampusCarousel />
    </section>
  );
}
