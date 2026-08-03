"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useLenis } from "lenis/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
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
  Sparkles,
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
import { SourceSpotlight } from "@/app/components/SourceSpotlight";
import { CollegeLogo } from "@/app/components/CollegeLogo";
import {
  colleges,
  compactName,
  formatObservation,
  isUniversityOfCalifornia,
  majorEvidenceFor,
  observationSourceKind,
  percentFormatter,
  selectivityLabel,
  type College,
  type Observation,
} from "@/app/lib/college-data";

type ExplorerState = {
  query: string;
  major: string;
  stateCode: string;
  ownership: string;
  band: string;
  maxPrice: string;
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
  ucOnly: false,
  completeOnly: false,
  savedOnly: false,
  sort: "name",
  visibleCount: 12,
};

const stateNames: Record<string, string> = {
  AZ: "Arizona",
  CA: "California",
  CT: "Connecticut",
  GA: "Georgia",
  IL: "Illinois",
  IN: "Indiana",
  MA: "Massachusetts",
  MI: "Michigan",
  NC: "North Carolina",
  NJ: "New Jersey",
  NY: "New York",
  OH: "Ohio",
  OR: "Oregon",
  PA: "Pennsylvania",
  TX: "Texas",
  VA: "Virginia",
  WA: "Washington",
  WI: "Wisconsin",
};

const stopWords = new Set(["in", "near", "with", "and", "for", "at", "the"]);
const majorAliases: Record<string, string[]> = {
  "Computing & Information Sciences": [
    "computer science",
    "cs",
    "computing",
    "software",
  ],
  "Business & Marketing": ["business", "marketing", "finance", "management"],
  Engineering: ["engineer"],
  "Biological & Biomedical Sciences": ["biology", "bio", "life science", "pre med"],
  "Health Professions": ["health", "nursing", "public health"],
  Psychology: ["psych"],
  "Social Sciences": ["political science", "economics", "sociology"],
  "Visual & Performing Arts": ["art", "design", "music", "theater"],
  Education: ["teaching"],
  "Mathematics & Statistics": ["math", "statistics"],
  "Physical Sciences": ["physics", "chemistry"],
  "English Language & Literature": ["english", "writing", "literature"],
};

const majorOptions = Object.keys(majorAliases);
const stateOptions = Array.from(
  new Set(colleges.map((college) => college.state)),
).sort();
const collegeIds = new Set(colleges.map((college) => college.unitId));

const searchIndex = colleges.map((college) => ({
  college,
  text: [
    college.name,
    ...college.aliases,
    college.city,
    college.state,
    stateNames[college.state],
    ...college.majors.map((major) => major.name),
    ...college.majors.flatMap((major) => majorAliases[major.name] ?? []),
  ]
    .join(" ")
    .toLowerCase(),
}));

