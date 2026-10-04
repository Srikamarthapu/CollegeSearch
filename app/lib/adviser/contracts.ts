import { broadFieldDefinitions } from "../broad-fields.ts";
/** Shared, provider-independent contracts. No student data belongs in the public knowledge base. */
export const adviserFields = broadFieldDefinitions.map(field => field.name);

export type AdviserField = typeof adviserFields[number];
export type AdviserIntent = "recommend" | "compare" | "personal-chances" | "major-admit-rate" | "financial-aid" | "other";
export type AdviserQuestion = "field" | "location" | "budget" | "residency" | "size" | "budget-basis" | "none";
export type AdviserPreferences = {
  fields: AdviserField[];
  states: string[];
  residencyState: string | null;
  annualBudget: number | null;
  budgetBasis: "tuition" | "average-net-price" | "total-cost" | null;
  size: "small" | "medium" | "large" | null;
  ownership: "Public" | "Private nonprofit" | "Private for-profit" | null;
};
export type AdviserInterpretation = {
  preferences: AdviserPreferences;
  intent: AdviserIntent;
  mentionedUnitIds: number[];
  question: AdviserQuestion;
  // Retrieval text is a query, never SQL or an instruction to a tool.
  searchText: string;
};
export const emptyAdviserPreferences: AdviserPreferences = {
  fields: [], states: [], residencyState: null, annualBudget: null,
  budgetBasis: null, size: null, ownership: null,
};
export const usStateCodes = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" "));

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid adviser response.");
  return value as Record<string, unknown>;
}
function keysOnly(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Unexpected adviser field.");
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error("Invalid adviser choice.");
  return value as T;
}
function nullableChoice<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return value === null ? null : choice(value, choices);
}
function choices<T extends string>(value: unknown, allowed: readonly T[], max: number): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid adviser choices.");
  const result = value.map((entry) => choice(entry, allowed));
  if (new Set(result).size !== result.length) throw new Error("Duplicate adviser choices.");
  return result;
}

export function parseAdviserPreferences(input: unknown): AdviserPreferences {
  const value = object(input);
  keysOnly(value, Object.keys(emptyAdviserPreferences));
  const budget = value.annualBudget;
  if (budget !== null && (typeof budget !== "number" || !Number.isFinite(budget) || budget < 0 || budget > 250_000)) {
    throw new Error("Invalid annual budget.");
  }
  const basis = nullableChoice(value.budgetBasis, ["tuition", "average-net-price", "total-cost"] as const);
  return {
    fields: choices(value.fields, adviserFields, 4),
    states: choices(value.states, [...usStateCodes], 10),
    residencyState: nullableChoice(value.residencyState, [...usStateCodes]),
    annualBudget: budget as number | null,
    budgetBasis: basis,
    size: nullableChoice(value.size, ["small", "medium", "large"] as const),
    ownership: nullableChoice(value.ownership, ["Public", "Private nonprofit", "Private for-profit"] as const),
  };
}

export function parseAdviserInterpretation(input: unknown, knownIds: ReadonlySet<number>): AdviserInterpretation {
  const value = object(input);
  keysOnly(value, ["preferences", "intent", "mentionedUnitIds", "question", "searchText"]);
  if (!Array.isArray(value.mentionedUnitIds) || value.mentionedUnitIds.length > 8 ||
      value.mentionedUnitIds.some((id) => !Number.isInteger(id) || !knownIds.has(id)) ||
      new Set(value.mentionedUnitIds).size !== value.mentionedUnitIds.length) {
    throw new Error("Unknown or duplicate college identity.");
  }
  if (typeof value.searchText !== "string" || value.searchText.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.searchText)) {
    throw new Error("Invalid evidence query.");
  }
  return {
    preferences: parseAdviserPreferences(value.preferences),
    intent: choice(value.intent, ["recommend", "compare", "personal-chances", "major-admit-rate", "financial-aid", "other"] as const),
    mentionedUnitIds: value.mentionedUnitIds as number[],
    question: choice(value.question, ["field", "location", "budget", "residency", "size", "budget-basis", "none"] as const),
    searchText: value.searchText.trim(),
  };
}

export function parseAdviserRanking(input: unknown, candidateIds: ReadonlySet<number>): number[] {
  const value = object(input);
  keysOnly(value, ["unitIds"]);
  if (!Array.isArray(value.unitIds) || value.unitIds.length < 1 || value.unitIds.length > 4 ||
      value.unitIds.some((id) => !Number.isInteger(id) || !candidateIds.has(id)) ||
      new Set(value.unitIds).size !== value.unitIds.length) {
    throw new Error("Recommendations must use distinct retrieved colleges.");
  }
  return value.unitIds as number[];
}

export const adviserQuestions: Record<AdviserQuestion, string | null> = {
  field: "What would you like to study? A broad subject or a few interests is a good starting point.",
  location: "Are there states you would like to consider, or are you open to anywhere in this collection?",
  budget: "What annual budget would you like to research? Tell me whether you mean tuition and fees or the full cost including housing.",
  residency: "Which U.S. state are you a resident of? Public-college prices and federal net-price figures can depend on residency.",
  size: "Would you prefer a smaller campus (under 5,000 undergraduates), a medium one (5,000–15,000), or a larger one?",
  "budget-basis": "Does that annual budget cover tuition and fees, or your full cost including housing and other expenses?",
  none: null,
};

export const adviserBoundaries = {
  "personal-chances": "I can help you research an application list, but I cannot calculate your admission odds or label a school a guaranteed safety. Published admission rates describe past groups of applicants, not your personal chance.",
  "major-admit-rate": "This collection does not have verified major-specific admission rates. An overall university rate cannot answer that question. Check the program's official admissions information.",
  "financial-aid": "A historical average net price is not an aid offer or a prediction of your bill. Use each college's official net price calculator and financial aid office to estimate your own costs.",
  other: "I do not have verified information for that institution or topic in this collection. Check the college name or its official website. I can help compare listed colleges by broad fields, location, published costs and campus size.",
} as const;
