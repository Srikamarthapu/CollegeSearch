"use client";

import {
  ArrowRight,
  BarChart3,
  BookmarkX,
  Database,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CollegeLogo } from "@/app/components/CollegeLogo";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import {
  formatObservation,
  observationSourceKind,
  type ClientCollege,
} from "@/app/lib/college-client-record";
import styles from "./saved.module.css";

const storageKeys = ["college-search-saved", "college-compass-saved"];

function readSavedIds(knownIds: Set<number>) {
  for (const key of storageKeys) {
    const value = window.localStorage.getItem(key);
    if (!value) continue;
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) continue;
      return Array.from(
        new Set(
          parsed
            .filter(Number.isInteger)
            .filter((unitId): unitId is number => knownIds.has(unitId as number)),
        ),
      );
    } catch {
      window.localStorage.removeItem(key);
    }
  }
  return [];
}

export function SavedColleges({ colleges }: { colleges: ClientCollege[] }) {
  const [savedIds, setSavedIds] = useState<number[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const knownIds = useMemo(
    () => new Set(colleges.map((college) => college.unitId)),
    [colleges],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setSavedIds(readSavedIds(knownIds));
      } catch {
        setSavedIds([]);
        setStorageUnavailable(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [knownIds]);

  const saved = useMemo(
    () =>
      (savedIds ?? [])
        .map((unitId) => colleges.find((college) => college.unitId === unitId))
        .filter((college): college is ClientCollege => Boolean(college)),
    [colleges, savedIds],
  );

  function persist(next: number[]) {
    setSavedIds(next);
    setSelected((current) => current.filter((unitId) => next.includes(unitId)));
    try {
      window.localStorage.setItem("college-search-saved", JSON.stringify(next));
      window.localStorage.removeItem("college-compass-saved");
    } catch {
      setStorageUnavailable(true);
    }
  }

  function toggleComparison(unitId: number) {
    setSelected((current) => {
      if (current.includes(unitId)) {
        return current.filter((item) => item !== unitId);
      }
      return current.length < 4 ? [...current, unitId] : current;
    });
  }

  const compareHref = `/compare?colleges=${selected.join(",")}`;

  return (
    <>
      <SiteHeader savedCount={saved.length} />
      <main id="main-content" className={styles.page}>
        <header className={styles.masthead}>
          <span className={styles.eyebrow}>Your research shelf</span>
          <div>
            <h1>Saved on this device.</h1>
            <p>
              Keep a short list, inspect the evidence, then choose up to four
              colleges to compare side by side.
            </p>
          </div>
          <aside className={styles.localNote}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>Private by default</strong>
              These saves stay in this browser. Account sync is not active yet.
            </span>
          </aside>
        </header>

        {storageUnavailable ? (
          <p className={styles.warning} role="status">
            This browser is blocking local storage, so changes may not persist.
          </p>
        ) : null}

        {savedIds === null ? (
          <section className={styles.empty} aria-live="polite">
            <Database size={27} aria-hidden="true" />
            <h2>Loading your saved list…</h2>
          </section>
        ) : saved.length === 0 ? (
          <section className={styles.empty}>
            <BookmarkX size={31} aria-hidden="true" />
            <h2>Your shelf is empty.</h2>
            <p>
              Save a college from the explorer. It will appear here without
              creating an account.
            </p>
            <Link href="/explore">
              Explore colleges
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <section className={styles.collection} aria-labelledby="saved-heading">
            <div className={styles.collectionHeader}>
              <div>
                <span>{String(saved.length).padStart(2, "0")}</span>
                <h2 id="saved-heading">
                  {saved.length === 1 ? "college saved" : "colleges saved"}
                </h2>
              </div>
              <p>Select 2–4 for a source-aware comparison.</p>
            </div>

            <div className={styles.grid}>
              {saved.map((college) => {
                const source = observationSourceKind(
                  college.observations.admitRate,
                );
                const isSelected = selected.includes(college.unitId);
                return (
                  <article className={styles.card} key={college.unitId}>
                    <div className={styles.identity}>
                      <CollegeLogo college={college} />
                      <div>
                        <span>
                          <MapPin size={13} aria-hidden="true" />
                          {college.city}, {college.state}
                        </span>
                        <h3>
                          <Link href={`/colleges/${college.slug}`}>
                            {college.name}
                          </Link>
                        </h3>
                      </div>
                    </div>
                    <dl className={styles.metrics}>
                      <div>
                        <dt>Overall admit rate</dt>
                        <dd>
                          <strong>
                            {formatObservation(college.observations.admitRate)}
                          </strong>
                          <span>
                            {college.observations.admitRate.periodLabel} · {source.label}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Average net price</dt>
                        <dd>
                          <strong>
                            {formatObservation(
                              college.observations.averageNetPrice,
                            )}
                          </strong>
                          <span>
                            {college.observations.averageNetPrice.periodLabel}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Graduation rate</dt>
                        <dd>
                          <strong>
                            {formatObservation(
                              college.observations.graduationRate,
                            )}
                          </strong>
                          <span>
                            {college.observations.graduationRate.periodLabel}
                          </span>
                        </dd>
                      </div>
                    </dl>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={isSelected ? styles.selected : undefined}
                        aria-pressed={isSelected}
                        onClick={() => toggleComparison(college.unitId)}
                        disabled={!isSelected && selected.length >= 4}
                      >
                        <BarChart3 size={16} aria-hidden="true" />
                        {isSelected ? "Selected" : "Compare"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          persist(
                            (savedIds ?? []).filter(
                              (unitId) => unitId !== college.unitId,
                            ),
                          )
                        }
                      >
                        <BookmarkX size={16} aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {selected.length > 0 ? (
        <aside className={styles.compareTray} aria-label="Saved comparison list">
          <span>
            <strong>{selected.length} of 4</strong> selected
          </span>
          {selected.length >= 2 ? (
            <Link href={compareHref}>
              Compare now
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : (
            <small>Select one more college</small>
          )}
        </aside>
      ) : null}
      <SiteFooter />
    </>
  );
}