function explorerReducer(
  state: ExplorerState,
  action: ExplorerAction,
): ExplorerState {
  if (action.type === "set") {
    return { ...state, [action.key]: action.value, visibleCount: 12 };
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

function hasCompleteCoreData(college: College) {
  return [
    college.observations.admitRate,
    college.observations.averageNetPrice,
    college.observations.graduationRate,
    college.observations.undergraduateEnrollment,
  ].every((observation) => observation.value !== null);
}

function SourceBadge({ observation }: { observation: Observation }) {
  const source = observationSourceKind(observation);
  return (
    <span className={`source-badge ${source.className}`}>
      <ShieldCheck size={12} aria-hidden="true" />
      {source.label} · {observation.periodLabel}
    </span>
  );
}

function MetricStamp({
  label,
  observation,
  note,
  emphasis = false,
}: {
  label: string;
  observation: Observation;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`metric-stamp ${emphasis ? "metric-primary" : ""}`}>
      <div className="metric-stamp-head">
        <span>{label}</span>
        <small>{observation.periodLabel}</small>
      </div>
      <strong>{formatObservation(observation)}</strong>
      {note ? <span className="metric-stamp-note">{note}</span> : null}
    </div>
  );
}

const CollegeCard = memo(function CollegeCard({
  college,
  selectedMajor,
  isSelected,
  isSaved,
  onCompare,
  onSave,
}: {
  college: College;
  selectedMajor: string;
  isSelected: boolean;
  isSaved: boolean;
  onCompare: (college: College) => void;
  onSave: (college: College) => void;
}) {
  const admitRate = college.observations.admitRate;
  const graduationSource = observationSourceKind(
    college.observations.graduationRate,
  );
  const majorEvidence = selectedMajor
    ? majorEvidenceFor(college, selectedMajor)
    : null;

  return (
    <article
      className="college-card"
      data-testid={`college-${college.unitId}`}
    >
      <div className="college-card-main">
        <div className="college-card-heading">
          <Link
            className="college-identity"
            href={`/colleges/${college.slug}`}
          >
            <CollegeLogo college={college} />
            <span>
              <span className="college-name">{college.name}</span>
              <span className="college-meta">
                <MapPin size={14} aria-hidden="true" />
                {college.city}, {college.state}
                <span aria-hidden="true">/</span>
                {college.ownership}
              </span>
            </span>
          </Link>
          <SourceBadge observation={admitRate} />
        </div>

        <div className="card-actions">
          <button
            className={`save-button ${isSaved ? "is-active" : ""}`}
            type="button"
            aria-pressed={isSaved}
            onClick={() => onSave(college)}
          >
            {isSaved ? (
              <BookmarkCheck size={17} aria-hidden="true" />
            ) : (
              <Bookmark size={17} aria-hidden="true" />
            )}
            {isSaved ? "Saved" : "Save"}
          </button>
          <button
            className={`compare-button ${isSelected ? "is-active" : ""}`}
            type="button"
            aria-pressed={isSelected}
            aria-label={
              isSelected ? `Remove ${college.name} from comparison` : undefined
            }
            onClick={() => onCompare(college)}
          >
            {isSelected ? (
              <Check size={17} aria-hidden="true" />
            ) : (
              <BarChart3 size={17} aria-hidden="true" />
            )}
            {isSelected ? "Remove" : "Compare"}
          </button>
        </div>
      </div>

      <div className="metric-ledger">
        <MetricStamp
          label="Overall acceptance rate"
          observation={admitRate}
          note={selectivityLabel(admitRate.value)}
          emphasis
        />
        <MetricStamp
          label="Average annual cost after grants"
          observation={college.observations.averageNetPrice}
          note="Historical federal aid cohort"
        />
        <MetricStamp
          label="Graduate within 6 years"
          observation={college.observations.graduationRate}
          note={
            graduationSource.isFederal
              ? "Historical federal cohort"
              : "Official completion cohort"
          }
        />
      </div>

      <div className="college-card-footer">
        <div className="major-evidence">
          <GraduationCap size={16} aria-hidden="true" />
          {selectedMajor ? (
            majorEvidence ? (
              <span>
                <strong>{selectedMajor}</strong> bachelor&apos;s field reported ·{" "}
                {percentFormatter.format(majorEvidence.share)} of all awards
              </span>
            ) : (
              <span>No recent {selectedMajor} completion evidence found.</span>
            )
          ) : (
            <span>
              Bachelor&apos;s-field evidence available for {college.majors.length}{" "}
              broad fields
            </span>
          )}
        </div>
        <Link className="evidence-link" href={`/colleges/${college.slug}`}>
          View college details
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>

      {selectedMajor ? (
        <div className="rate-clarifier">
          <Info size={14} aria-hidden="true" />
          {formatObservation(admitRate)} is the college-wide acceptance
          rate—not a {selectedMajor} acceptance rate.
        </div>
      ) : null}
    </article>
  );
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
}: {
  state: ExplorerState;
  dispatch: (action: ExplorerAction) => void;
  savedCount: number;
  idPrefix: string;
}) {
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
  | { kind: "college"; college: College; label: string }
  | { kind: "major"; major: string; label: string };

function SearchBox({
  value,
  onChange,
  onMajor,
  size = "large",
}: {
  value: string;
  onChange: (value: string) => void;
  onMajor: (major: string) => void;
  size?: "large" | "compact";
}) {
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalized = value.trim().toLowerCase();

  const items = useMemo<AutocompleteItem[]>(() => {
    if (normalized.length < 2) return [];
    const collegeMatches = searchIndex
      .filter(({ text }) => text.includes(normalized))
      .slice(0, 5)
      .map(({ college }) => ({
        kind: "college" as const,
        college,
        label: compactName(college),
      }));
    const majorMatches = majorOptions
      .filter((major) =>
        [major, ...(majorAliases[major] ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 3)
      .map((major) => ({ kind: "major" as const, major, label: major }));
    return [...collegeMatches, ...majorMatches];
  }, [normalized]);

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
            activeIndex >= 0
              ? `search-suggestion-${size}-${activeIndex}`
              : undefined
          }
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
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
    </div>
  );
}

export function CollegeSearchApp({
  mode = "home",
}: {
  mode?: "home" | "explore";
}) {
  const [state, dispatch] = useReducer(explorerReducer, defaultExplorerState);
  const [saved, setSaved] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const deferredQuery = useDeferredValue(state.query);
  const lenis = useLenis();

  useEffect(() => {
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
    const hydratedState: Partial<ExplorerState> = {
      query: params.get("q") ?? "",
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
    let hydratedSaved: number[] = [];

    try {
      const parsed = JSON.parse(
        window.localStorage.getItem("college-search-saved") ??
          window.localStorage.getItem("college-compass-saved") ??
          "[]",
      );
      if (Array.isArray(parsed)) {
        hydratedSaved = Array.from(
          new Set(
            parsed
              .filter(Number.isInteger)
              .filter((unitId) => collegeIds.has(unitId)),
          ),
        );
      }
    } catch {
      try {
        window.localStorage.removeItem("college-search-saved");
        window.localStorage.removeItem("college-compass-saved");
      } catch {
        // Storage can be unavailable in hardened/private browser contexts.
      }
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      dispatch({ type: "hydrate", value: hydratedState });
      setSelected(hydratedComparison);
      setSaved(hydratedSaved);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.major) params.set("major", state.major);
    if (state.stateCode) params.set("state", state.stateCode);
    if (state.ownership) params.set("type", state.ownership);
    if (state.band) params.set("band", state.band);
    if (state.maxPrice) params.set("price", state.maxPrice);
    if (state.sort !== "name") params.set("sort", state.sort);
    if (state.ucOnly) params.set("uc", "1");
    if (state.completeOnly) params.set("complete", "1");
    if (state.savedOnly) params.set("saved", "1");
    if (selected.length) params.set("compare", selected.join(","));
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, [hydrated, selected, state]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const results = useMemo(() => {
    const tokens = deferredQuery
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !stopWords.has(token));
    const maxPrice = Number(state.maxPrice) || null;

    const filtered = searchIndex
      .filter(({ college, text }) => {
        const admitRate = college.observations.admitRate.value;
        const netPrice = college.observations.averageNetPrice.value;
        return (
          tokens.every((token) => text.includes(token)) &&
          (!state.major || Boolean(majorEvidenceFor(college, state.major))) &&
          (!state.stateCode || college.state === state.stateCode) &&
          (!state.ownership || college.ownership === state.ownership) &&
          matchesBand(admitRate, state.band) &&
          (!maxPrice || (netPrice !== null && netPrice <= maxPrice)) &&
          (!state.ucOnly || isUniversityOfCalifornia(college)) &&
          (!state.completeOnly || hasCompleteCoreData(college)) &&
          (!state.savedOnly || saved.includes(college.unitId))
        );
      })
      .map(({ college }) => college);

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
    state.major,
    state.maxPrice,
    state.ownership,
    state.savedOnly,
    state.sort,
    state.stateCode,
    state.ucOnly,
  ]);

  const selectedColleges = selected
    .map((unitId) => colleges.find((college) => college.unitId === unitId))
    .filter(Boolean) as College[];

  function toggleSaved(college: College) {
    setSaved((current) => {
      const next = current.includes(college.unitId)
        ? current.filter((unitId) => unitId !== college.unitId)
        : [...current, college.unitId];
      try {
        window.localStorage.setItem(
          "college-search-saved",
          JSON.stringify(next),
        );
      } catch {
        setStatus("This browser could not save that college.");
      }
      return next;
    });
  }

  function toggleCompare(college: College) {
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

  return (
    <main id="top" className={mode === "explore" ? "explore-page" : ""}>
      <SiteHeader savedCount={saved.length} />

      {mode === "home" ? (
        <section className="hero">
          <div className="hero-copy">
            <span className="edition-label">
              <span>Edition 01</span>
              College discovery, clearly sourced
            </span>
            <h1>
              Find a college you can <em>understand.</em>
            </h1>
            <p>
              Search and compare 50 reviewed colleges using current UC
              admissions and source-transparent federal evidence—without
              rankings, mystery scores, or fake predictions.
            </p>
            <SearchBox
              value={state.query}
              onChange={(value) =>
                dispatch({ type: "set", key: "query", value })
              }
              onMajor={applyMajor}
            />
            <div className="quick-starts" aria-label="Popular starting points">
              <span>Start with</span>
              {[
                { label: "Computing", value: "Computing & Information Sciences" },
                { label: "Business", value: "Business & Marketing" },
                { label: "Biology", value: "Biological & Biomedical Sciences" },
              ].map((field) => (
                <button
                  type="button"
                  key={field.value}
                  onClick={() => applyMajor(field.value)}
                >
                  {field.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "set", key: "stateCode", value: "CA" });
                  scrollToExplore();
                }}
              >
                California
              </button>
            </div>
          </div>

          <SourceSpotlight className="evidence-ledger-card">
            <div className="ledger-card-head">
              <div>
                <span>Data at a glance</span>
                <strong>Newest verified records first</strong>
              </div>
              <ShieldCheck size={23} aria-hidden="true" />
            </div>
            <div className="ledger-release-list">
              <div>
                <span className="ledger-index">01</span>
                <span>
                  <strong>UC admissions</strong>
                  <small>UC Fall 2026 + verified college updates</small>
                </span>
                <span className="release-status">2026</span>
              </div>
              <div>
                <span className="ledger-index">02</span>
                <span>
                  <strong>Comparable federal baseline</strong>
                  <small>College Scorecard · metric periods vary</small>
                </span>
                <span className="release-status neutral">VARIES</span>
              </div>
              <div>
                <span className="ledger-index">03</span>
                <span>
                  <strong>Fields of study</strong>
                  <small>Broad bachelor&apos;s fields + award shares · 2024-2025</small>
                </span>
                <span className="release-status neutral">2025</span>
              </div>
            </div>
            <div className="ledger-card-foot">
              <span>50 colleges</span>
              <span>9 UC campuses</span>
              <Link href="/data-sources">
                View all sources
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </SourceSpotlight>
        </section>
      ) : (
        <section className="explore-masthead">
          <span className="edition-label">
            <span>Evidence explorer</span>
            50 reviewed colleges
          </span>
          <div>
            <h1>Search the evidence, not a ranking.</h1>
          </div>
          <p>
            Filter by field, location, cost, and selectivity. Every headline
            metric keeps its source and reporting period attached.
          </p>
        </section>
      )}

      <section className="trust-strip" aria-label="Data trust statement">
        <div>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            <strong>Every number shows its source and period.</strong> Newer
            official college records replace older federal fields only after
            verification.
          </span>
        </div>
        <Link href="/methodology">
          How the data works
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>

      <section className="explore-section" id="explore">
        <div className="section-intro">
          <div>
            <span className="section-number">01 / Explore</span>
            <h2>Find colleges that match what matters to you.</h2>
          </div>
          <p>
            Search by college or field of study, then narrow by location, cost,
            and acceptance rate. Field filters use 2024-2025 federal program
            and award data.
          </p>
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
            <FilterControls
              state={state}
              dispatch={dispatch}
              savedCount={saved.length}
              idPrefix="sidebar"
            />
          </aside>

          <div className="results-panel">
            <div className="results-search-dock">
              <SearchBox
                size="compact"
                value={state.query}
                onChange={(value) =>
                  dispatch({ type: "set", key: "query", value })
                }
                onMajor={applyMajor}
              />
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
                      />
                      <Dialog.Close asChild>
                        <button className="apply-filters-button" type="button">
                          Show {results.length} colleges
                        </button>
                      </Dialog.Close>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>

                <p className="results-count" aria-live="polite">
                  <strong>{results.length}</strong>{" "}
                  {results.length === 1 ? "college" : "colleges"}
                </p>
              </div>

              <SelectField
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
            </div>

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
                    This filter requires a federal bachelor&apos;s-program indicator.
                  </strong>{" "}
                  It still represents a broad field—not an exact current major
                  catalog. Acceptance rates are for the whole college.
                </p>
                <Link href="/methodology#major-data">About field data</Link>
              </div>
            ) : null}

            <div className="results-list" aria-busy={state.query !== deferredQuery}>
              {results.slice(0, state.visibleCount).map((college) => (
                <CollegeCard
                  key={college.unitId}
                  college={college}
                  selectedMajor={state.major}
                  isSelected={selected.includes(college.unitId)}
                  isSaved={saved.includes(college.unitId)}
                  onCompare={toggleCompare}
                  onSave={toggleSaved}
                />
              ))}
            </div>

            {!results.length ? (
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
                Show 12 more colleges
                <ArrowDown size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {mode === "home" ? (
        <section className="foundation-section">
          <div>
            <span className="section-number">02 / Trust</span>
            <h2>A field guide, not a leaderboard.</h2>
            <p>
              CollegeSearch keeps source, year, cohort, and definition close to
              the number. When evidence is missing, the app says so.
            </p>
          </div>
          <div className="foundation-ledger">
            <article>
              <span>Source before score</span>
              <strong>Every metric has a record.</strong>
              <p>Open the college profile to inspect the exact field and cohort.</p>
            </article>
            <article>
              <span>Context before prediction</span>
              <strong>No invented admission odds.</strong>
              <p>Overall rates describe past cohorts, never one student’s future.</p>
            </article>
            <article>
              <span>Missing means missing</span>
              <strong>Never silently converted to zero.</strong>
              <p>Unavailable and suppressed observations keep distinct states.</p>
            </article>
          </div>
        </section>
      ) : null}

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
            <Sparkles size={15} aria-hidden="true" />
            {status}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
