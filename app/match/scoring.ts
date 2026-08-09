export const MATCH_CRITERIA = [
  "major",
  "location",
  "price",
  "size",
  "graduation",
  "earnings",
] as const;

export type MatchCriterion = (typeof MATCH_CRITERIA)[number];

export type MatchMetric = {
  value: number | null;
  periodLabel: string;
  publisher: string;
};

export type MatchMajor = {
  name: string;
  share: number;
  periodLabel: string;
};

export type MatchCollege = {
  unitId: number;
  slug: string;
  name: string;
  city: string;
  state: string;
  ownership: string;
  setting: string;
  majors: MatchMajor[];
  admitRate: MatchMetric;
  netPrice: MatchMetric;
  graduationRate: MatchMetric;
  medianEarnings: MatchMetric;
  enrollment: MatchMetric;
};

export type MatchWeights = Record<MatchCriterion, number>;

export type MatchPreferences = {
  major: string;
  region: string;
  ownership: string;
  maxNetPrice: number | null;
  size: string;
  weights: MatchWeights;
};

export type MatchComponent = {
  key: MatchCriterion;
  label: string;
  weight: number;
  score: number | null;
  note: string;
  missing?: boolean;
};

export type MatchResult = {
  college: MatchCollege;
  score: number;
  components: MatchComponent[];
  usedWeight: number;
};

export function hasActiveMatchSignal(weights: MatchWeights) {
  return MATCH_CRITERIA.some((criterion) => weights[criterion] > 0);
}

