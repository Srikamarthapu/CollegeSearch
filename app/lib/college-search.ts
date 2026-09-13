import type { ClientCollege } from "@/app/lib/college-client-record";

export type CollegeSearchIdentity = Pick<
  ClientCollege,
  "unitId" | "name" | "aliases" | "city" | "state"
>;

export const STATE_NAMES: Record<string, string> = {
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

export const MAJOR_ALIASES: Record<string, string[]> = {
  "Computing & Information Sciences": [
    "computer science",
    "cs",
    "computing",
    "software",
  ],
  "Business & Marketing": ["business", "marketing", "finance", "management"],
  Engineering: ["engineer", "engineering"],
  "Biological & Biomedical Sciences": [
    "biology",
    "bio",
    "life science",
    "pre med",
  ],
  "Health Professions": ["health", "nursing", "public health"],
  Psychology: ["psych", "psychology"],
  "Social Sciences": ["political science", "economics", "sociology"],
  "Visual & Performing Arts": ["art", "design", "music", "theater"],
  Education: ["teaching", "education"],
  "Mathematics & Statistics": ["math", "mathematics", "statistics"],
  "Physical Sciences": ["physics", "chemistry"],
  "English Language & Literature": ["english", "writing", "literature"],
};

export const MAJOR_OPTIONS = Object.keys(MAJOR_ALIASES);

const ignoredTokens = new Set([
  "at",
  "college",
  "colleges",
  "for",
  "in",
  "near",
  "school",
  "schools",
  "the",
  "university",
  "universities",
  "with",
]);

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function words(value: string) {
  return normalizeSearchText(value).split(" ").filter(Boolean);
}

function editDistanceAtMostOne(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function tokenMatches(queryToken: string, candidateToken: string) {
  if (queryToken === candidateToken) return true;
  if (
    queryToken.length >= 4 &&
    candidateToken.length >= 4 &&
    (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken))
  ) {
    return true;
  }
  return (
    queryToken.length >= 5 &&
    candidateToken.length >= 5 &&
    editDistanceAtMostOne(queryToken, candidateToken)
  );
}

function phraseMatchesQuery(queryTokens: string[], phrase: string) {
  const phraseTokens = words(phrase);
  return phraseTokens.every((phraseToken) =>
    queryTokens.some((queryToken) => tokenMatches(queryToken, phraseToken)),
  );
}

function exactIdentityMatch(
  college: CollegeSearchIdentity,
  normalizedQuery: string,
) {
  return [college.name, ...college.aliases].some(
    (name) => normalizeSearchText(name) === normalizedQuery,
  );
}

/**
 * Filters college-shaped records by institution identity and location only.
 * This is intentionally separate from `filterCollegesByQuery`, whose query
 * language also interprets major names. Selectors should not silently turn a
 * college name into an academic-field filter.
 */
export function filterCollegeIdentitiesByQuery<
  T extends CollegeSearchIdentity,
>(allColleges: T[], query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return allColleges;

  const exactMatches = allColleges.filter((college) =>
    exactIdentityMatch(college, normalized),
  );
  if (exactMatches.length > 0) return exactMatches;

  const queryTokens = words(normalized).filter(
    (token) => !ignoredTokens.has(token),
  );
  if (queryTokens.length === 0) return allColleges;

  return allColleges.filter((college) => {
    const candidateTokens = words(
      [
        college.name,
        ...college.aliases,
        college.city,
        college.state,
        STATE_NAMES[college.state] ?? "",
      ].join(" "),
    );
    return queryTokens.every((queryToken) =>
      candidateTokens.some((candidateToken) =>
        tokenMatches(queryToken, candidateToken),
      ),
    );
  });
}

function detectedMajor(queryTokens: string[]) {
  return MAJOR_OPTIONS.find((major) =>
    [major, ...MAJOR_ALIASES[major]].some((phrase) =>
      phraseMatchesQuery(queryTokens, phrase),
    ),
  );
}

export function matchingMajors(query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const queryTokens = words(normalized);
  return MAJOR_OPTIONS.filter((major) =>
    [major, ...MAJOR_ALIASES[major]].some((phrase) => {
      const normalizedPhrase = normalizeSearchText(phrase);
      return (
        normalizedPhrase.includes(normalized) ||
        normalized.includes(normalizedPhrase) ||
        phraseMatchesQuery(queryTokens, phrase)
      );
    }),
  );
}

function detectedState(queryTokens: string[]) {
  return Object.entries(STATE_NAMES).find(([code, name]) => {
    const normalizedCode = code.toLowerCase();
    const nameTokens = words(name);
    return (
      queryTokens.includes(normalizedCode) ||
      nameTokens.every((nameToken) =>
        queryTokens.some(
          (queryToken) =>
            queryToken === nameToken ||
            (queryToken.length >= 5 && editDistanceAtMostOne(queryToken, nameToken)),
        ),
      )
    );
  })?.[0];
}

function tokensConsumedByPhrase(queryTokens: string[], phrase: string) {
  const phraseTokens = words(phrase);
  return new Set(
    queryTokens.filter((queryToken) =>
      phraseTokens.some((phraseToken) => tokenMatches(queryToken, phraseToken)),
    ),
  );
}

export function filterCollegesByQuery(
  allColleges: ClientCollege[],
  query: string,
) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return allColleges;

  const exactMatches = allColleges.filter((college) =>
    exactIdentityMatch(college, normalized),
  );
  if (exactMatches.length > 0) return exactMatches;

  const queryTokens = words(normalized).filter((token) => !ignoredTokens.has(token));
  const major = detectedMajor(queryTokens);
  const stateCode = detectedState(queryTokens);
  const consumed = new Set<string>();

  if (major) {
    const matchingPhrase = [major, ...MAJOR_ALIASES[major]].find((phrase) =>
      phraseMatchesQuery(queryTokens, phrase),
    );
    if (matchingPhrase) {
      for (const token of tokensConsumedByPhrase(queryTokens, matchingPhrase)) {
        consumed.add(token);
      }
    }
  }
  if (stateCode) {
    for (const token of [stateCode.toLowerCase(), ...words(STATE_NAMES[stateCode])]) {
      consumed.add(token);
    }
  }

  const remainingTokens = queryTokens.filter((token) => {
    if (consumed.has(token)) return false;
    if (stateCode && words(STATE_NAMES[stateCode]).some((item) => tokenMatches(token, item))) {
      return false;
    }
    return true;
  });

  return allColleges.filter((college) => {
    if (stateCode && college.state !== stateCode) return false;
    if (major && !college.majors.some((item) => item.name === major)) return false;

    const candidateTokens = words(
      [college.name, ...college.aliases, college.city, college.state].join(" "),
    );
    return remainingTokens.every((queryToken) =>
      candidateTokens.some((candidateToken) => tokenMatches(queryToken, candidateToken)),
    );
  });
}
