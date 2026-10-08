"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useLenis } from "lenis/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  CircleAlert,
  Database,
  GraduationCap,
  Info,
  MapPin,
  MessageSquare,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Copy,
  LayoutGrid,
  List,
  Plus,
  BookOpen,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import { NegativeNetPriceNote } from "@/app/components/NegativeNetPriceNote";
import { DiscoveryHero } from "@/app/components/DiscoveryHero";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import {
  compactName,
  formatObservation,
  majorEvidenceFor,
  observationSourceKind,
  percentFormatter,
  selectivityLabel,
  type ClientCollege,
  type ClientObservation,
} from "@/app/lib/college-client-record";
import {
  filterCollegesByQuery,
  matchingMajors,
  STATE_NAMES,
} from "@/app/lib/college-search";
import {
  EMPTY_DIRECTORY_FILTERS,
  DIRECTORY_PAGE_SIZE,
  parseDirectoryFilters,
  reconcileDirectorySelection,
  serializeDirectoryFilters,
  type DirectoryFilters,
} from "@/app/lib/college-directory-state";
import type {
  CollegeDirectoryPage,
} from "@/app/lib/college-directory";
import { cardTuitionMetrics } from "@/app/lib/tuition-labels";
import { CardTuition } from "@/app/components/CardTuition";

type ExplorerState = DirectoryFilters;

type FilterKey =
  | "query"
  | "major"
  | "stateCode"
  | "ownership"
  | "institutionLevel"
  | "band"
  | "maxPrice"
  | "maxTuition"
  | "maxTuitionOnly"
  | "enrollmentBand"
  | "minGraduation"
  | "minEarnings"
  | "setting"
  | "sort";

type ExplorerAction =
  | { type: "set"; key: FilterKey; value: string }
  | {
      type: "toggle";
      key: "ucOnly" | "completeOnly" | "savedOnly";
    }
  | { type: "clearTuitionOnly" }
  | { type: "hydrate"; value: Partial<ExplorerState> }
  | { type: "clear" };

const defaultExplorerState: ExplorerState = EMPTY_DIRECTORY_FILTERS;
const noSavedIds: number[] = [];

function directoryRequestKey(
  filters: DirectoryFilters,
  savedIds: number[],
  selectedIds: number[],
) {
  return JSON.stringify({ filters, savedIds: [...savedIds].sort((a, b) => a - b), selectedIds });
}

const stateNames = STATE_NAMES;
function explorerReducer(
  state: ExplorerState,
  action: ExplorerAction,
): ExplorerState {
  if (action.type === "set") {
    return {
      ...state,
      [action.key]: action.value,
      ...(action.key === "major" && !action.value && state.sort === "major" ? { sort: "featured" } : {}),
      ...(action.key === "maxTuitionOnly" ? { maxTuition: "" } : {}),
    } as ExplorerState;
  }
  if (action.type === "toggle") {
    return {
      ...state,
      [action.key]: !state[action.key],
    };
  }
  if (action.type === "clearTuitionOnly") {
    return { ...state, maxTuitionOnly: "" };
  }
  if (action.type === "hydrate") {
    return { ...state, ...action.value };
  }
  if (action.type === "clear") {
    return { ...defaultExplorerState };
  }
  return state;
}

function SourceBadge({ observation }: { observation: ClientObservation }) {
  const source = observationSourceKind(observation);
  return (
    <span className={`source-badge ${source.className}`}>
      <ShieldCheck size={12} aria-hidden="true" />
      {source.label} · {observation.periodLabel}
    </span>
  );
}

function MetricStamp({ label, observation, emphasis = false, detail }: { label: string; observation: ClientObservation; emphasis?: boolean; detail?: string }) {
  return <div className={`metric-stamp ${emphasis ? "metric-primary" : ""}`}>
    <span className="metric-label">{label}</span>
    <strong>{formatObservation(observation)}</strong>
    <small>{detail ?? observation.periodLabel}</small>
  </div>;
}

