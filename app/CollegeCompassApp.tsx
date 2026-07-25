"use client";

import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Compass,
  Database,
  ExternalLink,
  GraduationCap,
  HeartHandshake,
  Info,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dataset from "@/data/colleges.json";

type MajorEvidence = {
  name: string;
  share: number;
  evidence: string;
};

type College = {
  unitId: number;
  slug: string;
  name: string;
  aliases: string[];
  city: string;
  state: string;
  region: string;
  ownership: string;
  setting: string;
  website: string;
  undergraduateEnrollment: number;
  admitRate: number;
  averageNetPrice: number;
  graduationRate: number;
  medianEarnings: number | null;
  tuitionInState: number;
  tuitionOutOfState: number;
  majors: MajorEvidence[];
};

type CollegeDataset = {
  release: {
    cohortName: string;
    institutionCount: number;
    accessedOn: string;
    institutionMetricsYear: number;
    earningsCohortYear: number;
    publisher: string;
    sourceName: string;
    sourceUrl: string;
    ucAdmissionsSourceUrl: string;
    ucDisciplineSourceUrl: string;
    notes: string;
  };
  colleges: College[];
};

const collegeDataset = dataset as CollegeDataset;
const colleges = collegeDataset.colleges;
const release = collegeDataset.release;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

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
  "Computer Science": ["cs", "computing", "software"],
  Business: ["marketing", "finance", "management"],
  Engineering: ["engineer"],
  Biology: ["bio", "life science", "pre med"],
  "Health Professions": ["health", "nursing", "public health"],
  Psychology: ["psych"],
  "Social Sciences": ["political science", "economics", "sociology"],
  "Arts & Design": ["art", "design", "music", "theater"],
  Education: ["teaching"],
  Mathematics: ["math", "statistics"],
  "Physical Sciences": ["physics", "chemistry"],
  English: ["writing", "literature"],
};

const majorOptions = Object.keys(majorAliases);
const stateOptions = Array.from(new Set(colleges.map((college) => college.state))).sort();
const landscapeColleges = [110662, 110653, 110529, 104151]
  .map((unitId) => colleges.find((college) => college.unitId === unitId))
  .filter(Boolean) as College[];

function compactName(college: College) {
  return college.aliases.find((alias) => alias.startsWith("UC ")) || college.aliases[0] || college.name;
}

function selectivityLabel(rate: number) {
  if (rate <= 0.1) return "Very high reach";
  if (rate <= 0.25) return "Reach";
  if (rate <= 0.5) return "Competitive";
  return "More broadly accessible";
}

function matchesBand(rate: number, band: string) {
  if (!band) return true;
  if (band === "very-high-reach") return rate <= 0.1;
  if (band === "reach") return rate > 0.1 && rate <= 0.25;
  if (band === "competitive") return rate > 0.25 && rate <= 0.5;
  return rate > 0.5;
}

function getMajorEvidence(college: College, major: string) {
  return college.majors.find((item) => item.name === major);
}

function initials(name: string) {
  return name
    .replace("University of ", "")
    .replace("California State University", "CSU")
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

function Metric({
  label,
  value,
  year,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  year: number;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`metric ${emphasis ? "metric-emphasis" : ""}`}>
      <div className="metric-label">
        <span>{label}</span>
        <span className="year-pill">{year}</span>
      </div>
      <strong>{value}</strong>
      {note ? <span className="metric-note">{note}</span> : null}
    </div>
  );
}

