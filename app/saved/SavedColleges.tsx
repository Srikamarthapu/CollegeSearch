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
import { useMemo, useState } from "react";

import { CollegeLogo } from "@/app/components/CollegeLogo";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import {
  formatObservation,
  observationSourceKind,
  type ClientCollege,
} from "@/app/lib/college-client-record";
import {
  type SavedComparisonSelection,
  visibleSavedComparisonIds,
} from "@/app/lib/saved-comparison-selection";
import styles from "./saved.module.css";

export function SavedColleges({ colleges }: { colleges: ClientCollege[] }) {
  const [comparisonSelection, setComparisonSelection] =
    useState<SavedComparisonSelection>({ ids: [], scopeKey: "loading" });
  const {
    accountCacheAvailable,
    canImportGuestSaves,
    canMutate,
    guestImportCount,
    hydrated,
    ids: savedIds,
    importGuestSaves,
    lastError,
    pendingCount,
    replaceSavedIds,
    retrySync,
    scopeKey,
    storageAvailable,
    syncPhase,
  } = useSavedColleges();

  const saved = useMemo(
    () =>
      savedIds
        .map((unitId) => colleges.find((college) => college.unitId === unitId))
        .filter((college): college is ClientCollege => Boolean(college)),
    [colleges, savedIds],
  );
  const selected = useMemo(
    () => visibleSavedComparisonIds(comparisonSelection, scopeKey, savedIds),
    [comparisonSelection, savedIds, scopeKey],
  );

  function persist(next: number[]) {
    replaceSavedIds(next);
    setComparisonSelection((current) => ({
      ids: visibleSavedComparisonIds(current, scopeKey, next),
      scopeKey,
    }));
  }

  const syncMessage =
    syncPhase === "local-only"
      ? {
          title: "Saved in this browser",
          body: "Anyone using this browser profile may see this list. Signing in never imports it without your approval.",
        }
      : syncPhase === "loading-account"
        ? {
            title: "Checking your account saves",
            body: "Your account list is being verified before anything is labeled synced.",
          }
        : syncPhase === "syncing"
          ? {
              title: "Saved on this browser · waiting to sync",
              body: "Keep this tab open while CollegeSearch updates your account list.",
            }
          : syncPhase === "synced"
            ? {
                title: "Account list is up to date",
                body: "These saves were confirmed against your signed-in account.",
              }
            : {
                title: "Sync needs attention",
                body:
                  lastError ??
                  (accountCacheAvailable
                    ? "Your last complete browser copy is intact. Retry when your connection returns."
                    : "CollegeSearch could not load a complete account list, so it is not showing an empty shelf."),
              };

  function toggleComparison(unitId: number) {
    setComparisonSelection((current) => {
      const currentIds = visibleSavedComparisonIds(
        current,
        scopeKey,
        savedIds,
      );
      if (currentIds.includes(unitId)) {
        return {
          ids: currentIds.filter((item) => item !== unitId),
          scopeKey,
        };
      }
      return {
        ids: currentIds.length < 4 ? [...currentIds, unitId] : currentIds,
        scopeKey,
      };
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
            <h1>Your saved colleges.</h1>
            <p>
              Keep a short list, inspect the evidence, then choose up to four
              colleges to compare side by side.
            </p>
          </div>
          <aside className={styles.localNote}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>{syncMessage.title}</strong>
              {syncMessage.body}
            </span>
          </aside>
        </header>

        <section
          className={`${styles.syncLedger} ${
            syncPhase === "error"
              ? styles.syncError
              : syncPhase === "syncing"
                ? styles.syncPending
                : ""
          }`}
          role={syncPhase === "error" ? "alert" : "status"}
          aria-atomic="true"
          aria-busy={
            syncPhase === "loading-account" || syncPhase === "syncing"
          }
          aria-live={syncPhase === "error" ? "assertive" : "polite"}
        >
          <div>
            <span>Saved-list status</span>
            <strong>{syncMessage.title}</strong>
            {pendingCount > 0 ? (
              <small>
                {pendingCount} {pendingCount === 1 ? "change" : "changes"} pending
              </small>
            ) : null}
          </div>
          {syncPhase === "error" ? (
            <button type="button" onClick={retrySync}>Retry sync</button>
          ) : null}
        </section>

        {canImportGuestSaves ? (
          <section
            className={styles.importPrompt}
            aria-labelledby="guest-import-title"
          >
            <div>
              <strong id="guest-import-title">
                {guestImportCount} browser-only {guestImportCount === 1 ? "save" : "saves"}
              </strong>
              <p>
                These remain separate from your account unless you choose to import them.
              </p>
            </div>
            <button type="button" onClick={() => void importGuestSaves()}>
              Import {guestImportCount} {guestImportCount === 1 ? "save" : "saves"} from this browser
            </button>
          </section>
        ) : null}

        {!storageAvailable ? (
          <p className={styles.warning} role="status">
            This browser is blocking local storage. Saves remain visible in this
            tab, but account changes wait until CollegeSearch can preserve a safe
            retry record. The browser copy may not survive a reload.
          </p>
        ) : null}

        {!hydrated && syncPhase === "error" ? (
          <section className={styles.empty} role="alert">
            <Database size={27} aria-hidden="true" />
            <h2>We couldn’t load your account list.</h2>
            <p>
              Nothing is being represented as an empty list. Retry after your
              connection or account session is available.
            </p>
            <button type="button" onClick={retrySync}>
              Retry account list
            </button>
          </section>
        ) : !hydrated ? (
          <section className={styles.empty} aria-live="polite">
            <Database size={27} aria-hidden="true" />
            <h2>Loading your saved list…</h2>
          </section>
        ) : saved.length === 0 ? (
          <section className={styles.empty}>
            <BookmarkX size={31} aria-hidden="true" />
            <h2>Your shelf is empty.</h2>
            <p>
              {syncPhase === "local-only"
                ? "No colleges are saved in this browser yet. You can start without creating an account."
                : "No colleges are saved to this account yet."}
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
                        aria-label={
                          isSelected
                            ? `Remove ${college.name} from comparison`
                            : `Add ${college.name} to comparison`
                        }
                        onClick={() => toggleComparison(college.unitId)}
                        disabled={!isSelected && selected.length >= 4}
                      >
                        <BarChart3 size={16} aria-hidden="true" />
                        {isSelected ? "Selected" : "Compare"}
                      </button>
                      <button
                        type="button"
                        disabled={!canMutate}
                        aria-label={`Remove ${college.name} from saved colleges`}
                        onClick={() =>
                          persist(
                            savedIds.filter(
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
