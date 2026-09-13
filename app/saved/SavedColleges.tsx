"use client";

import {
  ArrowRight,
  BarChart3,
  BookmarkX,
  Database,
  Download,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { ResearchBackupControls } from "@/app/components/ResearchBackupControls";
import { readResearchForExport } from "@/app/lib/research-drafts";
import { ResearchNotebook } from "@/app/components/ResearchNotebook";
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
import { researchCsv } from "@/app/lib/research-export";
import {
  retainResearchCollection,
  type ResearchCollectionSnapshot,
} from "@/app/lib/research-notebook";
import styles from "./saved.module.css";

export function SavedColleges({ colleges }: { colleges: ClientCollege[] }) {
  const [exportStatus, setExportStatus] = useState("");
  const pageRef = useRef<HTMLElement>(null);
  const pendingRemovalFocus = useRef<{
    scopeKey: string;
    index: number;
    trigger: HTMLButtonElement;
    origin: Element | null;
  } | null>(null);
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
  const [previousCollection, setPreviousCollection] =
    useState<ResearchCollectionSnapshot<ClientCollege>>({ scopeKey: null, items: [] });
  const collection = retainResearchCollection(previousCollection, scopeKey, hydrated, saved);
  if (collection !== previousCollection) {
    // Preserve notebook instances through re-verification, but replace the
    // collection before rendering a different verified account's children.
    setPreviousCollection(collection);
  }
  const collectionVisible = hydrated && collection.scopeKey === scopeKey;
  const collectionInteractive = collectionVisible && canMutate;
  const selected = useMemo(
    () => visibleSavedComparisonIds(comparisonSelection, scopeKey, savedIds),
    [comparisonSelection, savedIds, scopeKey],
  );

  useLayoutEffect(() => {
    const request = pendingRemovalFocus.current;
    pendingRemovalFocus.current = null;
    const root = pageRef.current;
    if (!request || !root || request.scopeKey !== scopeKey || !collectionInteractive || request.trigger.isConnected) return;
    const active = document.activeElement;
    const removedOrigin = request.origin && !request.origin.isConnected && active === document.body;
    if (active !== request.origin && !removedOrigin) return;
    const available = (element: HTMLElement) => !element.matches(":disabled") && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-saved-remove]")).filter(available);
    const target = buttons[Math.min(request.index, buttons.length - 1)] ?? root.querySelector<HTMLAnchorElement>("[data-saved-empty-explore]");
    if (target && available(target)) target.focus();
  });

  function removeCollege(unitId: number, trigger: HTMLButtonElement) {
    if (!collectionInteractive) return;
    pendingRemovalFocus.current = {
      scopeKey,
      index: Math.max(0, collection.items.findIndex((college) => college.unitId === unitId)),
      trigger,
      origin: document.activeElement,
    };
    persist(savedIds.filter((id) => id !== unitId));
  }

  function persist(next: number[]) {
    if (!collectionInteractive) return;
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
    if (!collectionInteractive) return;
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

  function exportResearch() {
    if (!collectionInteractive) return;
    try {
      const result = readResearchForExport(scopeKey, saved.map((college) => college.unitId));
      if (result.status !== "ready") {
        setExportStatus("Resolve unreadable or conflicting notebooks, and wait for pending saves, before exporting. Your drafts are retained.");
        return;
      }
      const notebooks = result.notebooks;
      const url = URL.createObjectURL(new Blob(["\uFEFF", researchCsv(saved, notebooks, window.location.origin)], {type: "text/csv;charset=utf-8;"}));
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-college-research.csv";
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus(`Your research CSV is ready with full profile links and your latest notes, including ${result.draftCount} current-tab drafts. Exporting does not commit drafts to browser storage.`);
    } catch {
      setExportStatus("The export could not be created. Please try again.");
    }
  }

  const compareHref = `/compare?colleges=${selected.join(",")}`;

  return (
    <>
      <SiteHeader savedCount={saved.length} />
      <main ref={pageRef} id="main-content" className={styles.page}>
        <header className={styles.masthead}>
          <span className={styles.eyebrow}>Your college shortlist</span>
          <div>
            <h1>A few possibilities. Your next steps.</h1>
            <p>
              Keep your favorites together. Compare the details, write down questions,
              and work out what to explore next.
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
                Import moves these college saves into your account after sync succeeds,
                then removes them from the guest shortlist. Guest notes, your profile,
                and deadlines stay in this browser and are not imported.
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

        <ResearchBackupControls key={`backup:${collection.scopeKey}`} colleges={colleges} scopeKey={scopeKey} canUse={collectionInteractive} />

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
            <h2>Your next chapter starts with a shortlist.</h2>
            <p>
              {syncPhase === "local-only"
                ? "No colleges are saved in this browser yet. You can start without creating an account."
                : "No colleges are saved to this account yet."}
            </p>
            <Link href="/explore" data-saved-empty-explore>
              Explore colleges
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
        ) : null}

        {collection.items.length > 0 ? (
          <section
            key={`collection:${collection.scopeKey}`}
            className={styles.collection}
            aria-labelledby="saved-heading"
            hidden={!collectionVisible}
            inert={!collectionVisible}
          >
            <div className={styles.collectionHeader}>
              <div>
                <span>{String(collection.items.length).padStart(2, "0")}</span>
                <h2 id="saved-heading">
                  {collection.items.length === 1 ? "college saved" : "colleges saved"}
                </h2>
              </div>
              <div className={styles.exportActions}><p>Select 2–4 to compare.</p><button type="button" className="page-secondary-action" onClick={exportResearch} disabled={!collectionInteractive}><Download size={16} aria-hidden="true" /> Export research</button></div>
            </div>

            {exportStatus ? <p className={styles.exportStatus} role="status">{exportStatus}</p> : null}
            <div className={styles.grid}>
              {collection.items.map((college) => {
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
                        <dt>{observationSourceKind(college.observations.graduationRate).isFederal ? "Completion rate" : "6-year graduation"}</dt>
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
                    <ResearchNotebook unitId={college.unitId} collegeName={college.name} />
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
                        disabled={!collectionInteractive || (!isSelected && selected.length >= 4)}
                      >
                        <BarChart3 size={16} aria-hidden="true" />
                        {isSelected ? "Selected" : "Compare"}
                      </button>
                      <button
                        type="button"
                        disabled={!collectionInteractive}
                        aria-label={`Remove ${college.name} from saved colleges`}
                        data-saved-remove
                        onClick={(event) => removeCollege(college.unitId, event.currentTarget)}
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
        ) : null}
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
