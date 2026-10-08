"use client";

import {
  ArrowRight,
  BarChart3,
  BookmarkX,
  CalendarDays,
  ChevronDown,
  Plus,
  Database,
  Download,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { ResearchBackupControls } from "@/app/components/ResearchBackupControls";
import { readResearchForExport } from "@/app/lib/research-drafts";
import { ResearchNotebook } from "@/app/components/ResearchNotebook";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import { DeadlinePlanner } from "@/app/components/DeadlinePlanner";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import {
  formatObservation,
  observationSourceKind,
  type ClientCollege,
} from "@/app/lib/college-client-record";
import type { DirectoryCollegeIdentity } from "@/app/lib/college-directory";
import { parseCollegeIdentityDirectory } from "@/app/lib/college-identity-directory";
import {
  type SavedComparisonSelection,
  visibleSavedComparisonIds,
} from "@/app/lib/saved-comparison-selection";
import { researchCsv } from "@/app/lib/research-export";
import {
  retainResearchCollection,
  type ResearchCollectionSnapshot,
} from "@/app/lib/research-notebook";
import { CardTuition } from "@/app/components/CardTuition";
import {
  plannerTabFromHash,
  plannerTabFromKey,
  type PlannerTab,
} from "./planner-tabs";
import styles from "./saved.module.css";

type IdentityDirectoryState =
  | { status: "idle" | "loading" | "error"; items: null }
  | { status: "ready"; items: DirectoryCollegeIdentity[] };

export function SavedColleges() {
  const [exportStatus, setExportStatus] = useState("");
  const [activeTab, setActiveTab] = useState<PlannerTab>("colleges");
  const [identityDirectory, setIdentityDirectory] = useState<IdentityDirectoryState>({ status: "idle", items: null });
  const identityRequest = useRef<Promise<void> | null>(null);
  const tabRefs = useRef<Record<PlannerTab, HTMLButtonElement | null>>({
    colleges: null,
    deadlines: null,
  });
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

  const [resolvedColleges, setResolvedColleges] = useState<{
    scopeKey: string;
    byId: Map<number, ClientCollege>;
  }>({ scopeKey: "", byId: new Map() });
  const [detailsFailure, setDetailsFailure] = useState<{ key: string; message: string } | null>(null);
  const [detailsRetry, setDetailsRetry] = useState(0);
  const resolvedById = useMemo(
    () => resolvedColleges.scopeKey === scopeKey
      ? resolvedColleges.byId
      : new Map<number, ClientCollege>(),
    [resolvedColleges, scopeKey],
  );
  const unresolvedIds = savedIds.filter((unitId) => !resolvedById.has(unitId));
  const unresolvedIdsKey = unresolvedIds.join(",");
  const recordsReady = unresolvedIdsKey.length === 0;
  const detailsError = detailsFailure?.key === unresolvedIdsKey ? detailsFailure.message : "";

  const loadIdentityDirectory = useCallback(() => {
    if (identityDirectory.status === "ready") return Promise.resolve();
    if (identityRequest.current) return identityRequest.current;
    setIdentityDirectory({ status: "loading", items: null });
    const request = (async () => {
      try {
        const response = await fetch("/api/colleges/identities", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("The college directory could not be loaded.");
        const payload = parseCollegeIdentityDirectory(await response.json());
        if (!payload) throw new Error("The college directory response was incomplete.");
        setIdentityDirectory({ status: "ready", items: payload.items });
      } catch {
        setIdentityDirectory({ status: "error", items: null });
      } finally {
        identityRequest.current = null;
      }
    })();
    identityRequest.current = request;
    return request;
  }, [identityDirectory.status]);

  useLayoutEffect(() => {
    const activateHashTab = () => setActiveTab(plannerTabFromHash(window.location.hash));
    activateHashTab();
    window.addEventListener("hashchange", activateHashTab);
    window.addEventListener("popstate", activateHashTab);
    return () => {
      window.removeEventListener("hashchange", activateHashTab);
      window.removeEventListener("popstate", activateHashTab);
    };
  }, []);

  useEffect(() => {
    if (activeTab === "deadlines" && identityDirectory.status === "idle") {
      void loadIdentityDirectory();
    }
  }, [activeTab, identityDirectory.status, loadIdentityDirectory]);

  useEffect(() => {
    if (!hydrated || scopeKey === "loading" || !unresolvedIdsKey) return;
    const controller = new AbortController();
    const targetScope = scopeKey;
    const unitIds = unresolvedIdsKey.split(",").map(Number);
    void (async () => {
      try {
        const items: ClientCollege[] = [];
        let offset = 0;
        while (offset < unitIds.length) {
          const response = await fetch("/api/colleges/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unitIds, offset, limit: 48 }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Saved college details could not be loaded.");
          const page = await response.json() as {
            items: ClientCollege[];
            nextOffset: number | null;
          };
          items.push(...page.items);
          if (page.nextOffset === null) break;
          offset = page.nextOffset;
        }
        if (items.length !== unitIds.length) throw new Error("Some saved college details were unavailable.");
        setResolvedColleges((current) => {
          const byId = current.scopeKey === targetScope
            ? new Map(current.byId)
            : new Map<number, ClientCollege>();
          for (const college of items) byId.set(college.unitId, college);
          return { scopeKey: targetScope, byId };
        });
        setDetailsFailure(null);
      } catch (error) {
        if (!controller.signal.aborted) {
          setDetailsFailure({
            key: unresolvedIdsKey,
            message: error instanceof Error ? error.message : "Saved college details could not be loaded.",
          });
        }
      }
    })();
    return () => controller.abort();
  }, [detailsRetry, hydrated, scopeKey, unresolvedIdsKey]);

  const saved = useMemo(
    () =>
      savedIds
        .map((unitId) => resolvedById.get(unitId))
        .filter((college): college is ClientCollege => Boolean(college)),
    [resolvedById, savedIds],
  );
  const [previousCollection, setPreviousCollection] =
    useState<ResearchCollectionSnapshot<ClientCollege>>({ scopeKey: null, items: [] });
  const collection = retainResearchCollection(previousCollection, scopeKey, hydrated, saved);
  if (collection !== previousCollection) {
    // Preserve notebook instances through re-verification, but replace the
    // collection before rendering a different verified account's children.
    setPreviousCollection(collection);
  }
  const collectionVisible = hydrated && recordsReady && collection.scopeKey === scopeKey;
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

  function activateTab(tab: PlannerTab, moveFocus = false) {
    setActiveTab(tab);
    if (window.location.hash !== `#${tab}`) {
      window.history.pushState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}#${tab}`,
      );
    }
    if (moveFocus) {
      window.requestAnimationFrame(() => tabRefs.current[tab]?.focus());
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const nextTab = plannerTabFromKey(activeTab, event.key);
    if (!nextTab) return;
    event.preventDefault();
    activateTab(nextTab, true);
  }

  return (
    <>
      <SiteHeader />
      <main ref={pageRef} id="main-content" className={styles.page}>
        <header className={styles.masthead}>
          <div>
            <span className={styles.eyebrow}>Your college search, taking shape</span>
            <h1>My colleges</h1>
            <p>Keep the colleges you like and the dates that matter in one place.</p>
          </div>
          <Link className="page-primary-action" href="/explore"><Plus size={17} aria-hidden="true" /> Explore colleges</Link>
        </header>

        <div className={styles.sectionNav} role="tablist" aria-label="My colleges sections">
          <button
            ref={(node) => { tabRefs.current.colleges = node; }}
            id="colleges-tab"
            type="button"
            role="tab"
            aria-controls="colleges"
            aria-selected={activeTab === "colleges"}
            tabIndex={activeTab === "colleges" ? 0 : -1}
            onClick={() => activateTab("colleges")}
            onKeyDown={handleTabKeyDown}
          >
            Saved colleges{hydrated ? <span>{saved.length}</span> : null}
          </button>
          <button
            ref={(node) => { tabRefs.current.deadlines = node; }}
            id="deadlines-tab"
            type="button"
            role="tab"
            aria-controls="deadlines"
            aria-selected={activeTab === "deadlines"}
            tabIndex={activeTab === "deadlines" ? 0 : -1}
            onClick={() => activateTab("deadlines")}
            onKeyDown={handleTabKeyDown}
          >
            <CalendarDays size={16} aria-hidden="true" /> Deadlines
          </button>
        </div>

        <div className={styles.workspace}>
        <section
          id="colleges"
          className={styles.savedPanel}
          role="tabpanel"
          aria-labelledby="colleges-tab"
          hidden={activeTab !== "colleges"}
          inert={activeTab !== "colleges"}
        >
          <header className={styles.collectionHeader}>
            <div><h2 id="saved-heading">Saved colleges</h2><p>Your possibilities, ready to revisit.</p></div>
            {saved.length > 0 && collectionVisible ? <span>{saved.length} saved</span> : null}
          </header>

          <details className={`${styles.syncLedger} ${syncPhase === "error" ? styles.syncError : ""}`} open={syncPhase === "error" || syncPhase === "syncing" || undefined}>
            <summary><ShieldCheck size={16} aria-hidden="true" /><span role={syncPhase === "error" ? "alert" : "status"}>{syncMessage.title}</span><ChevronDown size={15} aria-hidden="true" /></summary>
            <p>{syncMessage.body}</p>
            {pendingCount > 0 ? <p>{pendingCount} {pendingCount === 1 ? "change" : "changes"} pending.</p> : null}
            {syncPhase === "error" ? <button type="button" onClick={retrySync}>Retry sync</button> : null}
          </details>

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

        {!hydrated && syncPhase === "error" ? (
          <section className={styles.empty} role="alert">
            <Database size={27} aria-hidden="true" />
            <h3>We couldn’t load your account list.</h3>
            <p>
              Nothing is being represented as an empty list. Retry after your
              connection or account session is available.
            </p>
            <button type="button" onClick={retrySync}>
              Retry account list
            </button>
          </section>
        ) : !hydrated || !recordsReady ? (
          <section className={styles.empty} aria-live="polite">
            <Database size={27} aria-hidden="true" />
            <h3>{detailsError ? "Saved college details could not be loaded." : "Loading your saved list…"}</h3>
            {detailsError ? <><p>{detailsError}</p><button type="button" onClick={() => setDetailsRetry((current) => current + 1)}>Retry saved colleges</button></> : null}
          </section>
        ) : saved.length === 0 ? (
          <section className={styles.empty}>
            <BookmarkX size={31} aria-hidden="true" />
            <h3>Start with a college you like.</h3>
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
            aria-label="Your saved colleges"
            hidden={!collectionVisible}
            inert={!collectionVisible}
          >
            <p className={styles.compareHint}>Select 2–4 colleges to compare side by side.</p>
            <div className={styles.grid}>
              {collection.items.map((college) => {
                const source = observationSourceKind(
                  college.observations.admitRate,
                );
                const feeContext = college.costs.feeBasis === "allowance"
                  ? "Tuition is before aid. The campus fee allowance is a budget estimate; housing, meals, and other living costs are additional."
                  : "Tuition is before aid. Required fees, housing, meals, and other living costs are additional.";
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
                    <div className={styles.tuition}><CardTuition college={college} /></div>
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
                    </dl>
                    <p className={styles.costContext}>
                      {feeContext}
                    </p>
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
          <details
            className={styles.backupTools}
            onToggle={(event) => {
              if (event.currentTarget.open && identityDirectory.status === "idle") {
                void loadIdentityDirectory();
              }
            }}
          >
            <summary><Download size={16} aria-hidden="true" /> Research export &amp; backup<ChevronDown size={15} aria-hidden="true" /></summary>
            {saved.length > 0 ? <button type="button" className="page-secondary-action" onClick={exportResearch} disabled={!collectionInteractive}><Download size={16} aria-hidden="true" /> Export research CSV</button> : null}
            {exportStatus ? <p className={styles.exportStatus} role="status">{exportStatus}</p> : null}
            {identityDirectory.status === "ready" ? (
              <ResearchBackupControls key={`backup:${collection.scopeKey}`} colleges={identityDirectory.items} scopeKey={scopeKey} canUse={collectionInteractive} />
            ) : identityDirectory.status === "error" ? (
              <div className={styles.directoryState} role="alert">
                <p>The complete college directory could not be loaded. Your notebooks are unchanged, and backup tools remain paused.</p>
                <button type="button" onClick={() => void loadIdentityDirectory()}>Retry directory</button>
              </div>
            ) : (
              <div className={styles.directoryState} role="status" aria-busy="true">
                <p>Loading the complete college directory before enabling backup tools…</p>
                <div className={styles.directorySkeleton} aria-hidden="true"><span /><span /></div>
              </div>
            )}
          </details>
        </section>
        <section
          id="deadlines"
          className={styles.deadlinePanel}
          role="tabpanel"
          aria-labelledby="deadlines-tab"
          hidden={activeTab !== "deadlines"}
          inert={activeTab !== "deadlines"}
        >
          {identityDirectory.status === "ready" ? (
            <DeadlinePlanner colleges={identityDirectory.items} embedded savedCollegeIds={collectionVisible ? savedIds : []} />
          ) : identityDirectory.status === "error" ? (
            <section className={styles.directoryState} role="alert" aria-labelledby="deadline-directory-error">
              <h2 id="deadline-directory-error">Deadlines are temporarily paused.</h2>
              <p>The complete college directory could not be loaded. Existing deadlines and drafts remain unchanged; retry before adding or restoring dates.</p>
              <button type="button" onClick={() => void loadIdentityDirectory()}>Retry college directory</button>
            </section>
          ) : (
            <section className={styles.directoryState} role="status" aria-busy="true" aria-labelledby="deadline-directory-loading">
              <h2 id="deadline-directory-loading">Preparing your deadline planner…</h2>
              <p>Loading the complete college directory so saved dates can be validated safely.</p>
              <div className={styles.directorySkeleton} aria-hidden="true"><span /><span /><span /></div>
            </section>
          )}
        </section>
        </div>
      </main>

      {activeTab === "colleges" && selected.length > 0 ? (
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
