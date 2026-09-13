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
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import { CampusCarousel } from "@/app/components/CampusCarousel";
import { useSavedColleges } from "@/app/components/saved/SavedCollegesProvider";
import {
  compactName,
  formatObservation,
  isUniversityOfCalifornia,
  majorEvidenceFor,
  observationSourceKind,
  percentFormatter,
  selectivityLabel,
  type ClientCollege,
  type ClientObservation,
} from "@/app/lib/college-client-record";
import {
  filterCollegesByQuery,
  MAJOR_OPTIONS,
  matchingMajors,
  STATE_NAMES,
} from "@/app/lib/college-search";
import {
  matchesAdvancedExplorerFilters,
  type EnrollmentBand,
} from "@/app/lib/explorer-filters";

type ExplorerState = {
  query: string;
  major: string;
  stateCode: string;
  ownership: string;
  band: string;
  maxPrice: string;
  maxTuition: string;
  enrollmentBand: string;
  minGraduation: string;
  minEarnings: string;
  setting: string;
  ucOnly: boolean;
  completeOnly: boolean;
  savedOnly: boolean;
  sort: string;
  visibleCount: number;
};

type FilterKey =
  | "query"
  | "major"
  | "stateCode"
  | "ownership"
  | "band"
  | "maxPrice"
  | "maxTuition"
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
  | { type: "hydrate"; value: Partial<ExplorerState> }
  | { type: "showMore" }
  | { type: "clear" };

const defaultExplorerState: ExplorerState = {
  query: "",
  major: "",
  stateCode: "",
  ownership: "",
  band: "",
  maxPrice: "",
  maxTuition: "",
  enrollmentBand: "",
  minGraduation: "",
  minEarnings: "",
  setting: "",
  ucOnly: false,
  completeOnly: false,
  savedOnly: false,
  sort: "name",
  visibleCount: 12,
};

const stateNames = STATE_NAMES;
const majorOptions = MAJOR_OPTIONS;
function explorerReducer(
  state: ExplorerState,
  action: ExplorerAction,
): ExplorerState {
  if (action.type === "set") {
    return { ...state, [action.key]: action.value, ...(action.key === "major" && !action.value && state.sort === "major" ? { sort: "name" } : {}), visibleCount: 12 };
  }
  if (action.type === "toggle") {
    return {
      ...state,
      [action.key]: !state[action.key],
      visibleCount: 12,
    };
  }
  if (action.type === "hydrate") {
    return { ...state, ...action.value, visibleCount: 12 };
  }
  if (action.type === "showMore") {
    return { ...state, visibleCount: state.visibleCount + 12 };
  }
  if (action.type === "clear") {
    return { ...defaultExplorerState };
  }
  return state;
}

function matchesBand(rate: number | null, band: string) {
  if (!band) return true;
  if (rate === null) return false;
  if (band === "very-high-reach") return rate <= 0.1;
  if (band === "reach") return rate > 0.1 && rate <= 0.25;
  if (band === "competitive") return rate > 0.25 && rate <= 0.5;
  return rate > 0.5;
}