const regionStates: Record<string, Set<string>> = {
  west: new Set(["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"]),
  midwest: new Set(["IA", "IL", "IN", "KS", "MI", "MN", "MO", "ND", "NE", "OH", "SD", "WI"]),
  northeast: new Set(["CT", "MA", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"]),
  south: new Set(["AL", "AR", "DC", "DE", "FL", "GA", "KY", "LA", "MD", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"]),
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function locationMatches(state: string, preference: string) {
  if (preference === "anywhere") return true;
  if (preference.startsWith("state:")) {
    return state === preference.slice("state:".length);
  }
  return regionStates[preference]?.has(state) ?? false;
}

export function enrollmentBand(enrollment: number | null) {
  if (enrollment === null) return null;
  if (enrollment < 10_000) return "small";
  if (enrollment < 25_000) return "medium";
  return "large";
}

export function matchBounds(colleges: MatchCollege[]) {
  const earnings = colleges
    .map((college) => college.medianEarnings.value)
    .filter((value): value is number => value !== null);

  return {
    minimumEarnings: earnings.length > 0 ? Math.min(...earnings) : 0,
    maximumEarnings: earnings.length > 0 ? Math.max(...earnings) : 1,
  };
}

function scoreEarnings(
  value: number,
  bounds: ReturnType<typeof matchBounds>,
) {
  const spread = bounds.maximumEarnings - bounds.minimumEarnings;
  if (spread <= 0) return 1;
  return clamp((value - bounds.minimumEarnings) / spread);
}

function activeComponent(
  key: MatchCriterion,
  label: string,
  weight: number,
  score: number,
  note: string,
): MatchComponent {
  return { key, label, weight, score: clamp(score), note };
}

function missingComponent(
  key: MatchCriterion,
  label: string,
  weight: number,
  note: string,
): MatchComponent {
  return { key, label, weight, score: null, note, missing: true };
}

export function scoreCollege(
  college: MatchCollege,
  preferences: MatchPreferences,
  bounds: ReturnType<typeof matchBounds>,
): MatchResult {
  const components: MatchComponent[] = [];

  if (preferences.major !== "undecided" && preferences.weights.major > 0) {
    const evidence = college.majors.find(
      (major) => major.name === preferences.major,
    );
    components.push(
      activeComponent(
        "major",
        "Field availability",
        preferences.weights.major,
        evidence ? 1 : 0,
        evidence
          ? `${preferences.major} is listed as a broad bachelor's field (${evidence.periodLabel}).`
          : `${preferences.major} is not listed as an available broad bachelor's field in this release.`,
      ),
    );
  }

  if (preferences.region !== "anywhere" && preferences.weights.location > 0) {
    const matches = locationMatches(college.state, preferences.region);
    components.push(
      activeComponent(
        "location",
        "Location",
        preferences.weights.location,
        matches ? 1 : 0,
        matches
          ? `${college.city}, ${college.state} matches your location preference.`
          : `${college.city}, ${college.state} sits outside your preferred location.`,
      ),
    );
  }

  if (preferences.maxNetPrice !== null && preferences.weights.price > 0) {
    const netPrice = college.netPrice.value;
    if (netPrice === null) {
      components.push(
        missingComponent(
          "price",
          "Average net price",
          preferences.weights.price,
          "Average net price is not reported; it is excluded from this score.",
        ),
      );
    } else {
      const preferredMaximum = preferences.maxNetPrice;
      const priceScore =
        netPrice <= preferredMaximum
          ? 1
          : 1 - (netPrice - preferredMaximum) / preferredMaximum;
      components.push(
        activeComponent(
          "price",
          "Average net price",
          preferences.weights.price,
          priceScore,
          netPrice <= preferredMaximum
            ? "Reported average net price is within your preferred maximum."
            : "Reported average net price is above your preferred maximum.",
        ),
      );
    }
  }

  if (preferences.size !== "any" && preferences.weights.size > 0) {
    const band = enrollmentBand(college.enrollment.value);
    if (band === null) {
      components.push(
        missingComponent(
          "size",
          "Campus size",
          preferences.weights.size,
          "Undergraduate enrollment is not reported; size is excluded from this score.",
        ),
      );
    } else {
      components.push(
        activeComponent(
          "size",
          "Campus size",
          preferences.weights.size,
          band === preferences.size ? 1 : 0,
          band === preferences.size
            ? `Reported undergraduate enrollment falls in your ${preferences.size} range.`
            : `Reported undergraduate enrollment falls in the ${band} range.`,
        ),
      );
    }
  }

  if (preferences.weights.graduation > 0) {
    const graduationRate = college.graduationRate.value;
    components.push(
      graduationRate === null
        ? missingComponent(
            "graduation",
            "Graduation outcome",
            preferences.weights.graduation,
            "Graduation evidence is not reported; it is excluded from this score.",
          )
        : activeComponent(
            "graduation",
            "Graduation outcome",
            preferences.weights.graduation,
            graduationRate,
            `Uses the reported ${college.graduationRate.periodLabel} completion measure.`,
          ),
    );
  }

  if (preferences.weights.earnings > 0) {
    const earnings = college.medianEarnings.value;
    components.push(
      earnings === null
        ? missingComponent(
            "earnings",
            "Earnings context",
            preferences.weights.earnings,
            "Earnings evidence is not reported; it is excluded from this score.",
          )
        : activeComponent(
            "earnings",
            "Earnings context",
            preferences.weights.earnings,
            scoreEarnings(earnings, bounds),
            `Compares ${college.medianEarnings.periodLabel} median earnings with the other colleges in this release.`,
          ),
    );
  }

  const scored = components.filter(
    (component): component is MatchComponent & { score: number } =>
      component.score !== null && component.weight > 0,
  );
  const usedWeight = scored.reduce(
    (total, component) => total + component.weight,
    0,
  );
  const weightedPoints = scored.reduce(
    (total, component) => total + component.score * component.weight,
    0,
  );

  return {
    college,
    components,
    usedWeight,
    score: usedWeight > 0 ? Math.round((weightedPoints / usedWeight) * 100) : 0,
  };
}

export function rankMatches(
  colleges: MatchCollege[],
  preferences: MatchPreferences,
  limit = 10,
) {
  if (!hasActiveMatchSignal(preferences.weights)) return [];

  const bounds = matchBounds(colleges);
  return colleges
    .filter(
      (college) =>
        preferences.ownership === "any" ||
        college.ownership === preferences.ownership,
    )
    .map((college) => scoreCollege(college, preferences, bounds))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.college.name.localeCompare(right.college.name),
    )
    .slice(0, limit);
}