function IconButton({
  label,
  children,
  active,
  onClick,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`icon-button ${active ? "is-active" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      title={label}
    >
      {children}
    </button>
  );
}

function SourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="source-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

function CollegeCard({
  college,
  selectedMajor,
  isSelected,
  isSaved,
  onOpen,
  onCompare,
  onSave,
}: {
  college: College;
  selectedMajor: string;
  isSelected: boolean;
  isSaved: boolean;
  onOpen: () => void;
  onCompare: () => void;
  onSave: () => void;
}) {
  const majorEvidence = selectedMajor
    ? getMajorEvidence(college, selectedMajor)
    : null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="college-card"
      data-testid={`college-${college.unitId}`}
    >
      <div className="college-card-head">
        <button className="college-identity" type="button" onClick={onOpen}>
          <span className="college-mark" aria-hidden="true">
            {initials(compactName(college))}
          </span>
          <span>
            <span className="college-name">{college.name}</span>
            <span className="college-meta">
              <MapPin size={14} aria-hidden="true" />
              {college.city}, {college.state}
              <span aria-hidden="true">·</span>
              {college.ownership}
            </span>
          </span>
        </button>
        <div className="card-actions">
          <IconButton
            label={isSaved ? `Remove ${college.name} from saved` : `Save ${college.name}`}
            active={isSaved}
            onClick={onSave}
          >
            {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </IconButton>
          <button
            className={`compare-toggle ${isSelected ? "is-selected" : ""}`}
            type="button"
            aria-pressed={isSelected}
            onClick={onCompare}
          >
            {isSelected ? <Check size={16} /> : <span aria-hidden="true">+</span>}
            {isSelected ? "Added" : "Compare"}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <Metric
          label="Overall admit rate"
          value={percent.format(college.admitRate)}
          year={release.institutionMetricsYear}
          emphasis
        />
        <Metric
          label="Average net price"
          value={currency.format(college.averageNetPrice)}
          year={release.institutionMetricsYear}
          note="After grants · all students"
        />
        <Metric
          label="Graduation rate"
          value={percent.format(college.graduationRate)}
          year={release.institutionMetricsYear}
          note="150% of expected time"
        />
      </div>

      <div className="college-card-foot">
        {selectedMajor && majorEvidence ? (
          <div className="major-evidence">
            <span className="evidence-dot" aria-hidden="true" />
            <span>
              <strong>{selectedMajor}</strong> — recent degree evidence
            </span>
            <span className="evidence-share">
              {percent.format(majorEvidence.share)} of recent degrees
            </span>
          </div>
        ) : (
          <div className="major-evidence muted">
            <GraduationCap size={16} aria-hidden="true" />
            {college.majors.length} broad fields with recent degree evidence
          </div>
        )}
        <button className="text-button" type="button" onClick={onOpen}>
          View evidence
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>

      {selectedMajor ? (
        <div className="rate-clarifier">
          <Info size={14} aria-hidden="true" />
          The {percent.format(college.admitRate)} rate is institution-wide—not
          major-specific.
        </div>
      ) : null}
    </motion.article>
  );
}

function ModalShell({
  titleId,
  onClose,
  children,
  wide,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <motion.div
      className="modal-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className={`modal-panel ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.99 }}
        transition={{ duration: 0.22 }}
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        {children}
      </motion.section>
    </motion.div>
  );
}

