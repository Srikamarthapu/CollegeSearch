import { isDeepStrictEqual } from "node:util";
import { buildCollegeKnowledge } from "../../../scripts/lib/college-knowledge.mjs";
import type { College, CollegeDataset } from "../college-data";
import type { AdviserInterpretation } from "./contracts.ts";
import type { AdviserEvidence } from "./engine.ts";
import { publicCollegeCandidates, adviserNetPriceApplies, adviserTuition, usableAdviserObservation } from "./evidence.ts";

type Row = Record<string, unknown>;
export type KnowledgeRpc = (name: string, parameters: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
export type QueryEmbedding = { embedding: number[]; model: string; modelVersion: string };
export type KnowledgeEmbedder = { model: string; modelVersion: string; query(text: string, signal?: AbortSignal): Promise<QueryEmbedding> };
function rows(value: unknown): Row[] {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Invalid knowledge response.");
  return value as Row[];
}
function requireEqual(actual: unknown, expected: unknown) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error("College evidence does not match the reviewed release.");
}

/** Balance the bounded ranking set; this is not an admission-chance classification. */
function diverseCandidates(colleges: College[], preferredIds: number[], limit = 16): College[] {
  const selected = preferredIds.slice(0, 6).flatMap((id) => colleges.find((college) => college.unitId === id) ?? []);
  const selectedIds = new Set(selected.map((college) => college.unitId));
  const buckets = new Map<string, College[]>();
  for (const college of colleges) {
    if (selectedIds.has(college.unitId)) continue;
    const rate = college.observations.admitRate.value;
    const key = `${college.region}:${college.ownership}:${rate === null ? "unknown" : rate < 0.2 ? "under20" : rate < 0.6 ? "20to60" : "over60"}`;
    buckets.set(key, [...(buckets.get(key) ?? []), college]);
  }
  while (selected.length < limit && buckets.size) {
    for (const [key, bucket] of buckets) {
      if (selected.length >= limit) break;
      const college = bucket.shift()!;
      selected.push(college);
      if (!bucket.length) buckets.delete(key);
    }
  }
  return selected;
}