function compareNullable(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc" = "asc",
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function hasCompleteCoreData(college: ClientCollege) {
  return [
    college.observations.admitRate,
    college.observations.averageNetPrice,
    college.observations.graduationRate,
    college.observations.undergraduateEnrollment,
  ].every((observation) => observation.value !== null);
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

function MetricStamp({ label, observation, emphasis = false }: { label: string; observation: ClientObservation; emphasis?: boolean }) {
  return <div className={`metric-stamp ${emphasis ? "metric-primary" : ""}`}>
    <span className="metric-label">{label}</span>
    <strong>{formatObservation(observation)}</strong>
    <small>{observation.periodLabel}</small>
  </div>;
}

const CollegeCard = memo(function CollegeCard({ college, selectedMajor, isSelected, isSaved, saveDisabled, onCompare, onSave }: {
  college: ClientCollege; selectedMajor: string; isSelected: boolean; isSaved: boolean; saveDisabled: boolean;
  onCompare: (college: ClientCollege) => void; onSave: (college: ClientCollege) => void;
}) {
  const admitRate = college.observations.admitRate;
  const majorEvidence = selectedMajor ? majorEvidenceFor(college, selectedMajor) : null;
  const records = [
    { label: "Average annual cost after grants", observation: college.observations.averageNetPrice },
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
    <div className="college-character"><span>{college.ownership === "Private nonprofit" ? "Private nonprofit" : "Public university"}</span><span>{college.setting} campus</span><span title={`${college.observations.undergraduateEnrollment.periodLabel} · ${college.observations.undergraduateEnrollment.publisher}`}>{formatObservation(college.observations.undergraduateEnrollment)} undergrads</span></div>
    <div className="metric-ledger">
      <MetricStamp label="Net price / year" observation={college.observations.averageNetPrice} emphasis />
      <MetricStamp label="Overall admit rate" observation={admitRate} />
      <MetricStamp label={observationSourceKind(college.observations.graduationRate).isFederal ? "Completion rate" : "6-year graduation"} observation={college.observations.graduationRate} />
    </div>
    <div className="card-field-line"><GraduationCap size={16} aria-hidden="true" />
      {selectedMajor && majorEvidence ? <span><strong>{selectedMajor}</strong> · {percentFormatter.format(majorEvidence.share)} of all awards</span> : <span>{college.majors.length} broad fields reported <span className="field-dot">·</span> <Link href={`/colleges/${college.slug}#majors-heading`}>Explore fields</Link></span>}
    </div>
    {selectedMajor ? <p className="rate-clarifier"><Info size={14} aria-hidden="true" />{formatObservation(admitRate)} is college-wide, not a {selectedMajor} admission rate.</p> : null}
    <details className="card-source-details">
      <summary><BookOpen size={14} aria-hidden="true" /> Sources & what these numbers mean <ChevronDown size={14} aria-hidden="true" /></summary>
      <div><SourceBadge observation={admitRate} /><p>Net price is a historical average after grants for federal aid recipients, not your personal quote. Rates describe past cohorts. Federal completion measures finishing within 150% of normal program time; official six-year graduation uses each college’s stated cohort.</p>
      {records.map(({label,observation}) => <div className="card-source-row" key={label}><strong>{label}</strong><span>{observation.periodLabel}</span><a href={observation.sourceUrl} target="_blank" rel="noreferrer">{observation.publisher}<ArrowUpRight size={12} aria-hidden="true" /></a></div>)}
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
        <select id={id} value={value} onChange={onChange}>
          {children}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </div>
    </label>
  );
}

function FilterControls({
  state,
  dispatch,
  savedCount,
  idPrefix,
  stateOptions,
}: {
  state: ExplorerState;
  dispatch: (action: ExplorerAction) => void;
  savedCount: number;
  idPrefix: string;
  stateOptions: string[];
}) {
  const advancedFilterCount = [
    state.maxTuition,
    state.enrollmentBand,
    state.minGraduation,
    state.minEarnings,
    state.setting,
  ].filter(Boolean).length;
  const [advancedOpen, setAdvancedOpen] = useState(
    advancedFilterCount > 0,
  );

  return (
    <div className="filter-controls">
      <SelectField
        id={`${idPrefix}-major-filter`}
        label="Field of study"
        value={state.major}
        onChange={(event) =>
          dispatch({ type: "set", key: "major", value: event.target.value })
        }
      >
        <option value="">All broad fields</option>
        {majorOptions.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </SelectField>

      <SelectField
        id={`${idPrefix}-state-filter`}
        label="Location"
        value={state.stateCode}
        onChange={(event) =>
          dispatch({
            type: "set",
            key: "stateCode",
            value: event.target.value,
          })
        }
      >
        <option value="">All states</option>
        {stateOptions.map((option) => (
          <option value={option} key={option}>
            {stateNames[option] || option}
          </option>
        ))}
      </SelectField>

      <fieldset className="filter-group">
        <legend>College type</legend>
        {["", "Public", "Private nonprofit"].map((option) => (
          <label key={option || "all-types"}>
            <input
              type="radio"
              name={`${idPrefix}-college-type`}
              value={option}
              checked={state.ownership === option}
              onChange={(event) =>
                dispatch({
                  type: "set",
                  key: "ownership",
                  value: event.target.value,
                })
              }
            />
            <span>{option || "All types"}</span>
          </label>
        ))}
      </fieldset>

      <SelectField
        id={`${idPrefix}-admit-band-filter`}
        label="Overall acceptance rate"
        value={state.band}
        onChange={(event) =>
          dispatch({ type: "set", key: "band", value: event.target.value })
        }
      >
        <option value="">Any admit rate</option>
        <option value="very-high-reach">10% or less</option>
        <option value="reach">11%–25%</option>
        <option value="competitive">26%–50%</option>
        <option value="accessible">More than 50%</option>
      </SelectField>

      <SelectField
        id={`${idPrefix}-price-filter`}
        label="Maximum annual net price"
        value={state.maxPrice}
        onChange={(event) =>
          dispatch({ type: "set", key: "maxPrice", value: event.target.value })
        }
      >
        <option value="">Any net price</option>
        <option value="15000">$15,000 or less</option>
        <option value="20000">$20,000 or less</option>
        <option value="30000">$30,000 or less</option>
        <option value="40000">$40,000 or less</option>
      </SelectField>

      <details
        className="advanced-filters"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            More ways to narrow
            {advancedFilterCount > 0 ? (
              <small>{advancedFilterCount} active</small>
            ) : null}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="advanced-filter-fields">
          <SelectField
            id={`${idPrefix}-setting-filter`}
            label="Campus setting"
            value={state.setting}
            onChange={(event) =>
              dispatch({
                type: "set",
                key: "setting",
                value: event.target.value,
              })
            }
          >
            <option value="">Any setting</option>
            <option value="City">City</option>
            <option value="Suburb">Suburb</option>
            <option value="Town">Town</option>
          </SelectField>

          <SelectField
            id={`${idPrefix}-enrollment-filter`}
            label="Undergraduate size"
            value={state.enrollmentBand}
            onChange={(event) =>
              dispatch({
                type: "set",
                key: "enrollmentBand",
                value: event.target.value,
              })
            }
          >
            <option value="">Any size</option>
            <option value="small">Under 10,000 students</option>
            <option value="medium">10,000–24,999 students</option>
            <option value="large">25,000+ students</option>
          </SelectField>

          <SelectField
            id={`${idPrefix}-graduation-filter`}
            label="Minimum graduation rate"
            value={state.minGraduation}
            onChange={(event) =>
              dispatch({
                type: "set",
                key: "minGraduation",
                value: event.target.value,
              })
            }
          >
            <option value="">Any graduation rate</option>
            <option value="0.6">60% or higher</option>
            <option value="0.75">75% or higher</option>
            <option value="0.9">90% or higher</option>
          </SelectField>

          <SelectField
            id={`${idPrefix}-earnings-filter`}
            label="Minimum median earnings"
            value={state.minEarnings}
            onChange={(event) =>
              dispatch({
                type: "set",
                key: "minEarnings",
                value: event.target.value,
              })
            }
          >
            <option value="">Any earnings level</option>
            <option value="75000">$75,000 or higher</option>
            <option value="100000">$100,000 or higher</option>
            <option value="125000">$125,000 or higher</option>
          </SelectField>

          <SelectField
            id={`${idPrefix}-tuition-filter`}
            label="Maximum out-of-state/private tuition + required fees"
            value={state.maxTuition}
            onChange={(event) =>
              dispatch({
                type: "set",
                key: "maxTuition",
                value: event.target.value,
              })
            }
          >
            <option value="">Any published tuition</option>
            <option value="30000">$30,000 or less</option>
            <option value="50000">$50,000 or less</option>
            <option value="70000">$70,000 or less</option>
            <option value="90000">$90,000 or less</option>
          </SelectField>

          <p className="advanced-filter-note">
            Tuition is the published sticker price—not your likely cost. Net
            price accounts for grants and scholarships for the reported
            federal cohort.
          </p>
        </div>
      </details>

      <div className="filter-toggles">
        <button
          type="button"
          aria-pressed={state.ucOnly}
          className={state.ucOnly ? "is-active" : ""}
          onClick={() => dispatch({ type: "toggle", key: "ucOnly" })}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          UC campuses only
        </button>
        <button
          type="button"
          aria-pressed={state.completeOnly}
          className={state.completeOnly ? "is-active" : ""}
          onClick={() => dispatch({ type: "toggle", key: "completeOnly" })}
        >
          <Database size={16} aria-hidden="true" />
          Only colleges with all key metrics
        </button>
        <button
          type="button"
          aria-pressed={state.savedOnly}
          className={state.savedOnly ? "is-active" : ""}
          onClick={() => dispatch({ type: "toggle", key: "savedOnly" })}
        >
          <Bookmark size={16} aria-hidden="true" />
          Saved colleges
          <span>{savedCount}</span>
        </button>
      </div>
    </div>
  );
}

type AutocompleteItem =
  | { kind: "college"; college: ClientCollege; label: string }
  | { kind: "major"; major: string; label: string };

function SearchBox({
  colleges,
  value,
  onChange,
  onMajor,
  onSubmit,
  resultCount,
  size = "large",
}: {
  colleges: ClientCollege[];
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
    const majorMatches = matchingMajors(normalized)
      .slice(0, 3)
      .map((major) => ({ kind: "major" as const, major, label: major }));
    const collegeMatches = filterCollegesByQuery(colleges, normalized)
      .slice(0, majorMatches.length ? 3 : 5)
      .map((college) => ({
        kind: "college" as const,
        college,
        label: compactName(college),
      }));
    return [...majorMatches, ...collegeMatches];
  }, [colleges, normalized]);

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
          Search colleges, broad fields, cities, or states
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
            exit={{ opacity: 0, y: -4 }}
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

export function CollegeSearchApp({
  colleges,
  mode = "home",
}: {
  colleges: ClientCollege[];
  mode?: "home" | "explore";
}) {
  const [state, dispatch] = useReducer(explorerReducer, defaultExplorerState);
  const {
    canMutate: canMutateSavedColleges,
    hydrated: savedListHydrated,
    ids: saved,
    retrySync: retrySavedList,
    syncPhase: savedSyncPhase,
    toggleSaved: toggleSavedId,
  } = useSavedColleges();
  const [selected, setSelected] = useState<number[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [shareUrl, setShareUrl] = useState("");
  const [status, setStatus] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const deferredQuery = useDeferredValue(state.query);
  const lenis = useLenis();
  const stateOptions = useMemo(
    () => Array.from(new Set(colleges.map((college) => college.state))).sort(),
    [colleges],
  );
  const collegeIds = useMemo(
    () => new Set(colleges.map((college) => college.unitId)),
    [colleges],
  );
  const evidenceCounts = useMemo(() => {
    const ucAdmissions = colleges.filter((college) =>
      college.observations.admitRate.sourceId.startsWith("uc-"),
    ).length;
    const federalAdmissions = colleges.filter(
      (college) =>
        observationSourceKind(college.observations.admitRate).isFederal,
    ).length;
    const reviewedInstitutionRecords = colleges.filter((college) =>
      Object.values(college.observations).some(
        (observation) =>
          !observation.sourceId.startsWith("uc-") &&
          !observationSourceKind(observation).isFederal,
      ),
    ).length;
    return {
      firstPartyAdmissions: colleges.length - federalAdmissions,
      reviewedCollegeAdmissions:
        colleges.length - federalAdmissions - ucAdmissions,
      reviewedInstitutionRecords,
    };
  }, [colleges]);

  useEffect(() => {
    let cancelled = false;
    const restore = () => {
    if (!["/", "/explore"].includes(window.location.pathname)) return;
    const params = new URLSearchParams(window.location.search);
    const allowedBands = new Set([
      "",
      "very-high-reach",
      "reach",
      "competitive",
      "accessible",
    ]);
    const allowedSorts = new Set([
      "name",
      "major",
      "admit-low",
      "admit-high",
      "price",
      "graduation",
      "enrollment",
      "earnings",
    ]);
    const allowedPrices = new Set(["", "15000", "20000", "30000", "40000"]);
    const allowedTuition = new Set([
      "",
      "30000",
      "50000",
      "70000",
      "90000",
    ]);
    const allowedEnrollmentBands = new Set(["", "small", "medium", "large"]);
    const allowedGraduationRates = new Set(["", "0.6", "0.75", "0.9"]);
    const allowedEarnings = new Set(["", "75000", "100000", "125000"]);
    const allowedSettings = new Set(["", "City", "Suburb", "Town"]);
    const hydratedState: Partial<ExplorerState> = {
      query: (params.get("q") ?? "").slice(0, 120),
      major: majorOptions.includes(params.get("major") ?? "")
        ? params.get("major") ?? ""
        : "",
      stateCode: stateOptions.includes(params.get("state") ?? "")
        ? params.get("state") ?? ""
        : "",
      ownership: ["", "Public", "Private nonprofit"].includes(
        params.get("type") ?? "",
      )
        ? params.get("type") ?? ""
        : "",
      band: allowedBands.has(params.get("band") ?? "")
        ? params.get("band") ?? ""
        : "",
      maxPrice: allowedPrices.has(params.get("price") ?? "")
        ? params.get("price") ?? ""
        : "",
      maxTuition: allowedTuition.has(params.get("tuition") ?? "")
        ? params.get("tuition") ?? ""
        : "",
      enrollmentBand: allowedEnrollmentBands.has(params.get("size") ?? "")
        ? params.get("size") ?? ""
        : "",
      minGraduation: allowedGraduationRates.has(params.get("grad") ?? "")
        ? params.get("grad") ?? ""
        : "",
      minEarnings: allowedEarnings.has(params.get("earnings") ?? "")
        ? params.get("earnings") ?? ""
        : "",
      setting: allowedSettings.has(params.get("setting") ?? "")
        ? params.get("setting") ?? ""
        : "",
      sort: allowedSorts.has(params.get("sort") ?? "")
        ? params.get("sort") ?? "name"
        : "name",
      ucOnly: params.get("uc") === "1",
      completeOnly: params.get("complete") === "1",
      savedOnly: params.get("saved") === "1",
    };

    const comparison = (params.get("compare") ?? "")
      .split(",")
      .map(Number)
      .filter((unitId) => collegeIds.has(unitId))
      .slice(0, 4);
    const hydratedComparison = Array.from(new Set(comparison));
    if (hydratedState.sort === "major" && !hydratedState.major) hydratedState.sort = "name";
    queueMicrotask(() => {
      if (cancelled || !["/", "/explore"].includes(window.location.pathname)) return;
      dispatch({ type: "hydrate", value: hydratedState });
      setSelected(hydratedComparison);
      setHydrated(true);
    });
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", restore);
    };
  }, [collegeIds, stateOptions]);

  useEffect(() => {
    if (!hydrated || !["/", "/explore"].includes(window.location.pathname)) return;
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.major) params.set("major", state.major);
    if (state.stateCode) params.set("state", state.stateCode);
    if (state.ownership) params.set("type", state.ownership);
    if (state.band) params.set("band", state.band);
    if (state.maxPrice) params.set("price", state.maxPrice);
    if (state.maxTuition) params.set("tuition", state.maxTuition);
    if (state.enrollmentBand) params.set("size", state.enrollmentBand);
    if (state.minGraduation) params.set("grad", state.minGraduation);
    if (state.minEarnings) params.set("earnings", state.minEarnings);
    if (state.setting) params.set("setting", state.setting);
    if (state.sort !== "name") params.set("sort", state.sort);
    if (state.ucOnly) params.set("uc", "1");
    if (state.completeOnly) params.set("complete", "1");
    if (state.savedOnly) params.set("saved", "1");
    if (selected.length) params.set("compare", selected.join(","));
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [hydrated, selected, state]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const results = useMemo(() => {
    const queryMatches = new Set(
      filterCollegesByQuery(colleges, deferredQuery).map(
        (college) => college.unitId,
      ),
    );
    const maxPrice = Number(state.maxPrice) || null;
    const maxTuition = Number(state.maxTuition) || null;
    const minGraduation = Number(state.minGraduation) || null;
    const minEarnings = Number(state.minEarnings) || null;

    const filtered = colleges.filter((college) => {
      const admitRate = college.observations.admitRate.value;
      const netPrice = college.observations.averageNetPrice.value;
      return (
          queryMatches.has(college.unitId) &&
          (!state.major || Boolean(majorEvidenceFor(college, state.major))) &&
          (!state.stateCode || college.state === state.stateCode) &&
          (!state.ownership || college.ownership === state.ownership) &&
          matchesBand(admitRate, state.band) &&
          (!maxPrice || (netPrice !== null && netPrice <= maxPrice)) &&
          matchesAdvancedExplorerFilters(college, {
            maxTuition,
            enrollmentBand: state.enrollmentBand as EnrollmentBand,
            minGraduation,
            minEarnings,
            setting: state.setting,
          }) &&
          (!state.ucOnly || isUniversityOfCalifornia(college)) &&
          (!state.completeOnly || hasCompleteCoreData(college)) &&
          (!state.savedOnly || saved.includes(college.unitId))
      );
    });

    return filtered.sort((left, right) => {
      if (state.sort === "major" && state.major) {
        return (
          (majorEvidenceFor(right, state.major)?.share ?? -1) -
          (majorEvidenceFor(left, state.major)?.share ?? -1)
        );
      }
      if (state.sort === "admit-low") {
        return compareNullable(
          left.observations.admitRate.value,
          right.observations.admitRate.value,
        );
      }
      if (state.sort === "admit-high") {
        return compareNullable(
          left.observations.admitRate.value,
          right.observations.admitRate.value,
          "desc",
        );
      }
      if (state.sort === "price") {
        return compareNullable(
          left.observations.averageNetPrice.value,
          right.observations.averageNetPrice.value,
        );
      }
      if (state.sort === "graduation") {
        return compareNullable(
          left.observations.graduationRate.value,
          right.observations.graduationRate.value,
          "desc",
        );
      }
      if (state.sort === "enrollment") {
        return compareNullable(
          left.observations.undergraduateEnrollment.value,
          right.observations.undergraduateEnrollment.value,
          "desc",
        );
      }
      if (state.sort === "earnings") {
        return compareNullable(
          left.observations.medianEarnings.value,
          right.observations.medianEarnings.value,
          "desc",
        );
      }
      return left.name.localeCompare(right.name);
    });
  }, [
    deferredQuery,
    saved,
    state.band,
    state.completeOnly,
    state.enrollmentBand,
    state.major,
    state.maxTuition,
    state.maxPrice,
    state.minEarnings,
    state.minGraduation,
    state.ownership,
    state.savedOnly,
    state.setting,
    state.sort,
    state.stateCode,
    state.ucOnly,
    colleges,
  ]);

  const selectedColleges = selected
    .map((unitId) => colleges.find((college) => college.unitId === unitId))
    .filter(Boolean) as ClientCollege[];

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
    state.band
      ? {
          label: "Acceptance-rate range",
          clear: () =>
            dispatch({ type: "set", key: "band", value: "" }),
        }
      : null,
    state.maxPrice
      ? {
          label: `Net price ≤ $${Number(state.maxPrice).toLocaleString()}`,
          clear: () =>
            dispatch({ type: "set", key: "maxPrice", value: "" }),
        }
      : null,
    state.maxTuition
      ? {
          label: `Published tuition ≤ $${Number(
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
          label: `Graduation rate ≥ ${Math.round(
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
      <SiteHeader savedCount={saved.length} />

      <main
        id="main-content"
        className={mode === "explore" ? "explore-page" : ""}
        data-discovery-mode={mode}
      >
        <section className="discovery-masthead" aria-labelledby="discovery-title">
          <div className="discovery-intro">
            <span className="discovery-eyebrow"><span /> Your college search, all together</span>
            <h1 id="discovery-title"><span>Big possibilities.</span><br /><em>Find your starting point.</em></h1>
            <p>Explore {colleges.length} U.S. colleges. Get clear on costs, find your field, and build a list that makes sense for you.</p>
          </div>
          <CampusCarousel />
        </section>

        <section className="explore-section research-explorer" id="explore" aria-label="Explore colleges">
          <div className="research-section-heading">
            <div><h2>Explore colleges</h2><span>{colleges.length} in this collection</span></div>
            <div className="research-heading-links"><Link href="/match"><SlidersHorizontal size={17} aria-hidden="true" /> Find my fit</Link><Link href="/saved"><Bookmark size={17} aria-hidden="true" /> My shortlist{saved.length ? ` (${saved.length})` : ""}</Link></div>
          </div>
        <div className="explorer-shell">
          <aside className="filter-panel" aria-label="College filters">
            <div className="filter-panel-head">
              <SlidersHorizontal size={17} aria-hidden="true" />
              <strong>Filters</strong>
              {activeFilters.length ? (
                <span>{activeFilters.length} active</span>
              ) : null}
            </div>
            {activeFilters.length ? <button className="sidebar-reset" type="button" onClick={() => dispatch({ type: "clear" })}>Reset filters</button> : null}
            <FilterControls
              state={state}
              dispatch={dispatch}
              savedCount={saved.length}
              idPrefix="sidebar"
              stateOptions={stateOptions}
            />
            <div className="filter-help"><Info size={17} aria-hidden="true" /><p>Our collection covers 50 colleges, with a focus on California. <Link href="/data-sources">See coverage & sources</Link></p></div>
          </aside>

          <div className="results-panel">
            <div className="results-search-dock">
              <SearchBox
                colleges={colleges}
                size="compact"
                value={state.query}
                onChange={(value) =>
                  dispatch({ type: "set", key: "query", value })
                }
                onMajor={applyMajor}
                onSubmit={submitSearch}
              />
            </div>
            <div className="discovery-shortcuts" aria-label="Starting points">
              <button type="button" aria-pressed={state.maxPrice === "20000"} onClick={() => dispatch({type: "set", key: "maxPrice", value: state.maxPrice === "20000" ? "" : "20000"})}>Net price under $20k</button>
              <button type="button" aria-pressed={state.ucOnly} onClick={() => dispatch({type: "toggle", key: "ucOnly"})}>UC campuses</button>
              <button type="button" aria-pressed={state.major === "Engineering"} onClick={() => dispatch({type: "set", key: "major", value: state.major === "Engineering" ? "" : "Engineering"})}>Engineering</button>
              <button type="button" aria-pressed={state.enrollmentBand === "small"} onClick={() => dispatch({type: "set", key: "enrollmentBand", value: state.enrollmentBand === "small" ? "" : "small"})}>Smaller campuses</button>
            </div>
            <div className="results-toolbar">
              <div>
                <Dialog.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <Dialog.Trigger asChild>
                    <button className="mobile-filter-button" type="button">
                      <SlidersHorizontal size={17} aria-hidden="true" />
                      Filters
                      {activeFilters.length ? (
                        <span>{activeFilters.length}</span>
                      ) : null}
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="filter-dialog-overlay" />
                    <Dialog.Content className="filter-dialog" data-lenis-prevent>
                      <div className="filter-dialog-head">
                        <div>
                          <Dialog.Title>Filters</Dialog.Title>
                          <Dialog.Description>
                            Choose what matters to you. Results update as you go.
                          </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                          <button type="button" aria-label="Close filters">
                            <X size={19} />
                          </button>
                        </Dialog.Close>
                      </div>
                      <FilterControls
                        state={state}
                        dispatch={dispatch}
                        savedCount={saved.length}
                        idPrefix="dialog"
                        stateOptions={stateOptions}
                      />
                      <Dialog.Close asChild>
                        <button className="apply-filters-button" type="button">
                          {savedListUnavailable
                            ? savedListFailed
                              ? "Saved list unavailable"
                              : "Checking saved list"
                            : `Show ${results.length} colleges`}
                        </button>
                      </Dialog.Close>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>

                <p
                  className="results-count"
                  id="results-summary"
                  tabIndex={-1}
                  aria-live="polite"
                >
                  {savedListUnavailable ? (
                    savedListFailed ? (
                      "Saved list unavailable"
                    ) : (
                      "Checking saved list…"
                    )
                  ) : (
                    <>
                      <strong>{results.length}</strong>{" "}
                      {results.length === 1 ? "college" : "colleges"}
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
                <option value="price">Annual net price: lowest first</option>
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
            {shareUrl ? <label className="share-fallback">Copy this search link<input readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label> : null}

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

            {state.major ? (
              <div className="major-context-banner">
                <GraduationCap size={19} aria-hidden="true" />
                <p>
                  <strong>
                    This filter shows colleges with recent federal evidence of
                    a bachelor&apos;s program in this broad field.
                  </strong>{" "}
                  It is not a live major catalog, and acceptance rates are for
                  the whole college—not this field.
                </p>
                <Link href="/methodology#major-data">About field data</Link>
              </div>
            ) : null}

            <div
              className={`results-list research-results is-${view}`}
              id="results-list"
              aria-busy={state.query !== deferredQuery || savedListUnavailable}
            >
              {!savedListUnavailable
                ? results.slice(0, state.visibleCount).map((college) => (
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
            ) : !results.length ? (
              <div className="empty-state">
                <CircleAlert size={29} aria-hidden="true" />
                <h3>No college meets every active filter.</h3>
                <p>
                  Remove one filter or reset the cohort. Missing data is never
                  treated as zero to force a match.
                </p>
                <button type="button" onClick={() => dispatch({ type: "clear" })}>
                  Reset filters
                </button>
              </div>
            ) : null}

            {state.visibleCount < results.length ? (
              <button
                className="load-more"
                type="button"
                onClick={() => dispatch({ type: "showMore" })}
              >
                Show {Math.min(12, results.length - state.visibleCount)} more colleges
                <ArrowDown size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
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