const CollegeCard = memo(function CollegeCard({ college, selectedMajor, isSelected, isSaved, saveDisabled, onCompare, onSave }: {
  college: ClientCollege; selectedMajor: string; isSelected: boolean; isSaved: boolean; saveDisabled: boolean;
  onCompare: (college: ClientCollege) => void; onSave: (college: ClientCollege) => void;
}) {
  const admitRate = college.observations.admitRate;
  const tuition = cardTuitionMetrics(college);
  const feeContext = college.costs.feeBasis === "allowance"
    ? "Tuition is before aid. The campus fee allowance is a budget estimate; housing, meals, and other living costs are additional."
    : "Tuition is before aid. Required fees, housing, meals, and other living costs are additional.";
  const majorEvidence = selectedMajor ? majorEvidenceFor(college, selectedMajor) : null;
  const records = [
    ...tuition,
    { label: "Historical average net price (federal aid cohort)", observation: college.observations.averageNetPrice },
    { label: "Overall acceptance rate", observation: admitRate },
    { label: observationSourceKind(college.observations.graduationRate).isFederal ? "150% completion rate" : "Graduate within 6 years", observation: college.observations.graduationRate },
    { label: "Undergraduate enrollment", observation: college.observations.undergraduateEnrollment },
  ];
  return <article className={`college-card research-card ${isSelected ? "is-selected" : ""}`} data-testid={`college-${college.unitId}`}>
    <div className="college-card-main">
      <Link className="college-identity" href={`/colleges/${college.slug}`} title={college.name}>
        <CollegeLogo college={college} />
        <span><span className="college-name">{compactName(college)}</span><span className="college-meta"><MapPin size={13} aria-hidden="true" />{college.city}, {college.state}</span></span>
      </Link>
      <button className={`save-button ${isSaved ? "is-active" : ""}`} type="button" aria-pressed={isSaved}
        aria-label={isSaved ? `Remove ${college.name} from saved colleges` : `Save ${college.name}`} disabled={saveDisabled}
        title={saveDisabled ? "Checking which saved list is active." : isSaved ? "Saved to your shortlist" : "Save to your shortlist"} onClick={() => onSave(college)}>
        {isSaved ? <BookmarkCheck size={20} aria-hidden="true" /> : <Bookmark size={20} aria-hidden="true" />}
      </button>
    </div>
    <div className="college-character"><span>{college.ownership}</span><span>{college.institutionLevel}</span><span>{college.setting} campus</span><span title={`${college.observations.undergraduateEnrollment.periodLabel} · ${college.observations.undergraduateEnrollment.publisher}`}>{formatObservation(college.observations.undergraduateEnrollment)} undergrads</span></div>
    <div className="card-tuition"><CardTuition college={college} /></div>
    <div className="metric-ledger card-outcome-ledger">
      <MetricStamp label="Overall admit rate" observation={admitRate} />
      <MetricStamp label={observationSourceKind(college.observations.graduationRate).isFederal ? "Completion rate" : "6-year graduation"} observation={college.observations.graduationRate} />
    </div>
    <p className="card-cost-context">{feeContext}</p>
    <div className="card-field-line"><GraduationCap size={16} aria-hidden="true" />
      {selectedMajor && majorEvidence ? <span><strong>{selectedMajor}</strong> · {percentFormatter.format(majorEvidence.share)} of all awards</span> : <span>{college.majors.length} broad {college.majors.length === 1 ? "field" : "fields"} reported <span className="field-dot">·</span> <Link href={`/colleges/${college.slug}#majors-heading`}>Explore fields</Link></span>}
    </div>
    {selectedMajor ? <p className="rate-clarifier"><Info size={14} aria-hidden="true" />{formatObservation(admitRate)} is college-wide, not a {selectedMajor} admission rate.</p> : null}
    <details className="card-source-details">
      <summary><BookOpen size={14} aria-hidden="true" /> Sources & what these numbers mean <ChevronDown size={14} aria-hidden="true" /></summary>
      <div><SourceBadge observation={tuition[0].observation} /><p>Tuition is shown before aid. Any required fees or campus budget fee allowance, plus living costs, are separate. Historical average net price describes the reported federal aid cohort after grants and scholarships; it is not your personal quote. Rates describe past cohorts. Federal completion measures finishing within 150% of normal program time; official six-year graduation uses each college&apos;s stated cohort.</p>
      {records.map(({label,observation}) => <div className="card-source-row" key={label}><strong>{label}</strong><span>{formatObservation(observation)} · {observation.periodLabel}</span><a href={observation.sourceUrl} target="_blank" rel="noreferrer">{observation.publisher}<ArrowUpRight size={12} aria-hidden="true" /></a></div>)}
      <NegativeNetPriceNote value={college.observations.averageNetPrice.value} />
      <span>{selectivityLabel(admitRate.value)}</span></div>
    </details>
    <div className="college-card-footer">
      <button className={`compare-button ${isSelected ? "is-active" : ""}`} type="button" aria-pressed={isSelected}
        aria-label={isSelected ? `Remove ${college.name} from comparison` : `Add ${college.name} to comparison`} onClick={() => onCompare(college)}>
        {isSelected ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{isSelected ? "Selected" : "Compare"}
      </button>
      <Link className="evidence-link" href={`/colleges/${college.slug}`}>View college <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </div>
  </article>;
});

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <label className="filter-field" htmlFor={id}>
      <span>{label}</span>
      <div className="select-wrap">
        <select id={id} aria-label={label} value={value} onChange={onChange}>
          {children}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </div>
    </label>
  );
}