/** A database result is only usable when it matches the deployed, reviewed artifact. */
export function createKnowledgeRetriever(dataset: CollegeDataset, releaseId: string, rpc: KnowledgeRpc, embedder?: KnowledgeEmbedder) {
  const compiled = buildCollegeKnowledge(dataset, releaseId);
  const expectedFacts = new Map<string, Row>(compiled.facts.map((fact: Row) => [fact.fact_id as string, fact]));
  const expectedPassages = new Map<string, Row>(compiled.passages.map((passage: Row) => [passage.passage_id as string, passage]));
  const expectedSources = new Map(dataset.release.sources.map((source) => [source.id, source]));
  const collegesById = new Map(dataset.colleges.map((college) => [college.unitId, college]));
  const factsPerCollege = new Map<number, number>();
  for (const fact of compiled.facts) if (fact.is_primary && ["reported", "derived"].includes(fact.status)) factsPerCollege.set(fact.unit_id, (factsPerCollege.get(fact.unit_id) ?? 0) + 1);

  function validateCollege(row: Row, allowed: ReadonlySet<number>): College {
    const college = collegesById.get(row.unit_id as number);
    if (!college || !allowed.has(college.unitId)) throw new Error("Unexpected college identity from retrieval.");
    requireEqual(row.release_id, releaseId);
    requireEqual(row.college_slug, college.slug);
    requireEqual(row.college_name, college.name);
    requireEqual(row.record_json, college);
    const facts = rows(row.facts);
    requireEqual(facts.length, factsPerCollege.get(college.unitId));
    const seen = new Set<string>();
    for (const fact of facts) {
      const expected = expectedFacts.get(fact.factId as string);
      if (!expected || expected.unit_id !== college.unitId || expected.is_primary !== true || seen.has(fact.factId as string)) throw new Error("Unbound or duplicate college fact.");
      seen.add(fact.factId as string);
      const source = expectedSources.get(expected.source_id as string)!;
      const match = {
        factId: expected.fact_id, factKey: expected.fact_key, metricKey: expected.metric_key, dimensionKey: expected.dimension_key,
        isPrimary: expected.is_primary, value: expected.value_numeric ?? expected.value_boolean ?? expected.value_text,
        unit: expected.unit, reportingYear: expected.reporting_year, periodLabel: expected.period_label,
        cohort: expected.cohort, definition: expected.definition, status: expected.status, finality: expected.finality,
        accessedOn: expected.accessed_on, comparabilityKey: expected.comparability_key, sourceId: expected.source_id,
        publisher: source.publisher, sourceName: source.sourceName, sourceUrl: expected.evidence_url, sourceField: expected.source_field,
      };
      requireEqual(fact, match);
    }
    return college;
  }

  return async function retrieve(interpretation: AdviserInterpretation, signal?: AbortSignal): Promise<AdviserEvidence> {
    const releaseRows = rows(await rpc("current_college_knowledge_release", {}, signal));
    if (releaseRows.length !== 1) throw new Error("A published college knowledge release is required.");
    const release = releaseRows[0];
    requireEqual(release.release_id, releaseId);
    requireEqual(release.dataset_sha256, releaseId.replace("sha256:", ""));
    requireEqual(release.institution_count, dataset.colleges.length);
    const preferences = interpretation.preferences;
    // Narrow from the exact versioned artifact before sending a bounded set to SQL.
    // SQL still applies every numeric constraint and checks source/residency semantics.
    const eligible = publicCollegeCandidates(dataset.colleges, preferences, interpretation.mentionedUnitIds).filter(college => {
      const enrollment = college.observations.undergraduateEnrollment;
      if (preferences.size && (!usableAdviserObservation(enrollment) ||
        (preferences.size === "small" ? enrollment.value >= 5000 : preferences.size === "medium" ? enrollment.value < 5000 || enrollment.value > 15000 : enrollment.value <= 15000))) return false;
      if (preferences.annualBudget !== null && preferences.budgetBasis !== "total-cost") {
        const amount = preferences.budgetBasis === "tuition" ? adviserTuition(college, preferences)?.observation :
          preferences.budgetBasis === "average-net-price" && adviserNetPriceApplies(college, preferences) ? college.observations.averageNetPrice : null;
        if (preferences.budgetBasis && (!usableAdviserObservation(amount) || amount.value > preferences.annualBudget)) return false;
      }
      return true;
    });
    const initial = eligible.length > 100 ? diverseCandidates(eligible, interpretation.mentionedUnitIds, 100) : eligible;
    if (!initial.length) return { colleges: [], passages: [], mode: "keyword", notices: [] };
    const bounds: Record<string, { min?: number; max?: number }> = {};
    if (preferences.size) bounds.undergraduateEnrollment = preferences.size === "small" ? { max: 4999 } : preferences.size === "medium" ? { min: 5000, max: 15000 } : { min: 15001 };
    const groups: Array<{ ids: number[]; filters: typeof bounds }> = [];
    const notices: string[] = eligible.length > 100 ? ["This reply checks a balanced sample of 100 colleges matching these filters. Narrow your preferences to explore more of the catalog."] : [];
    if (preferences.annualBudget !== null && preferences.budgetBasis === "tuition") {
      const resident = initial.filter((college) => college.ownership === "Public" && college.state === preferences.residencyState);
      const other = initial.filter((college) => !resident.includes(college));
      if (resident.length) groups.push({ ids: resident.map((college) => college.unitId), filters: { ...bounds, tuitionInState: { max: preferences.annualBudget } } });
      if (other.length) groups.push({ ids: other.map((college) => college.unitId), filters: { ...bounds, tuitionOutOfState: { max: preferences.annualBudget } } });
      notices.push("This budget filters published tuition and required fees only. Housing and other expenses are additional; missing comparable tuition excludes a college.");
    } else {
      if (preferences.annualBudget !== null && preferences.budgetBasis === "average-net-price") {
        bounds.averageNetPrice = { max: preferences.annualBudget };
        notices.push("This budget filters historical average net price for the source cohort. It is not a prediction of your price or aid; public-college figures require matching residency.");
      } else if (preferences.annualBudget !== null) notices.push("A comparable total cost of attendance is not verified across this collection, so your full-cost budget has not been applied as a price filter. Check official cost pages and net price calculators.");
      groups.push({ ids: initial.map((college) => college.unitId), filters: bounds });
    }
    // Each result includes the complete source evidence for its campuses. Keep
    // individual responses small as the field catalog grows, at most six calls.
    const evidenceBatches = groups.flatMap((group) => Array.from({ length: Math.ceil(group.ids.length / 20) }, (_, index) =>
      ({ ...group, ids: group.ids.slice(index * 20, (index + 1) * 20) })));
    const factResults = await Promise.all(evidenceBatches.map(async (group) => {
      const result = rows(await rpc("filter_college_facts", { p_filters: group.filters, p_residency_state: preferences.residencyState,
        p_limit: 20, p_offset: 0, p_unit_ids: group.ids, p_expected_release_id: releaseId }, signal));
      return result.map((row) => validateCollege(row, new Set(group.ids)));
    }));
    const filtered = factResults.flat();
    if (new Set(filtered.map((college) => college.unitId)).size !== filtered.length) throw new Error("Duplicate colleges returned by the database.");
    if (!filtered.length) return { colleges: [], passages: [], mode: "keyword", notices };
    const query = (preferences.fields.join(" OR ") || interpretation.searchText || filtered[0].name).slice(0, 500);
    let embedding: QueryEmbedding | null = null;
    if (embedder && release.embedding_model === embedder.model && release.embedding_version === embedder.modelVersion) {
      try {
        embedding = await embedder.query(query, signal);
        if (embedding.model !== embedder.model || embedding.modelVersion !== embedder.modelVersion || embedding.embedding.length !== 2048 ||
            embedding.embedding.some((value) => !Number.isFinite(Math.fround(value))) ||
            !embedding.embedding.some((value) => Math.fround(value) !== 0)) throw new Error("Invalid query embedding.");
      } catch {
        if (signal?.aborted) throw new Error("Retrieval cancelled.");
        notices.push("Semantic search was unavailable for this reply; it uses verified structured facts and keyword evidence.");
        embedding = null;
      }
    }
    const passageRows = rows(await rpc("hybrid_search_college_passages", {
      p_query_text: query, p_query_embedding: embedding?.embedding ?? null, p_embedding_model: embedding?.model ?? null,
      p_embedding_version: embedding?.modelVersion ?? null, p_match_count: 20, p_unit_ids: filtered.map((college) => college.unitId), p_expected_release_id: releaseId,
    }, signal));
    const allowedIds = new Set(filtered.map((college) => college.unitId));
    const passages = passageRows.map((row) => {
      const expected = expectedPassages.get(row.passage_id as string);
      if (!expected || !allowedIds.has(row.unit_id as number)) throw new Error("Unbound evidence passage.");
      for (const key of ["release_id", "unit_id", "content", "source_id", "source_url", "source_field", "field_locator", "reporting_year", "period_label", "cohort", "definition", "content_sha256"]) requireEqual(row[key], expected[key]);
      const college = collegesById.get(row.unit_id as number)!;
      requireEqual(row.college_slug, college.slug);
      requireEqual(row.college_name, college.name);
      return { unitId: college.unitId, passageId: row.passage_id as string, content: row.content as string, sourceId: row.source_id as string,
        sourceField: row.source_field as string, fieldLocator: row.field_locator as string,
        sourceUrl: row.source_url as string, reportingYear: row.reporting_year as number | null, periodLabel: row.period_label as string, cohort: row.cohort as string };
    });
    if (!passages.length) notices.push("No verified descriptive passage matched this topic. These results use only the structured facts shown; unverified campus or program details are unknown.");
    const rankedIds = [...new Set(passages.map((passage) => passage.unitId))];
    const candidates = diverseCandidates(filtered, interpretation.mentionedUnitIds.length ? interpretation.mentionedUnitIds : rankedIds);
    const selectedIds = new Set(candidates.map((college) => college.unitId));
    return { colleges: candidates, passages: passages.filter((passage) => selectedIds.has(passage.unitId)), mode: embedding ? "hybrid" : "keyword", notices };
  };
}