function CollegeProfile({
  college,
  selectedMajor,
  isSelected,
  isSaved,
  onClose,
  onCompare,
  onSave,
}: {
  college: College;
  selectedMajor: string;
  isSelected: boolean;
  isSaved: boolean;
  onClose: () => void;
  onCompare: () => void;
  onSave: () => void;
}) {
  const topMajors = [...college.majors]
    .sort((a, b) => b.share - a.share)
    .slice(0, 8);

  return (
    <ModalShell titleId="college-profile-title" onClose={onClose} wide>
      <div className="profile">
        <header className="profile-header">
          <div className="profile-mark" aria-hidden="true">
            {initials(compactName(college))}
          </div>
          <div className="profile-title">
            <span className="eyebrow">College evidence profile</span>
            <h2 id="college-profile-title">{college.name}</h2>
            <p>
              {college.city}, {college.state} · {college.ownership} · {college.setting}
            </p>
          </div>
          <div className="profile-actions">
            <button className="secondary-button" type="button" onClick={onSave}>
              {isSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
              {isSaved ? "Saved" : "Save"}
            </button>
            <button className="primary-button compact" type="button" onClick={onCompare}>
              {isSelected ? <Check size={17} /> : <BarChart3 size={17} />}
              {isSelected ? "In comparison" : "Add to compare"}
            </button>
          </div>
        </header>

        <div className="profile-trustline">
          <ShieldCheck size={17} aria-hidden="true" />
          Core institution metrics are from the U.S. Department of Education,
          reporting year {release.institutionMetricsYear}.
        </div>

        <div className="profile-metrics">
          <Metric
            label="Overall admit rate"
            value={percent.format(college.admitRate)}
            year={release.institutionMetricsYear}
            note={selectivityLabel(college.admitRate)}
            emphasis
          />
          <Metric
            label="Average net price"
            value={currency.format(college.averageNetPrice)}
            year={release.institutionMetricsYear}
            note="Average after grants"
          />
          <Metric
            label="Graduation rate"
            value={percent.format(college.graduationRate)}
            year={release.institutionMetricsYear}
            note="First-time, full-time cohort"
          />
          <Metric
            label="Undergraduates"
            value={number.format(college.undergraduateEnrollment)}
            year={release.institutionMetricsYear}
            note={college.setting}
          />
        </div>

        <div className="profile-layout">
          <div className="profile-main">
            <section className="evidence-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Admissions context</span>
                  <h3>Selective, not predictable</h3>
                </div>
                <span className="context-band">{selectivityLabel(college.admitRate)}</span>
              </div>
              <p className="section-copy">
                The published rate describes the institution’s full first-year
                applicant pool. Essays, course rigor, recommendations, institutional
                priorities, and school context are not captured here.
              </p>
              <div className="clarifier-card">
                <CircleAlert size={20} aria-hidden="true" />
                <div>
                  <strong>
                    {selectedMajor
                      ? `${selectedMajor} is selected, but this is still an overall rate.`
                      : "No major-specific rate is being inferred."}
                  </strong>
                  <p>
                    College Compass only shows exact-major or discipline rates when an
                    official source publishes a comparable cohort.
                  </p>
                </div>
              </div>
            </section>

            <section className="evidence-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Academic evidence</span>
                  <h3>Fields represented in recent degrees</h3>
                </div>
                <span className="subtle-label">Not a current catalog guarantee</span>
              </div>
              <div className="major-bars">
                {topMajors.map((major) => (
                  <div className="major-bar" key={major.name}>
                    <div className="major-bar-label">
                      <span>{major.name}</span>
                      <strong>{percent.format(major.share)}</strong>
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(4, major.share * 260))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="data-footnote">
                Evidence means this college reported recent bachelor’s degree
                completions in the broad federal field. Confirm the current program
                and application requirements on the college’s official site.
              </p>
            </section>

            <section className="evidence-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Cost & outcomes</span>
                  <h3>Sticker price is not net price</h3>
                </div>
              </div>
              <div className="cost-grid">
                <div>
                  <span>In-state tuition & fees</span>
                  <strong>{currency.format(college.tuitionInState)}</strong>
                  <small>{release.institutionMetricsYear}</small>
                </div>
                <div>
                  <span>Out-of-state tuition & fees</span>
                  <strong>{currency.format(college.tuitionOutOfState)}</strong>
                  <small>{release.institutionMetricsYear}</small>
                </div>
                <div>
                  <span>Median earnings</span>
                  <strong>
                    {college.medianEarnings
                      ? currency.format(college.medianEarnings)
                      : "Not reported"}
                  </strong>
                  <small>10 years after entry · {release.earningsCohortYear}</small>
                </div>
              </div>
            </section>
          </div>

          <aside className="source-panel">
            <span className="section-kicker">Source record</span>
            <h3>Trace every number</h3>
            <dl>
              <div>
                <dt>Publisher</dt>
                <dd>{release.publisher}</dd>
              </div>
              <div>
                <dt>Dataset</dt>
                <dd>{release.sourceName}</dd>
              </div>
              <div>
                <dt>Institution ID</dt>
                <dd>IPEDS UNITID {college.unitId}</dd>
              </div>
              <div>
                <dt>Core reporting year</dt>
                <dd>{release.institutionMetricsYear}</dd>
              </div>
              <div>
                <dt>Imported</dt>
                <dd>{release.accessedOn}</dd>
              </div>
            </dl>
            <SourceLink href={release.sourceUrl}>Open federal source</SourceLink>
            {college.state === "CA" && college.name.includes("University of California") ? (
              <SourceLink href={release.ucAdmissionsSourceUrl}>
                Open official UC admissions
              </SourceLink>
            ) : null}
            <SourceLink href={college.website}>Open official college site</SourceLink>
          </aside>
        </div>
      </div>
    </ModalShell>
  );
}

function CompareView({
  selectedColleges,
  selectedMajor,
  onClose,
  onRemove,
  onShare,
}: {
  selectedColleges: College[];
  selectedMajor: string;
  onClose: () => void;
  onRemove: (college: College) => void;
  onShare: () => void;
}) {
  return (
    <ModalShell titleId="compare-title" onClose={onClose} wide>
      <div className="compare-view">
        <header className="compare-header">
          <div>
            <span className="eyebrow">Side-by-side evidence</span>
            <h2 id="compare-title">Compare your college list</h2>
            <p>
              Years stay visible so unlike metrics are never made to look identical.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onShare}>
            <Clipboard size={17} />
            Copy comparison link
          </button>
        </header>

        <div
          className="compare-grid"
          style={{
            gridTemplateColumns: `minmax(150px, .72fr) repeat(${selectedColleges.length}, minmax(190px, 1fr))`,
          }}
        >
          <div className="compare-label compare-top-label">College</div>
          {selectedColleges.map((college) => (
            <div className="compare-college-head" key={college.unitId}>
              <span className="mini-mark" aria-hidden="true">
                {initials(compactName(college))}
              </span>
              <strong>{compactName(college)}</strong>
              <small>
                {college.city}, {college.state}
              </small>
              <button type="button" onClick={() => onRemove(college)}>
                Remove
              </button>
            </div>
          ))}

          <div className="compare-label">
            Overall admit rate
            <small>{release.institutionMetricsYear}</small>
          </div>
          {selectedColleges.map((college) => (
            <div className="compare-value standout" key={`admit-${college.unitId}`}>
              <strong>{percent.format(college.admitRate)}</strong>
              <span>{selectivityLabel(college.admitRate)}</span>
            </div>
          ))}

          <div className="compare-label">
            Average net price
            <small>{release.institutionMetricsYear}</small>
          </div>
          {selectedColleges.map((college) => (
            <div className="compare-value" key={`price-${college.unitId}`}>
              <strong>{currency.format(college.averageNetPrice)}</strong>
              <span>Average after grants</span>
            </div>
          ))}

          <div className="compare-label">
            Graduation rate
            <small>{release.institutionMetricsYear}</small>
          </div>
          {selectedColleges.map((college) => (
            <div className="compare-value" key={`grad-${college.unitId}`}>
              <strong>{percent.format(college.graduationRate)}</strong>
              <span>150% completion window</span>
            </div>
          ))}

          <div className="compare-label">
            Undergraduate enrollment
            <small>{release.institutionMetricsYear}</small>
          </div>
          {selectedColleges.map((college) => (
            <div className="compare-value" key={`size-${college.unitId}`}>
              <strong>{number.format(college.undergraduateEnrollment)}</strong>
              <span>{college.setting}</span>
            </div>
          ))}

          <div className="compare-label">
            Median earnings
            <small>{release.earningsCohortYear} cohort</small>
          </div>
          {selectedColleges.map((college) => (
            <div className="compare-value" key={`earn-${college.unitId}`}>
              <strong>
                {college.medianEarnings
                  ? currency.format(college.medianEarnings)
                  : "Not reported"}
              </strong>
              <span>10 years after entry</span>
            </div>
          ))}

          <div className="compare-label">
            {selectedMajor || "Major evidence"}
            <small>Degree completions · {release.institutionMetricsYear}</small>
          </div>
          {selectedColleges.map((college) => {
            const evidence = selectedMajor
              ? getMajorEvidence(college, selectedMajor)
              : null;
            return (
              <div className="compare-value" key={`major-${college.unitId}`}>
                {selectedMajor ? (
                  evidence ? (
                    <>
                      <strong>{percent.format(evidence.share)}</strong>
                      <span>Recent degrees in this broad field</span>
                    </>
                  ) : (
                    <>
                      <strong>Not found</strong>
                      <span>No recent evidence in this field</span>
                    </>
                  )
                ) : (
                  <>
                    <strong>{college.majors.length} fields</strong>
                    <span>Select a major to compare one field</span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="compare-note">
          <Info size={17} aria-hidden="true" />
          {selectedMajor
            ? `The admit-rate row remains overall—not ${selectedMajor}-specific.`
            : "Select a major in Explore to compare academic evidence across colleges."}
        </div>
      </div>
    </ModalShell>
  );
}

function Methodology({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell titleId="methodology-title" onClose={onClose} wide>
      <div className="methodology">
        <span className="eyebrow">Trust, by design</span>
        <h2 id="methodology-title">How College Compass uses data</h2>
        <p className="methodology-lead">
          This starting release uses one national baseline for comparison and keeps
          institution-specific sources separate when definitions differ.
        </p>
        <div className="method-cards">
          <article>
            <span className="method-number">01</span>
            <h3>Comparable first</h3>
            <p>
              Admissions, cost, enrollment, and completion metrics come from the
              U.S. Department of Education’s College Scorecard for a consistent
              national cohort.
            </p>
          </article>
          <article>
            <span className="method-number">02</span>
            <h3>Majors need careful labels</h3>
            <p>
              A recent completion is evidence that students earned degrees in a
              field—not proof that a program is currently open, and never a
              major-specific admit rate.
            </p>
          </article>
          <article>
            <span className="method-number">03</span>
            <h3>No prediction theater</h3>
            <p>
              Selectivity bands summarize the overall rate. College Compass does not
              convert incomplete public data into a fake individual probability.
            </p>
          </article>
        </div>
        <div className="definition-table">
          <div>
            <strong>Overall admit rate</strong>
            <span>
              Admitted first-year applicants divided by first-year applicants for
              the institution.
            </span>
          </div>
          <div>
            <strong>Average net price</strong>
            <span>
              Average cost after grants and scholarships for federal-aid recipients;
              not every family’s personalized cost.
            </span>
          </div>
          <div>
            <strong>Graduation rate</strong>
            <span>
              First-time, full-time students completing within 150% of expected
              program time.
            </span>
          </div>
          <div>
            <strong>Median earnings</strong>
            <span>
              Median earnings among federally aided former students, measured ten
              years after entry.
            </span>
          </div>
        </div>
        <div className="method-sources">
          <SourceLink href={release.sourceUrl}>
            College Scorecard data & documentation
          </SourceLink>
          <SourceLink href={release.ucAdmissionsSourceUrl}>
            UC freshman admissions summary
          </SourceLink>
          <SourceLink href={release.ucDisciplineSourceUrl}>
            UC freshman admission by discipline
          </SourceLink>
        </div>
      </div>
    </ModalShell>
  );
}

export function CollegeCompassApp() {
  const [query, setQuery] = useState("");
  const [major, setMajor] = useState("");
  const [state, setState] = useState("");
  const [ownership, setOwnership] = useState("");
  const [band, setBand] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("name");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  const [ready, setReady] = useState(false);
  const exploreRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // The URL and device-local shortlist are external state hydrated once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(params.get("q") || "");
    setMajor(params.get("major") || "");
    setState(params.get("state") || "");
    setOwnership(params.get("type") || "");
    setBand(params.get("band") || "");
    setMaxPrice(params.get("price") || "");
    setSelected(
      (params.get("compare") || "")
        .split(",")
        .map(Number)
        .filter((id) => colleges.some((college) => college.unitId === id))
        .slice(0, 4),
    );
    try {
      setSaved(JSON.parse(localStorage.getItem("college-compass-saved") || "[]"));
    } catch {
      setSaved([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (major) params.set("major", major);
    if (state) params.set("state", state);
    if (ownership) params.set("type", ownership);
    if (band) params.set("band", band);
    if (maxPrice) params.set("price", maxPrice);
    if (selected.length) params.set("compare", selected.join(","));
    const next = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", next);
  }, [band, major, maxPrice, ownership, query, ready, selected, state]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("college-compass-saved", JSON.stringify(saved));
  }, [ready, saved]);

  useEffect(() => {
    // A changed result set starts from the first page again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount(12);
  }, [band, major, maxPrice, ownership, query, savedOnly, sort, state]);

  useEffect(() => {
    const modalIsOpen = profileId !== null || compareOpen || methodologyOpen;
    document.body.style.overflow = modalIsOpen ? "hidden" : "";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProfileId(null);
      setCompareOpen(false);
      setMethodologyOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [compareOpen, methodologyOpen, profileId]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const results = useMemo(() => {
    const tokens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((token) => token && !stopWords.has(token));

    const filtered = colleges.filter((college) => {
      const searchableMajors = college.majors.flatMap((item) => [
        item.name,
        ...(majorAliases[item.name] || []),
      ]);
      const haystack = [
        college.name,
        ...college.aliases,
        college.city,
        college.state,
        stateNames[college.state] || "",
        college.region,
        college.ownership,
        ...searchableMajors,
      ]
        .join(" ")
        .toLowerCase();

      return (
        tokens.every((token) => haystack.includes(token)) &&
        (!major || Boolean(getMajorEvidence(college, major))) &&
        (!state || college.state === state) &&
        (!ownership || college.ownership === ownership) &&
        matchesBand(college.admitRate, band) &&
        (!maxPrice || college.averageNetPrice <= Number(maxPrice)) &&
        (!savedOnly || saved.includes(college.unitId))
      );
    });

    return filtered.sort((a, b) => {
      if (sort === "admit-low") return a.admitRate - b.admitRate;
      if (sort === "admit-high") return b.admitRate - a.admitRate;
      if (sort === "price") return a.averageNetPrice - b.averageNetPrice;
      if (sort === "graduation") return b.graduationRate - a.graduationRate;
      if (sort === "major" && major) {
        return (
          (getMajorEvidence(b, major)?.share || 0) -
          (getMajorEvidence(a, major)?.share || 0)
        );
      }
      return a.name.localeCompare(b.name);
    });
  }, [band, major, maxPrice, ownership, query, saved, savedOnly, sort, state]);

  const selectedColleges = selected
    .map((id) => colleges.find((college) => college.unitId === id))
    .filter(Boolean) as College[];
  const profileCollege =
    profileId === null
      ? null
      : colleges.find((college) => college.unitId === profileId) || null;

  const autocompleteColleges = query
    ? colleges
        .filter((college) =>
          [college.name, ...college.aliases]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 4)
    : [];
  const autocompleteMajors = query
    ? majorOptions
        .filter((option) =>
          [option, ...(majorAliases[option] || [])]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 3)
    : [];

  const activeFilters = [
    major ? { label: major, clear: () => setMajor("") } : null,
    state
      ? { label: stateNames[state] || state, clear: () => setState("") }
      : null,
    ownership ? { label: ownership, clear: () => setOwnership("") } : null,
    band
      ? {
          label:
            band === "very-high-reach"
              ? "≤ 10% admit"
              : band === "reach"
                ? "10–25% admit"
                : band === "competitive"
                  ? "25–50% admit"
                  : "Over 50% admit",
          clear: () => setBand(""),
        }
      : null,
    maxPrice
      ? {
          label: `Net price ≤ ${currency.format(Number(maxPrice))}`,
          clear: () => setMaxPrice(""),
        }
      : null,
    savedOnly ? { label: "Saved only", clear: () => setSavedOnly(false) } : null,
  ].filter(Boolean) as { label: string; clear: () => void }[];

  function toggleCompare(college: College) {
    if (selected.includes(college.unitId)) {
      setSelected((current) => current.filter((id) => id !== college.unitId));
      return;
    }
    if (selected.length >= 4) {
      setStatus("Compare up to four colleges at a time.");
      return;
    }
    setSelected((current) => [...current, college.unitId]);
    setStatus(`${compactName(college)} added to comparison.`);
  }

  function toggleSaved(college: College) {
    const isSaved = saved.includes(college.unitId);
    setSaved((current) =>
      isSaved
        ? current.filter((id) => id !== college.unitId)
        : [...current, college.unitId],
    );
    setStatus(isSaved ? "Removed from saved colleges." : "Saved on this device.");
  }

  async function shareComparison() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Comparison link copied.");
    } catch {
      setStatus("Your comparison is encoded in the address bar.");
    }
  }

  function clearAll() {
    setQuery("");
    setMajor("");
    setState("");
    setOwnership("");
    setBand("");
    setMaxPrice("");
    setSavedOnly(false);
  }

  function scrollToExplore() {
    exploreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="College Compass home">
          <span className="brand-mark">
            <Compass size={22} />
          </span>
          <span>College Compass</span>
          <small>beta</small>
        </a>
        <nav className={menuOpen ? "nav-open" : ""} aria-label="Primary navigation">
          <button type="button" onClick={scrollToExplore}>
            Explore colleges
          </button>
          <button type="button" onClick={() => setMethodologyOpen(true)}>
            Methodology
          </button>
          <a href={release.sourceUrl} target="_blank" rel="noreferrer">
            Data sources
          </a>
          <button
            className="saved-nav"
            type="button"
            onClick={() => {
              setSavedOnly(true);
              scrollToExplore();
              setMenuOpen(false);
            }}
          >
            <Bookmark size={16} />
            Saved <span>{saved.length}</span>
          </button>
        </nav>
        <button
          className="menu-button"
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy">
            <div className="eyebrow">
              <ShieldCheck size={15} aria-hidden="true" />
              Evidence-backed college discovery
            </div>
            <h1>Build a college list you can <em>explain.</em></h1>
            <p>
              Search 50 verified colleges, explore majors, and compare admissions,
              cost, and outcomes—without rankings or mystery scores.
            </p>

            <div
              className="hero-search-wrap"
              onFocus={() => setSearchFocused(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setSearchFocused(false);
                }
              }}
            >
              <div className="hero-search">
                <Search size={22} aria-hidden="true" />
                <label className="sr-only" htmlFor="college-search">
                  Search colleges, majors, cities, or states
                </label>
                <input
                  id="college-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setSearchFocused(false);
                      scrollToExplore();
                    }
                  }}
                  placeholder="Try “computer science in California”"
                  autoComplete="off"
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={18} />
                  </button>
                ) : (
                  <button className="search-submit" type="button" onClick={scrollToExplore}>
                    Search
                  </button>
                )}
              </div>
              <AnimatePresence>
                {searchFocused &&
                query &&
                (autocompleteColleges.length || autocompleteMajors.length) ? (
                  <motion.div
                    className="autocomplete"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                  >
                    {autocompleteColleges.length ? (
                      <div className="autocomplete-group">
                        <span>Colleges</span>
                        {autocompleteColleges.map((college) => (
                          <button
                            type="button"
                            key={college.unitId}
                            onClick={() => {
                              setQuery(compactName(college));
                              setSearchFocused(false);
                              scrollToExplore();
                            }}
                          >
                            <span className="suggestion-icon">{initials(compactName(college))}</span>
                            <span>
                              <strong>{compactName(college)}</strong>
                              <small>
                                {college.city}, {college.state}
                              </small>
                            </span>
                            <ArrowRight size={15} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {autocompleteMajors.length ? (
                      <div className="autocomplete-group">
                        <span>Majors & fields</span>
                        {autocompleteMajors.map((option) => (
                          <button
                            type="button"
                            key={option}
                            onClick={() => {
                              setMajor(option);
                              setQuery("");
                              setSearchFocused(false);
                              scrollToExplore();
                            }}
                          >
                            <span className="suggestion-icon major">
                              <GraduationCap size={16} />
                            </span>
                            <span>
                              <strong>{option}</strong>
                              <small>Broad federal field</small>
                            </span>
                            <ArrowRight size={15} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="quick-starts">
              <span>Start with</span>
              {["Computer Science", "Business", "Biology"].map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => {
                    setMajor(option);
                    scrollToExplore();
                  }}
                >
                  {option}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setState("CA");
                  scrollToExplore();
                }}
              >
                California
              </button>
            </div>
          </div>

          <div className="hero-data-card" aria-label="College data snapshot">
            <div className="data-card-top">
              <span className="data-live">
                <span aria-hidden="true" />
                Verified cohort
              </span>
              <Database size={19} aria-hidden="true" />
            </div>
            <div className="data-card-title">
              <span>Decision snapshot</span>
              <strong>50 colleges</strong>
              <p>One comparable evidence layer, built for real tradeoffs.</p>
            </div>
            <div className="landscape">
              {landscapeColleges.map((college) => (
                <div className="landscape-row" key={college.unitId}>
                  <span>{compactName(college)}</span>
                  <div aria-hidden="true">
                    <i style={{ width: `${college.admitRate * 100}%` }} />
                  </div>
                  <strong>{percent.format(college.admitRate)}</strong>
                </div>
              ))}
            </div>
            <div className="data-card-foot">
              <Info size={15} aria-hidden="true" />
              Example overall admit rates. Open a profile for exact source-year data.
            </div>
          </div>
        </div>

        <div className="hero-stats">
          <div>
            <strong>50</strong>
            <span>verified starting colleges</span>
          </div>
          <div>
            <strong>9</strong>
            <span>undergraduate UC campuses</span>
          </div>
          <div>
            <strong>{release.institutionMetricsYear}</strong>
            <span>core federal reporting year</span>
          </div>
          <div>
            <strong>0</strong>
            <span>mystery rankings or guarantees</span>
          </div>
        </div>
      </section>

      <section className="trust-ribbon">
        <div>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            <strong>Official data, visible sources.</strong> Every headline metric
            carries its reporting year.
          </span>
        </div>
        <button type="button" onClick={() => setMethodologyOpen(true)}>
          See how it works
          <ArrowRight size={15} />
        </button>
      </section>

      <section className="explore-section" ref={exploreRef}>
        <div className="section-intro">
          <div>
            <span className="eyebrow">Explore the cohort</span>
            <h2>Find colleges that fit the question you’re asking.</h2>
          </div>
          <p>
            Choose a major, then compare the institution-wide admissions context,
            cost, completion, and evidence that students recently earned degrees in
            that field.
          </p>
        </div>

        <div className="explorer-shell">
          <aside className={`filter-panel ${filtersOpen ? "filters-visible" : ""}`}>
            <div className="filter-panel-head">
              <div>
                <SlidersHorizontal size={18} />
                <strong>Shape your search</strong>
              </div>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                <X size={18} />
              </button>
            </div>

            <label className="filter-field">
              <span>Major or field</span>
              <div className="select-wrap">
                <GraduationCap size={16} aria-hidden="true" />
                <select value={major} onChange={(event) => setMajor(event.target.value)}>
                  <option value="">All majors</option>
                  {majorOptions.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </div>
            </label>

            <label className="filter-field">
              <span>State</span>
              <div className="select-wrap">
                <MapPin size={16} aria-hidden="true" />
                <select value={state} onChange={(event) => setState(event.target.value)}>
                  <option value="">All states</option>
                  {stateOptions.map((option) => (
                    <option value={option} key={option}>
                      {stateNames[option] || option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </div>
            </label>

            <fieldset className="filter-group">
              <legend>College type</legend>
              {["", "Public", "Private nonprofit"].map((option) => (
                <label key={option || "all-type"}>
                  <input
                    type="radio"
                    name="ownership"
                    value={option}
                    checked={ownership === option}
                    onChange={(event) => setOwnership(event.target.value)}
                  />
                  <span>{option || "All types"}</span>
                </label>
              ))}
            </fieldset>

            <label className="filter-field">
              <span>Overall admit-rate band</span>
              <div className="select-wrap plain">
                <select value={band} onChange={(event) => setBand(event.target.value)}>
                  <option value="">Any admit rate</option>
                  <option value="very-high-reach">10% or lower</option>
                  <option value="reach">Above 10% through 25%</option>
                  <option value="competitive">Above 25% through 50%</option>
                  <option value="accessible">Above 50%</option>
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </div>
            </label>

            <label className="filter-field">
              <span>Maximum average net price</span>
              <div className="select-wrap plain">
                <select value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)}>
                  <option value="">Any net price</option>
                  <option value="15000">$15,000 or less</option>
                  <option value="20000">$20,000 or less</option>
                  <option value="30000">$30,000 or less</option>
                  <option value="40000">$40,000 or less</option>
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </div>
            </label>

            <button
              className={`saved-filter ${savedOnly ? "is-active" : ""}`}
              type="button"
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly((current) => !current)}
            >
              <Bookmark size={17} />
              Show saved colleges
              <span>{saved.length}</span>
            </button>

            {activeFilters.length ? (
              <button className="clear-filters" type="button" onClick={clearAll}>
                Clear all filters
              </button>
            ) : null}

            <div className="filter-source">
              <Database size={17} aria-hidden="true" />
              <p>
                <strong>{release.sourceName}</strong>
                Core metrics: {release.institutionMetricsYear}
                <br />
                Imported {release.accessedOn}
              </p>
            </div>
          </aside>

          <div className="results-panel">
            <div className="results-toolbar">
              <div>
                <button
                  className="mobile-filter-button"
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                >
                  <SlidersHorizontal size={17} />
                  Filters
                  {activeFilters.length ? <span>{activeFilters.length}</span> : null}
                </button>
                <p aria-live="polite">
                  <strong>{results.length}</strong>{" "}
                  {results.length === 1 ? "college" : "colleges"} found
                </p>
              </div>
              <label className="sort-control">
                <span>Sort by</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="name">College name</option>
                  {major ? <option value="major">Major evidence</option> : null}
                  <option value="admit-low">Admit rate: low to high</option>
                  <option value="admit-high">Admit rate: high to low</option>
                  <option value="price">Net price: low to high</option>
                  <option value="graduation">Graduation rate</option>
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
            </div>

            {activeFilters.length ? (
              <div className="filter-chips" aria-label="Applied filters">
                {activeFilters.map((filter) => (
                  <button type="button" key={filter.label} onClick={filter.clear}>
                    {filter.label}
                    <X size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}

            {major ? (
              <div className="major-context-banner">
                <div className="major-icon">
                  <GraduationCap size={21} />
                </div>
                <div>
                  <strong>Exploring {major}</strong>
                  <p>
                    Results show recent degree evidence. Admit rates remain
                    institution-wide unless an official program-level source says
                    otherwise.
                  </p>
                </div>
                <button type="button" onClick={() => setMethodologyOpen(true)}>
                  Why?
                </button>
              </div>
            ) : null}

            <div className="results-list">
              <AnimatePresence mode="popLayout">
                {results.slice(0, visibleCount).map((college) => (
                  <CollegeCard
                    key={college.unitId}
                    college={college}
                    selectedMajor={major}
                    isSelected={selected.includes(college.unitId)}
                    isSaved={saved.includes(college.unitId)}
                    onOpen={() => setProfileId(college.unitId)}
                    onCompare={() => toggleCompare(college)}
                    onSave={() => toggleSaved(college)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {!results.length ? (
              <div className="empty-state">
                <span className="empty-compass">
                  <Compass size={32} />
                </span>
                <h3>No colleges match every filter yet.</h3>
                <p>
                  Try widening the admit-rate or price range, or remove the major
                  filter to see the full verified cohort.
                </p>
                <button className="primary-button" type="button" onClick={clearAll}>
                  Reset filters
                </button>
              </div>
            ) : null}

            {visibleCount < results.length ? (
              <button
                className="load-more"
                type="button"
                onClick={() => setVisibleCount((current) => current + 12)}
              >
                Show more colleges
                <ArrowDown size={17} />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="principles-section">
        <div className="principles-head">
          <span className="eyebrow">A calmer way to choose</span>
          <h2>Fit is personal. The evidence should still be inspectable.</h2>
        </div>
        <div className="principles-grid">
          <article>
            <span>
              <Database size={22} />
            </span>
            <h3>Every metric has a home</h3>
            <p>
              See the publisher, reporting year, cohort, and definition behind the
              number—not just a shiny percentage.
            </p>
          </article>
          <article>
            <span>
              <GraduationCap size={22} />
            </span>
            <h3>Majors are labeled honestly</h3>
            <p>
              Current offerings, recent completions, discipline data, and overall
              rates are different claims. We keep them different.
            </p>
          </article>
          <article>
            <span>
              <HeartHandshake size={22} />
            </span>
            <h3>Context, not destiny</h3>
            <p>
              Admission bands help balance a list. They do not pretend to know an
              individual decision.
            </p>
          </article>
        </div>
      </section>

      <section className="cta-section">
        <div>
          <span className="eyebrow">
            <Sparkles size={15} />
            Your shortlist starts here
          </span>
          <h2>Compare the tradeoffs—not the hype.</h2>
          <p>
            Pick two to four colleges and put admissions, cost, outcomes, and major
            evidence on the same page.
          </p>
        </div>
        <button className="light-button" type="button" onClick={scrollToExplore}>
          Explore the 50-college cohort
          <ArrowRight size={18} />
        </button>
      </section>

      <footer className="site-footer">
        <div>
          <a className="brand footer-brand" href="#top">
            <span className="brand-mark">
              <Compass size={20} />
            </span>
            College Compass
          </a>
          <p>Evidence for the list only you can build.</p>
        </div>
        <div className="footer-links">
          <button type="button" onClick={() => setMethodologyOpen(true)}>
            Methodology
          </button>
          <SourceLink href={release.sourceUrl}>Federal data</SourceLink>
          <SourceLink href={release.ucAdmissionsSourceUrl}>UC data</SourceLink>
        </div>
        <p className="footer-disclaimer">
          Admissions context is educational, not a guarantee or application
          decision. Verify current programs and policies with each college.
        </p>
      </footer>

      <AnimatePresence>
        {selected.length ? (
          <motion.div
            className="compare-tray"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
          >
            <div className="compare-tray-colleges">
              {selectedColleges.map((college) => (
                <button
                  type="button"
                  key={college.unitId}
                  onClick={() => toggleCompare(college)}
                  aria-label={`Remove ${college.name} from comparison`}
                >
                  <span>{initials(compactName(college))}</span>
                  <strong>{compactName(college)}</strong>
                  <X size={14} />
                </button>
              ))}
              {Array.from({ length: 4 - selected.length }).map((_, index) => (
                <span className="compare-empty" key={index}>
                  <span>+</span>
                  Add a college
                </span>
              ))}
            </div>
            <button
              className="tray-action"
              type="button"
              disabled={selected.length < 2}
              onClick={() => setCompareOpen(true)}
            >
              Compare {selected.length}
              <ArrowRight size={17} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {profileCollege ? (
          <CollegeProfile
            college={profileCollege}
            selectedMajor={major}
            isSelected={selected.includes(profileCollege.unitId)}
            isSaved={saved.includes(profileCollege.unitId)}
            onClose={() => setProfileId(null)}
            onCompare={() => toggleCompare(profileCollege)}
            onSave={() => toggleSaved(profileCollege)}
          />
        ) : null}
        {compareOpen ? (
          <CompareView
            selectedColleges={selectedColleges}
            selectedMajor={major}
            onClose={() => setCompareOpen(false)}
            onRemove={toggleCompare}
            onShare={shareComparison}
          />
        ) : null}
        {methodologyOpen ? (
          <Methodology onClose={() => setMethodologyOpen(false)} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {status ? (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <Check size={16} />
            {status}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