function FilterControls({ state, dispatch, savedCount, idPrefix, stateOptions, ownershipOptions, majorOptions }: {
  state: ExplorerState; dispatch: (action: ExplorerAction) => void; savedCount: number; idPrefix: string;
  stateOptions: string[]; ownershipOptions: string[]; majorOptions: string[];
}) {
  const extraCount = [state.band, state.minGraduation, state.minEarnings, state.maxPrice, state.setting].filter(Boolean).length;
  const field = (key: FilterKey, label: string, options: Array<[string, string]>) => <SelectField
    id={`${idPrefix}-${key}-filter`} label={label} value={state[key]}
    onChange={(event) => dispatch({ type: "set", key, value: event.target.value })}>
    {options.map(([value, text]) => <option value={value} key={value}>{text}</option>)}
  </SelectField>;
  return <div className="filter-controls grouped-filters">
    <fieldset className="filter-section"><legend>Your search</legend><div className="filter-section-grid">
      {field("major", "Field of study", [["", "Any field"], ...majorOptions.map((value): [string, string] => [value, value])])}
      {field("stateCode", "Location", [["", "Anywhere in the U.S."], ...stateOptions.map((value): [string, string] => [value, stateNames[value] || value])])}
      {field("institutionLevel", "College level", [["", "Two- and four-year"], ["Four-year", "Four-year"], ["Two-year", "Two-year"]])}
      {field("ownership", "College type", [["", "Public & private"], ...ownershipOptions.map((value): [string, string] => [value, value])])}
    </div></fieldset>
    <fieldset className="filter-section"><legend>Cost & campus</legend><div className="filter-section-grid">
      {field("maxTuitionOnly", "Out-of-state / private tuition", [["", "Any tuition"], ["30000", "$30,000 or less"], ["50000", "$50,000 or less"], ["70000", "$70,000 or less"], ["90000", "$90,000 or less"]])}
      {field("enrollmentBand", "Undergraduate size", [["", "Any size"], ["small", "Under 10,000"], ["medium", "10,000–24,999"], ["large", "25,000 or more"]])}
    </div><p className="filter-context">This filter uses out-of-state tuition for public colleges and published tuition for private colleges. Fees, housing, and other living costs are separate.</p></fieldset>
    <details className="advanced-filters filter-section" open={extraCount > 0 || undefined}>
      <summary><span>Admissions & more{extraCount > 0 && <small>{extraCount} active</small>}</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="filter-section-grid">
        {field("band", "Overall acceptance rate", [["", "Any reported rate"], ["very-high-reach", "10% or less"], ["reach", "Over 10% to 25%"], ["competitive", "Over 25% to 50%"], ["accessible", "Over 50%"]])}
        {field("setting", "Campus setting", [["", "Any setting"], ["City", "City"], ["Suburb", "Suburb"], ["Town", "Town"], ["Rural", "Rural"]])}
        {field("minGraduation", "Minimum completion rate", [["", "Any reported rate"], ["0.6", "60% or higher"], ["0.75", "75% or higher"], ["0.9", "90% or higher"]])}
        {field("minEarnings", "Median earnings", [["", "Any reported earnings"], ["75000", "$75,000 or higher"], ["100000", "$100,000 or higher"], ["125000", "$125,000 or higher"]])}
        {field("maxPrice", "Historical average net price", [["", "Any reported net price"], ["15000", "$15,000 or less"], ["20000", "$20,000 or less"], ["30000", "$30,000 or less"], ["40000", "$40,000 or less"]])}
      </div><p className="filter-context">Net price is the reported average after grants for a past federal aid cohort, not a quote for your family. Colleges with missing values are excluded only when that metric is filtered.</p>
    </details>
    <fieldset className="filter-section"><legend>Collection</legend><div className="filter-checks">
      {([
        ["ucOnly", "UC campuses only"], ["savedOnly", `My saved colleges (${savedCount})`], ["completeOnly", "All key metrics reported"],
      ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={state[key]} onChange={() => dispatch({ type: "toggle", key })} /><span>{label}</span></label>)}
    </div></fieldset>
  </div>;
}

type AutocompleteItem =
  | { kind: "college"; college: ClientCollege; label: string }
  | { kind: "major"; major: string; label: string };

function SearchBox({
  colleges,
  majorOptions,
  value,
  onChange,
  onMajor,
  onSubmit,
  resultCount,
  size = "large",
}: {
  colleges: ClientCollege[];
  majorOptions: string[];
  value: string;
  onChange: (value: string) => void;
  onMajor: (major: string) => void;
  onSubmit?: () => void;
  resultCount?: number;
  size?: "large" | "compact";
}) {
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalized = value.trim().toLowerCase();

  const items = useMemo<AutocompleteItem[]>(() => {
    if (normalized.length < 2) return [];
    const majorMatches = matchingMajors(normalized, majorOptions)
      .slice(0, 3)
      .map((major) => ({ kind: "major" as const, major, label: major }));
    const collegeMatches = filterCollegesByQuery(colleges, normalized, majorOptions)
      .slice(0, majorMatches.length ? 3 : 5)
      .map((college) => ({
        kind: "college" as const,
        college,
        label: compactName(college),
      }));
    return [...majorMatches, ...collegeMatches];
  }, [colleges, majorOptions, normalized]);

  const open = focused && items.length > 0;

  function choose(item: AutocompleteItem) {
    if (item.kind === "college") {
      router.push(`/colleges/${item.college.slug}`);
      return;
    }
    onMajor(item.major);
    onChange("");
    setFocused(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && event.key === "ArrowDown" && items.length) {
      setFocused(true);
      setActiveIndex(0);
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && normalized && (!open || activeIndex < 0)) {
      event.preventDefault();
      setFocused(false);
      setActiveIndex(-1);
      onSubmit?.();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      setActiveIndex((current) => Math.min(items.length - 1, current + 1));
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      setActiveIndex((current) => Math.max(0, current - 1));
      event.preventDefault();
    } else if (event.key === "Enter" && activeIndex >= 0) {
      choose(items[activeIndex]);
      event.preventDefault();
    } else if (event.key === "Escape") {
      setFocused(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={`search-combobox search-${size}`}>
      <div className="search-input-shell">
        <Search size={20} aria-hidden="true" />
        <label className="sr-only" htmlFor={`college-search-${size}`}>
          Search colleges, broad fields, or places
        </label>
        <input
          id={`college-search-${size}`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`search-suggestions-${size}`}
          aria-activedescendant={
            open && activeIndex >= 0 && activeIndex < items.length
              ? `search-suggestion-${size}-${activeIndex}`
              : undefined
          }
          value={value}
          maxLength={120}
          onChange={(event) => {
            onChange(event.target.value.slice(0, 120));
            setActiveIndex(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onKeyDown={handleKeyDown}
          placeholder={
            size === "compact"
              ? "Search colleges or fields of study"
              : "Search colleges, broad fields, or places"
          }
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
          >
            <X size={17} />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="search-suggestions"
            id={`search-suggestions-${size}`}
            role="listbox"
            aria-label="Search suggestions"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, pointerEvents: "none" }}
          >
            {items.map((item, index) => (
              <button
                type="button"
                id={`search-suggestion-${size}-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                className={activeIndex === index ? "is-active" : ""}
                key={
                  item.kind === "college"
                    ? item.college.unitId
                    : `major-${item.major}`
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
              >
                {item.kind === "college" ? (
                  <CollegeLogo college={item.college} variant="suggestion" />
                ) : (
                  <span className="suggestion-mark" aria-hidden="true">
                    <GraduationCap size={16} />
                  </span>
                )}
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {item.kind === "college"
                      ? `${item.college.city}, ${item.college.state}`
                      : "Broad federal field"}
                  </small>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {normalized && typeof resultCount === "number" ? (
        <button
          className="search-results-action"
          type="button"
          onClick={onSubmit}
          aria-controls="results-list"
        >
          <span>
            <strong>{resultCount}</strong>{" "}
            {resultCount === 1 ? "college matches" : "colleges match"}
          </span>
          <span>
            View results
            <ArrowDown size={15} aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

async function requestDirectoryPage({
  filters,
  savedIds,
  selectedIds,
  offset,
  signal,
}: {
  filters: DirectoryFilters;
  savedIds: number[];
  selectedIds: number[];
  offset: number;
  signal?: AbortSignal;
}): Promise<CollegeDirectoryPage> {
  const limit = DIRECTORY_PAGE_SIZE;
  if (filters.savedOnly) {
    const response = await fetch("/api/colleges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, savedIds, selectedIds, offset, limit }),
      signal,
    });
    if (!response.ok) throw new Error("The college list could not be searched.");
    return response.json() as Promise<CollegeDirectoryPage>;
  }
  const params = serializeDirectoryFilters(filters, selectedIds);
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  const response = await fetch(`/api/colleges?${params}`, { signal });
  if (!response.ok) throw new Error("The college list could not be searched.");
  return response.json() as Promise<CollegeDirectoryPage>;
}

export function CollegeSearchApp({
  initialPage,
  initialFilters,
  mode = "home",
  adviserAvailable = false,
}: {
  initialPage: CollegeDirectoryPage;
  initialFilters: DirectoryFilters;
  mode?: "home" | "explore";
  adviserAvailable?: boolean;
}) {
  const [state, dispatch] = useReducer(
    explorerReducer,
    { ...defaultExplorerState, ...initialFilters },
  );
  const {
    canMutate: canMutateSavedColleges,
    hydrated: savedListHydrated,
    ids: saved,
    retrySync: retrySavedList,
    syncPhase: savedSyncPhase,
    toggleSaved: toggleSavedId,
  } = useSavedColleges();
  const [selected, setSelected] = useState<number[]>(() =>
    initialPage.selectedItems.map((college) => college.unitId),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [shareUrl, setShareUrl] = useState("");
  const [status, setStatus] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [directoryPage, setDirectoryPage] = useState(initialPage);
  const [moreRequest, setMoreRequest] = useState<{ id: number; key: string } | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [pageRequestStatus, setPageRequestStatus] = useState(() => ({
    key: directoryRequestKey(
      initialFilters,
      noSavedIds,
      initialPage.selectedItems.map((college) => college.unitId),
    ),
    error: "",
    failedSearch: false,
  }));
  const requestSequence = useRef(0);
  const deferredQuery = useDeferredValue(state.query);
  const lenis = useLenis();
  const stableFacets = initialPage.facets;
  const stateOptions = stableFacets.states;
  const ownershipOptions = stableFacets.ownerships;
  const majorOptions = stableFacets.majorOptions;
  const evidenceCounts = stableFacets.evidenceCounts;
  const catalogSize = stableFacets.totalInstitutions;
  const colleges = directoryPage.items;
  const resultCount = directoryPage.total;
  const requestFilters = useMemo(
    () => ({ ...state, query: deferredQuery }),
    [deferredQuery, state],
  );
  const savedIdsForRequest = requestFilters.savedOnly ? saved : noSavedIds;
  const currentDirectoryRequestKey = directoryRequestKey(
    requestFilters,
    savedIdsForRequest,
    selected,
  );
  const loadingMore = moreRequest?.key === currentDirectoryRequestKey;
  const loadingPage = hydrated && pageRequestStatus.key !== currentDirectoryRequestKey;
  const directoryError = pageRequestStatus.key === currentDirectoryRequestKey
    ? pageRequestStatus.error
    : "";
  const searchFailed = Boolean(directoryError) && pageRequestStatus.failedSearch;

  useEffect(() => {
    let cancelled = false;
    const restore = () => {
      if (!["/", "/explore"].includes(window.location.pathname)) return;
      const params = new URLSearchParams(window.location.search);
      const restoredState = parseDirectoryFilters(params, stableFacets);
      const restoredComparison = [...new Set(
        (params.get("compare") ?? "")
          .split(",")
          .map(Number)
          .filter((unitId) => Number.isSafeInteger(unitId) && unitId > 0),
      )].slice(0, 4);
      queueMicrotask(() => {
        if (cancelled || !["/", "/explore"].includes(window.location.pathname)) return;
        dispatch({ type: "hydrate", value: restoredState });
        setSelected(restoredComparison);
        setHydrated(true);
      });
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", restore);
    };
  }, [stableFacets]);

  useEffect(() => {
    if (!hydrated || !["/", "/explore"].includes(window.location.pathname)) return;
    const params = serializeDirectoryFilters(state, selected);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [hydrated, selected, state]);

  useEffect(() => {
    if (!hydrated || !["/", "/explore"].includes(window.location.pathname)) return;
    const controller = new AbortController();
    const requestId = ++requestSequence.current;
    const requestedSelectedIds = selected;
    void requestDirectoryPage({
      filters: requestFilters,
      savedIds: savedIdsForRequest,
      selectedIds: selected,
      offset: 0,
      signal: controller.signal,
    })
      .then((page) => {
        if (requestSequence.current === requestId) {
          setDirectoryPage(page);
          setSelected((current) => reconcileDirectorySelection(
            current,
            requestedSelectedIds,
            page.selectedItems.map((college) => college.unitId),
          ));
          setPageRequestStatus({ key: currentDirectoryRequestKey, error: "", failedSearch: false });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted || requestSequence.current !== requestId) return;
        setPageRequestStatus({
          key: currentDirectoryRequestKey,
          error: error instanceof Error ? error.message : "The college list could not be searched.",
          failedSearch: true,
        });
      });
    return () => controller.abort();
  }, [currentDirectoryRequestKey, hydrated, requestFilters, savedIdsForRequest, searchAttempt, selected]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const results = directoryPage.items;
  const availableCollegeById = useMemo(
    () => new Map(
      [...directoryPage.items, ...directoryPage.selectedItems].map((college) => [college.unitId, college]),
    ),
    [directoryPage.items, directoryPage.selectedItems],
  );
  const selectedColleges = selected.flatMap((unitId) => {
    const college = availableCollegeById.get(unitId);
    return college ? [college] : [];
  });

  async function loadMore() {
    if (directoryPage.nextOffset === null || loadingMore || loadingPage || searchFailed) return;
    const requestId = ++requestSequence.current;
    setMoreRequest({ id: requestId, key: currentDirectoryRequestKey });
    try {
      const page = await requestDirectoryPage({
        filters: requestFilters,
        savedIds: savedIdsForRequest,
        selectedIds: selected,
        offset: directoryPage.nextOffset,
      });
      if (requestSequence.current !== requestId) return;
      setDirectoryPage((current) => ({
        ...page,
        items: [...current.items, ...page.items],
      }));
      setPageRequestStatus({ key: currentDirectoryRequestKey, error: "", failedSearch: false });
    } catch (error) {
      if (requestSequence.current === requestId) {
        setPageRequestStatus({
          key: currentDirectoryRequestKey,
          error: error instanceof Error ? error.message : "More colleges could not be loaded.",
          failedSearch: false,
        });
      }
    } finally {
      setMoreRequest((current) => current?.id === requestId ? null : current);
    }
  }

  function toggleSaved(college: ClientCollege) {
    toggleSavedId(college.unitId);
    setStatus(saved.includes(college.unitId) ? `${compactName(college)} removed from your list.` : `${compactName(college)} added to your list.`);
  }

  async function shareSearch() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Search link copied. Your filters and comparison travel with it.");
      setShareUrl("");
    } catch {
      setShareUrl(window.location.href);
    }
  }

  function toggleCompare(college: ClientCollege) {
    setSelected((current) => {
      if (current.includes(college.unitId)) {
        return current.filter((unitId) => unitId !== college.unitId);
      }
      if (current.length >= 4) {
        setStatus("Compare up to four colleges at a time.");
        return current;
      }
      return [...current, college.unitId];
    });
  }

  function applyMajor(major: string) {
    dispatch({ type: "set", key: "major", value: major });
    scrollToExplore();
  }

  function submitSearch() {
    scrollToExplore();
    window.setTimeout(
      () =>
        document
          .getElementById("results-summary")
          ?.focus({ preventScroll: true }),
      lenis ? 1100 : 450,
    );
  }

  function scrollToExplore() {
    if (lenis) {
      lenis.scrollTo("#explore", { offset: -86, duration: 1.05 });
      return;
    }
    document.getElementById("explore")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  const activeFilters = [
    state.query
      ? {
          label: `Search: ${state.query}`,
          clear: () =>
            dispatch({ type: "set", key: "query", value: "" }),
        }
      : null,
    state.major
      ? {
          label: state.major,
          clear: () =>
            dispatch({ type: "set", key: "major", value: "" }),
        }
      : null,
    state.stateCode
      ? {
          label: stateNames[state.stateCode] ?? state.stateCode,
          clear: () =>
            dispatch({ type: "set", key: "stateCode", value: "" }),
        }
      : null,
    state.ownership
      ? {
          label: state.ownership,
          clear: () =>
            dispatch({ type: "set", key: "ownership", value: "" }),
        }
      : null,
    state.institutionLevel
      ? {
          label: state.institutionLevel,
          clear: () =>
            dispatch({ type: "set", key: "institutionLevel", value: "" }),
        }
      : null,
    state.band
      ? {
          label: ({ "very-high-reach": "Admit rate ≤ 10%", reach: "Admit rate over 10% to 25%", competitive: "Admit rate over 25% to 50%", accessible: "Admit rate > 50%" } as Record<string, string>)[state.band] || "Acceptance-rate range",
          clear: () =>
            dispatch({ type: "set", key: "band", value: "" }),
        }
      : null,
    state.maxPrice
      ? {
          label: `Historical net price ≤ $${Number(state.maxPrice).toLocaleString()}`,
          clear: () =>
            dispatch({ type: "set", key: "maxPrice", value: "" }),
        }
      : null,
    state.maxTuitionOnly
      ? {
          label: `Out-of-state / published tuition ≤ $${Number(
            state.maxTuitionOnly,
          ).toLocaleString()}`,
          clear: () => dispatch({ type: "clearTuitionOnly" }),
        }
      : null,
    state.maxTuition
      ? {
          label: `Tuition + reported fees ≤ $${Number(
            state.maxTuition,
          ).toLocaleString()}`,
          clear: () =>
            dispatch({ type: "set", key: "maxTuition", value: "" }),
        }
      : null,
    state.enrollmentBand
      ? {
          label:
            state.enrollmentBand === "small"
              ? "Under 10,000 students"
              : state.enrollmentBand === "medium"
                ? "10,000–24,999 students"
                : "25,000+ students",
          clear: () =>
            dispatch({ type: "set", key: "enrollmentBand", value: "" }),
        }
      : null,
    state.minGraduation
      ? {
          label: `Completion rate ≥ ${Math.round(
            Number(state.minGraduation) * 100,
          )}%`,
          clear: () =>
            dispatch({ type: "set", key: "minGraduation", value: "" }),
        }
      : null,
    state.minEarnings
      ? {
          label: `Median earnings ≥ $${Number(
            state.minEarnings,
          ).toLocaleString()}`,
          clear: () =>
            dispatch({ type: "set", key: "minEarnings", value: "" }),
        }
      : null,
    state.setting
      ? {
          label: `${state.setting} setting`,
          clear: () =>
            dispatch({ type: "set", key: "setting", value: "" }),
        }
      : null,
    state.ucOnly
      ? {
          label: "UC campuses",
          clear: () => dispatch({ type: "toggle", key: "ucOnly" }),
        }
      : null,
    state.completeOnly
      ? {
          label: "All key metrics available",
          clear: () => dispatch({ type: "toggle", key: "completeOnly" }),
        }
      : null,
    state.savedOnly
      ? {
          label: "Saved",
          clear: () => dispatch({ type: "toggle", key: "savedOnly" }),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  const compareHref = `/compare?colleges=${selected.join(",")}${
    state.major ? `&major=${encodeURIComponent(state.major)}` : ""
  }`;
  const savedListUnavailable = state.savedOnly && !savedListHydrated;
  const savedListFailed =
    savedListUnavailable && savedSyncPhase === "error";

  return (
    <>
      <SiteHeader />

      <main
        id="main-content"
        className={mode === "explore" ? "explore-page" : ""}
        data-discovery-mode={mode}
      >
        <DiscoveryHero catalogSize={catalogSize} onExplore={() => {
          scrollToExplore();
          document.getElementById("college-search-compact")?.focus({ preventScroll: true });
        }} />

        <section className="explore-section research-explorer" id="explore" aria-label="Explore colleges">
          <div className="research-section-heading">
            <div><h2>Explore colleges</h2><span>{catalogSize.toLocaleString()} in this collection</span></div>
            <div className="research-heading-links"><Link href="/adviser"><MessageSquare size={17} aria-hidden="true" /><span>AI adviser{!adviserAvailable && <small className="adviser-link-status">In preparation</small>}</span></Link></div>
          </div>
        <div className="explorer-shell">
          <div className="results-panel">
            <div className="results-search-dock">
              <SearchBox
                colleges={colleges}
                majorOptions={majorOptions}
                size="compact"
                value={state.query}
                onChange={(value) =>
                  dispatch({ type: "set", key: "query", value })
                }
                onMajor={applyMajor}
                onSubmit={submitSearch}
              />
            </div>
            <div className="explorer-filter-bar" aria-label="Quick filters">
              <SelectField id="quick-major" label="Field of study" value={state.major} onChange={(event) => dispatch({ type: "set", key: "major", value: event.target.value })}>
                <option value="">Any field</option>{majorOptions.map((field) => <option key={field} value={field}>{field}</option>)}
              </SelectField>
              <SelectField id="quick-location" label="Location" value={state.stateCode} onChange={(event) => dispatch({ type: "set", key: "stateCode", value: event.target.value })}>
                <option value="">Anywhere</option>{stateOptions.map((code) => <option key={code} value={code}>{stateNames[code] || code}</option>)}
              </SelectField>
              <SelectField id="quick-tuition" label="Out-of-state / private tuition" value={state.maxTuitionOnly} onChange={(event) => dispatch({ type: "set", key: "maxTuitionOnly", value: event.target.value })}>
                <option value="">Any tuition</option><option value="30000">Up to $30,000</option><option value="50000">Up to $50,000</option><option value="70000">Up to $70,000</option><option value="90000">Up to $90,000</option>
              </SelectField>
                <Dialog.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <Dialog.Trigger asChild>
                    <button className="all-filters-button" type="button">
                      <SlidersHorizontal size={17} aria-hidden="true" />
                      All filters
                      {activeFilters.length ? (
                        <span>{activeFilters.length}</span>
                      ) : null}
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="filter-dialog-overlay" />
                    <Dialog.Content className="filter-dialog explorer-filter-dialog" data-lenis-prevent>
                      <div className="filter-dialog-head">
                        <div>
                          <Dialog.Title>Refine your search</Dialog.Title>
                          <Dialog.Description>
                            Choose what matters. Your results update as you go.
                          </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                          <button type="button" aria-label="Close filters">
                            <X size={19} aria-hidden="true" />
                          </button>
                        </Dialog.Close>
                      </div>
                      <div className="filter-dialog-body" data-lenis-prevent>
                      <FilterControls
                        state={state}
                        dispatch={dispatch}
                        savedCount={saved.length}
                        idPrefix="dialog"
                        stateOptions={stateOptions}
                        ownershipOptions={ownershipOptions}
                        majorOptions={majorOptions}
                      />
                      </div>
                      <div className="filter-dialog-footer">
                      <button className="filter-reset-button" type="button" onClick={() => dispatch({ type: "clear" })}>Reset all</button>
                      <Dialog.Close asChild>
                        <button className="apply-filters-button" type="button">
                          {loadingPage ? "Updating results…" : searchFailed ? "Review search error" : savedListUnavailable
                            ? savedListFailed
                              ? "Saved list unavailable"
                              : "Checking saved list"
                            : `Show ${resultCount.toLocaleString()} colleges`}
                        </button>
                      </Dialog.Close>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
            </div>
            <div className="results-toolbar"><div>
                <p
                  className="results-count"
                  id="results-summary"
                  tabIndex={-1}
                  aria-live="polite"
                >
                  {loadingPage ? "Updating colleges…" : searchFailed ? "Search unavailable" : savedListUnavailable ? (
                    savedListFailed ? (
                      "Saved list unavailable"
                    ) : (
                      "Checking saved list…"
                    )
                  ) : (
                    <>
                      <strong>{resultCount.toLocaleString()}</strong>{" "}
                      {resultCount === 1 ? "college" : "colleges"}
                      {results.length < resultCount ? <span> · {results.length.toLocaleString()} loaded</span> : null}
                    </>
                  )}
                </p>
              </div>

              <div className="results-tools"><SelectField
                id="sort-results"
                label="Sort by"
                value={state.sort}
                onChange={(event) =>
                  dispatch({
                    type: "set",
                    key: "sort",
                    value: event.target.value,
                  })
                }
              >
                <option value="featured">Featured colleges</option>
                <option value="name">College name: A–Z</option>
                {state.major ? (
                  <option value="major">Field match: strongest first</option>
                ) : null}
                <option value="admit-low">
                  Acceptance rate: lowest first
                </option>
                <option value="admit-high">
                  Acceptance rate: highest first
                </option>
                {state.sort === "tuition" ? <option value="tuition" disabled>Tuition + reported fees: lowest first (legacy link)</option> : null}
                <option value="tuition-only">Out-of-state / published tuition: lowest first</option>
                <option value="price">Historical net price: lowest first</option>
                <option value="graduation">
                  Graduation rate: highest first
                </option>
                <option value="enrollment">Enrollment: largest first</option>
                <option value="earnings">Median earnings: highest first</option>
              </SelectField>
                <div className="view-switch" aria-label="Result layout">
                  <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={17} aria-hidden="true" /></button>
                  <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={19} aria-hidden="true" /></button>
                </div>
                <button className="share-search" type="button" aria-label="Copy search link" onClick={() => void shareSearch()}><Copy size={17} aria-hidden="true" /></button>
              </div>
            </div>
            {state.sort === "featured" && !state.query ? <p className="featured-order-note">Familiar starting points, followed by the full collection. Not a ranking.</p> : null}
            {shareUrl ? <label className="share-fallback">Copy this search link<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label> : null}

            {directoryError ? (
              <div className="empty-state" role="alert">
                <CircleAlert size={24} aria-hidden="true" />
                <p>{directoryError}</p>
                {searchFailed && <button type="button" onClick={() => {
                  setPageRequestStatus({ key: "", error: "", failedSearch: false });
                  setSearchAttempt((attempt) => attempt + 1);
                }}>Retry search</button>}
              </div>
            ) : null}

            {activeFilters.length ? (
              <div className="filter-chips" aria-label="Applied filters">
                {activeFilters.map((filter) => (
                  <button
                    type="button"
                    key={filter.label}
                    aria-label={`Remove ${filter.label} filter`}
                    onClick={filter.clear}
                  >
                    {filter.label}
                    <X size={13} aria-hidden="true" />
                  </button>
                ))}
                <button
                  type="button"
                  className="clear-all-chip"
                  onClick={() => dispatch({ type: "clear" })}
                >
                  Clear all
                </button>
              </div>
            ) : null}

            {state.major ? <details className="field-evidence-note">
              <summary><GraduationCap size={17} aria-hidden="true" /><span>About these field matches</span><ChevronDown size={15} aria-hidden="true" /></summary>
              <p>These colleges report a bachelor’s- or associate-level program in this broad field. This is historical federal program data, not a live list of exact majors. Acceptance rates describe the whole college. <Link href="/methodology#major-data">How field data works</Link></p>
            </details> : null}

            <div
              className={`results-list research-results is-${view}`}
              id="results-list"
              aria-busy={loadingPage || loadingMore || state.query !== deferredQuery || savedListUnavailable}
              inert={loadingPage || savedListUnavailable || undefined}
              data-updating={loadingPage || undefined}
            >
              {!savedListUnavailable && !searchFailed
                ? results.map((college) => (
                <CollegeCard
                  key={college.unitId}
                  college={college}
                  selectedMajor={state.major}
                  isSelected={selected.includes(college.unitId)}
                  isSaved={saved.includes(college.unitId)}
                  saveDisabled={!canMutateSavedColleges}
                  onCompare={toggleCompare}
                  onSave={toggleSaved}
                />
                  ))
                : null}
            </div>

            {savedListUnavailable ? (
              <div className="empty-state" role={savedListFailed ? "alert" : "status"}>
                <Database size={29} aria-hidden="true" />
                <h3>
                  {savedListFailed
                    ? "Your saved list is unavailable."
                    : "Checking your saved list…"}
                </h3>
                <p>
                  {savedListFailed
                    ? "CollegeSearch will not represent an unavailable account list as empty. Retry the account list or remove the Saved filter."
                    : "Your account scope is being verified before saved colleges appear here."}
                </p>
                {savedListFailed ? (
                  <button type="button" onClick={retrySavedList}>
                    Retry saved list
                  </button>
                ) : null}
              </div>
            ) : !searchFailed && resultCount === 0 ? (
              <div className="empty-state">
                <CircleAlert size={29} aria-hidden="true" />
                <h3>No college meets every active filter.</h3>
                <p>
                  Try removing a filter or resetting your search. Missing data is never
                  treated as zero to force a match.
                </p>
                <button type="button" onClick={() => dispatch({ type: "clear" })}>
                  Reset filters
                </button>
              </div>
            ) : null}

            {!searchFailed && directoryPage.nextOffset !== null ? (
              <button
                className="load-more"
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore || loadingPage || savedListUnavailable}
              >
                {loadingMore ? "Loading colleges…" : `Show ${Math.min(DIRECTORY_PAGE_SIZE, resultCount - results.length)} more colleges`}
                <ArrowDown size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <aside className="explorer-support" aria-label="College research help">
            <section className="explorer-adviser-card" aria-labelledby="explorer-adviser-heading">
              <span className="explorer-adviser-icon"><MessageSquare size={21} aria-hidden="true" /></span>
              <h3 id="explorer-adviser-heading">Your college adviser</h3>
              <p>A place to work through your interests, priorities, and college options.</p>
              {!adviserAvailable && <div className="adviser-preparation"><span>In preparation</span><p>AI chat isn’t available yet. Preference matching is ready to use.</p></div>}
              <Link className="adviser-open-link" href={adviserAvailable ? "/adviser" : "/match"}>{adviserAvailable ? "Open AI adviser" : "Find my fit"} <ArrowRight size={16} aria-hidden="true" /></Link>
              {!adviserAvailable && <Link className="adviser-match-link" href="/adviser">AI adviser status & history</Link>}
            </section>
            <section className="explorer-source-card"><ShieldCheck size={20} aria-hidden="true" /><h3>Know where the numbers come from.</h3><p>U.S. Department of Education data and reviewed college records. Check each metric’s source and year.</p><Link href="/data-sources">Sources & coverage <ArrowUpRight size={15} aria-hidden="true" /></Link></section>
          </aside>
        </div>
      </section>

      <section className="research-data-note" aria-label="Data trust statement">
        <ShieldCheck size={21} aria-hidden="true" />
        <div><strong>Good decisions start with clear information.</strong><p>College Scorecard and official college records. Every metric keeps its source and reporting period. UC admissions include preliminary Fall 2026 records.</p>
        <details><summary>What’s in this collection?</summary><p>{evidenceCounts.reviewedInstitutionRecords} reviewed institution records · {evidenceCounts.reviewedCollegeAdmissions} college admission headlines · {evidenceCounts.firstPartyAdmissions} first-party admission headlines. Field filters use 2024-2025 federal program and award data. Federal baseline metrics use their own dated cohorts.</p></details></div>
        <Link href="/data-sources">See our sources <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section>

      </main>

      <SiteFooter />

      <AnimatePresence>
        {selected.length ? (
          <motion.aside
            className="compare-tray"
            aria-label="Comparison list"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <div className="compare-tray-summary">
              <span>Comparison</span>
              <strong>{selected.length} of 4 selected</strong>
            </div>
            <div className="compare-tray-colleges">
              {selectedColleges.map((college) => (
                <button
                  type="button"
                  key={college.unitId}
                  aria-label={`Remove ${college.name} from comparison`}
                  onClick={() => toggleCompare(college)}
                >
                  <CollegeLogo college={college} variant="tray" />
                  <strong>{compactName(college)}</strong>
                  <X size={13} aria-hidden="true" />
                </button>
              ))}
            </div>
            {selected.length >= 2 ? (
              <Link className="compare-tray-action" href={compareHref}>
                Compare
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : (
              <span className="compare-tray-hint">Add one more college</span>
            )}
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {status ? (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            <Check size={15} aria-hidden="true" />
            {status}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
