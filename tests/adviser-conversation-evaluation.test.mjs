import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  auditConversationTurn,
  boundedReportText,
  conversationCarryState,
  conversationSequence,
  createBoundedProviderFetch,
  createDryRunReport,
  conversationEvaluationExitCode,
  conversationStatusFromSummary,
  expectedAdviserQuestionKey,
  parseConversationArgs,
  summarizeConversationReport,
  conversationChatPolicy,
} from "../scripts/evaluate-adviser-conversation.mjs";
import { adviserQuestions, emptyAdviserPreferences } from "../app/lib/adviser/contracts.ts";
import { buildAdviserRecommendation } from "../app/lib/adviser/evidence.ts";
import { NvidiaProviderError, nvidiaChatModels } from "../app/lib/adviser/nvidia.ts";
import { auditRecommendationEvidence } from "../scripts/adviser-evaluation-evidence.mjs";

const dataset = JSON.parse(readFileSync(new URL("../data/colleges.json", import.meta.url), "utf8"));
const releaseId = "sha256:" + "a".repeat(64);
const preferences = { ...emptyAdviserPreferences, fields: ["Engineering"], states: ["CA"], ownership: "Public" };
const engineeringColleges = dataset.colleges.filter((college) => college.state === "CA" && college.ownership === "Public" &&
  college.majors.some((major) => major.name === "Engineering" && (major.bachelorsAvailable || major.associatesAvailable === true)));

test("dry-run is the default and its report contains the fixed sequence without prompts", () => {
  const options = parseConversationArgs([]);
  assert.equal(options.evaluate, false);
  const report = createDryRunReport(dataset, releaseId, options);
  assert.equal(report.status, "dry-run");
  assert.equal(report.liveProviderCalls, 0);
  assert.equal(report.liveDatabaseCalls, 0);
  assert.deepEqual(report.sequence.map((step) => step.id), conversationSequence.map((step) => step.id));
  assert.deepEqual(report.httpCallPlan, { baseCallsIfAllFiveTurnsReachRetrieval: 15, upperBoundWithOneBusyModelFallbackPerChatOperation: 25, enforcedCeiling: 24 });
  const serialized = boundedReportText(report);
  assert.equal(serialized.includes("I want to study engineering in California."), false);
  assert.equal(serialized.includes("Compare the first and second colleges"), false);
});

test("live evaluation requires evaluation mode, the pinned disposable DB, and at most 24 calls", () => {
  assert.throws(() => parseConversationArgs(["--evaluate"]), /mode evaluation/);
  assert.throws(() => parseConversationArgs(["--evaluate", "--mode", "evaluation", "--local-database", "postgres", "--max-http-calls", "24"]), /designated disposable/);
  assert.throws(() => parseConversationArgs(["--evaluate", "--mode", "production", "--local-database", "collegesearch_m8_retrieval_verify", "--max-http-calls", "24"]), /Only evaluation mode/);
  assert.throws(() => parseConversationArgs(["--evaluate", "--mode", "evaluation", "--local-database", "collegesearch_m8_retrieval_verify", "--max-http-calls", "25"]), /1 to 24/);
  const options = parseConversationArgs(["--evaluate", "--mode", "evaluation", "--local-database", "collegesearch_m8_retrieval_verify", "--max-http-calls", "24", "--model", nvidiaChatModels[1]]);
  assert.equal(options.evaluate, true);
  assert.equal(options.maxHttpCalls, 24);
  assert.equal(options.localDatabase, "collegesearch_m8_retrieval_verify");
  assert.equal(options.model, nvidiaChatModels[1]);
});

test("next turn receives the preceding answer preferences and recommendation IDs in order", () => {
  const answer = { preferences, recommendations: [{ unitId: engineeringColleges[0].unitId }, { unitId: engineeringColleges[1].unitId }] };
  assert.deepEqual(conversationCarryState(answer), {
    preferences: JSON.parse(JSON.stringify(preferences)),
    previousRecommendationIds: [engineeringColleges[0].unitId, engineeringColleges[1].unitId],
  });
});

test("audit checks hard constraints and fact/program source metadata against canonical catalog data", () => {
  const first = engineeringColleges[0];
  const second = engineeringColleges[1];
  const answer = {
    preferences,
    recommendations: [first, second].map((college) => buildAdviserRecommendation(college, preferences, dataset)),
  };
  const initial = auditConversationTurn({ step: conversationSequence[0], answer: { ...answer, preferences: { ...emptyAdviserPreferences, fields: ["Engineering"], states: ["CA"] } }, intent: "recommend", dataset, previousPreferences: emptyAdviserPreferences });
  assert.equal(initial.preferenceChecks.passed, true);
  assert.equal(initial.selectedConstraints.passed, true);
  assert.equal(initial.evidenceBindingsPassed, true);
  assert.ok(initial.selected.every((college) => college.evidence.factCount > 0));

  const recommendation = answer.recommendations[0];
  assert.ok(recommendation.fields.some((field) => field.name === "Engineering"));
  const mutations = [
    { update: (fact) => ({ ...fact, display: "$999" }), failure: `fact:${recommendation.facts[0].key}:number` },
    { update: (fact) => ({ ...fact, label: "Wrong label" }), failure: `fact:${recommendation.facts[0].key}:label` },
    { update: (fact) => ({ ...fact, citation: { ...fact.citation, period: "wrong period" } }), failure: `fact:${recommendation.facts[0].key}:citation:period` },
    { update: (fact) => ({ ...fact, citation: { ...fact.citation, cohort: "wrong cohort" } }), failure: `fact:${recommendation.facts[0].key}:citation:cohort` },
    { update: (fact) => ({ ...fact, citation: { ...fact.citation, field: "wrong field" } }), failure: `fact:${recommendation.facts[0].key}:citation:field` },
    { update: (fact) => ({ ...fact, citation: { ...fact.citation, sourceId: "wrong source" } }), failure: `fact:${recommendation.facts[0].key}:citation:sourceId` },
  ];
  for (const mutation of mutations) {
    const alteredRecommendation = { ...recommendation, facts: recommendation.facts.map((fact, index) => index === 0 ? mutation.update(fact) : fact) };
    const failed = auditConversationTurn({ step: conversationSequence[0], answer: { ...answer, preferences: { ...emptyAdviserPreferences, fields: ["Engineering"], states: ["CA"] }, recommendations: [alteredRecommendation, answer.recommendations[1]] }, intent: "recommend", dataset, previousPreferences: emptyAdviserPreferences });
    assert.equal(failed.evidenceBindingsPassed, false);
    assert.ok(failed.selected[0].evidence.failures.includes(mutation.failure));
  }

  const alteredProgram = {
    ...recommendation,
    fields: recommendation.fields.map((field) => field.name === "Engineering" ? { ...field, citation: { ...field.citation, field: "wrong-source-field" } } : field),
  };
  const programFailed = auditConversationTurn({ step: conversationSequence[0], answer: { ...answer, preferences: { ...emptyAdviserPreferences, fields: ["Engineering"], states: ["CA"] }, recommendations: [alteredProgram, answer.recommendations[1]] }, intent: "recommend", dataset, previousPreferences: emptyAdviserPreferences });
  assert.ok(programFailed.selected[0].evidence.failures.includes("program:Engineering:citation:field"));
});

test("optional registered artifact URL is checked when present and missing historical values remain valid", () => {
  const college = engineeringColleges.find((item) => item.majors.some((major) => dataset.release.sources.find((source) => source.id === major.sourceId)?.artifactUrl));
  assert.ok(college);
  const recommendation = buildAdviserRecommendation(college, preferences, dataset);
  const program = recommendation.fields.find((field) => field.name === "Engineering");
  const source = dataset.release.sources.find((item) => item.id === program.citation.sourceId);
  assert.ok(source.artifactUrl);

  const withExpected = { ...recommendation, fields: recommendation.fields.map((field) => field.name === "Engineering" ? { ...field, citation: { ...field.citation, artifactUrl: source.artifactUrl } } : field) };
  assert.equal(auditRecommendationEvidence(withExpected, college, preferences, dataset).passed, true);
  const withWrong = { ...withExpected, fields: withExpected.fields.map((field) => field.name === "Engineering" ? { ...field, citation: { ...field.citation, artifactUrl: "https://example.invalid/wrong" } } : field) };
  const failed = auditRecommendationEvidence(withWrong, college, preferences, dataset);
  assert.ok(failed.failures.includes("program:Engineering:source-record:artifactUrl"));
  const historical = { ...recommendation, fields: recommendation.fields.map((field) => {
    const citation = { ...field.citation };
    delete citation.artifactUrl;
    return { ...field, citation };
  }) };
  assert.equal(auditRecommendationEvidence(historical, college, preferences, dataset).passed, true);
});

test("fact source URLs may use any registered URL, while an unregistered URL fails binding", () => {
  const candidate = dataset.colleges.find((college) => college.unitId === 110635);
  assert.ok(candidate);
  const alternateDataset = JSON.parse(JSON.stringify(dataset));
  const alternateCollege = alternateDataset.colleges.find((college) => college.unitId === candidate.unitId);
  const observation = alternateCollege.observations.admitRate;
  const source = alternateDataset.release.sources.find((item) => item.id === observation.sourceId);
  const alternateUrl = [source.sourcePage, source.artifactUrl, ...(source.sourceUrls ?? [])]
    .find((url) => url && url !== source.sourceUrl);
  assert.ok(alternateUrl);
  observation.sourceUrl = alternateUrl;
  const alternateRecommendation = buildAdviserRecommendation(alternateCollege, preferences, alternateDataset);
  assert.equal(auditRecommendationEvidence(alternateRecommendation, alternateCollege, preferences, alternateDataset).passed, true);

  observation.sourceUrl = "https://example.invalid/unregistered-evidence.html";
  const unregisteredRecommendation = buildAdviserRecommendation(alternateCollege, preferences, alternateDataset);
  const failed = auditRecommendationEvidence(unregisteredRecommendation, alternateCollege, preferences, alternateDataset);
  assert.ok(failed.failures.includes("fact:admitRate:source-record:url"));
});

test("duplicate fact and program evidence rows are rejected", () => {
  const college = engineeringColleges[0];
  const recommendation = buildAdviserRecommendation(college, preferences, dataset);
  const duplicate = {
    ...recommendation,
    facts: [...recommendation.facts, recommendation.facts[0]],
    fields: [...recommendation.fields, recommendation.fields[0]],
  };
  const failed = auditRecommendationEvidence(duplicate, college, preferences, dataset);
  assert.ok(failed.failures.includes(`fact:${recommendation.facts[0].key}:duplicate`));
  assert.ok(failed.failures.includes("program:Engineering:duplicate"));
});

test("comparison audit measures coverage of the first two actual prior IDs without assuming rank order", () => {
  const ids = [engineeringColleges[0].unitId, engineeringColleges[1].unitId];
  const answer = {
    preferences: { ...preferences, size: null },
    recommendations: [engineeringColleges[1], engineeringColleges[0]].map((college) => buildAdviserRecommendation(college, { ...preferences, size: null }, dataset)),
  };
  const result = auditConversationTurn({ step: conversationSequence[4], answer, intent: "compare", dataset,
    previousPreferences: { ...preferences, size: null }, expectedCompareIds: ids });
  assert.equal(result.preferenceChecks.passed, true);
  assert.equal(result.compareIdentityCoverage.passed, true);
  assert.deepEqual(result.compareIdentityCoverage.missingIds, []);

  const partial = auditConversationTurn({ step: conversationSequence[4], answer: { ...answer, recommendations: [answer.recommendations[0]] }, intent: "compare", dataset,
    previousPreferences: { ...preferences, size: null }, expectedCompareIds: ids });
  assert.equal(partial.compareIdentityCoverage.passed, false);
  assert.deepEqual(partial.compareIdentityCoverage.missingIds, [ids[0]]);
});

test("follow-up expectation follows nextQuestion rules and recommendation minimums include comparison pairs", () => {
  const current = { ...preferences, size: null };
  assert.equal(expectedAdviserQuestionKey(current, "budget"), "budget");
  assert.equal(expectedAdviserQuestionKey(current, "size"), "size");
  assert.equal(expectedAdviserQuestionKey({ ...current, size: "small" }, "size"), "budget");
  assert.equal(expectedAdviserQuestionKey({ ...current, annualBudget: 20_000, budgetBasis: null }, "budget"), "budget-basis");
  assert.equal(expectedAdviserQuestionKey({ ...current, fields: [], states: [], ownership: "Public" }, "location", true), "field");

  const candidates = engineeringColleges.slice(0, 2);
  const recommendations = candidates.map((college) => buildAdviserRecommendation(college, current, dataset));
  const answer = { preferences: current, question: adviserQuestions.size, recommendations };
  const passed = auditConversationTurn({ step: conversationSequence[0], answer, intent: "recommend", dataset,
    previousPreferences: emptyAdviserPreferences, proposedQuestion: "size" });
  assert.equal(passed.recommendationCount.passed, true);
  assert.equal(passed.followUp.expectedKey, "size");
  assert.equal(passed.followUp.passed, true);

  const empty = auditConversationTurn({ step: conversationSequence[0], answer: { ...answer, recommendations: [] }, intent: "recommend", dataset,
    previousPreferences: emptyAdviserPreferences, proposedQuestion: "size" });
  assert.equal(empty.recommendationCount.minimum, 1);
  assert.equal(empty.recommendationCount.passed, false);

  const comparison = auditConversationTurn({ step: conversationSequence[4], answer: { ...answer, recommendations: recommendations.slice(0, 1) }, intent: "compare", dataset,
    previousPreferences: current, proposedQuestion: "size", expectedCompareIds: candidates.map((college) => college.unitId) });
  assert.equal(comparison.recommendationCount.minimum, 2);
  assert.equal(comparison.recommendationCount.passed, false);
});

test("provider fetch is allowlisted and refuses a request beyond its hard ceiling", async () => {
  let calls = 0;
  let requestOptions;
  const bounded = createBoundedProviderFetch(1, async (_input, init) => { calls += 1; requestOptions = init; return "ok"; });
  assert.equal(await bounded.fetch("https://integrate.api.nvidia.com/v1/chat/completions"), "ok");
  assert.equal(requestOptions.redirect, "manual");
  await assert.rejects(bounded.fetch("https://integrate.api.nvidia.com/v1/embeddings"), (error) => error instanceof NvidiaProviderError && error.code === "request_budget_exhausted");
  await assert.rejects(bounded.fetch("https://example.com/v1/chat/completions"), /not allowlisted/);
  assert.deepEqual(bounded.counts, { total: 1, chat: 1, queryEmbedding: 0 });
  assert.equal(calls, 1);
});

test("provider fetch refuses redirects without following them", async () => {
  let calls = 0;
  let requestOptions;
  const bounded = createBoundedProviderFetch(3, async (_input, init) => {
    calls += 1;
    requestOptions = init;
    return { status: 302, headers: { get: () => "https://example.com/redirect" } };
  });
  await assert.rejects(bounded.fetch("https://integrate.api.nvidia.com/v1/chat/completions"),
    (error) => error instanceof NvidiaProviderError && error.code === "http_error" && error.httpStatus === 302);
  assert.equal(requestOptions.redirect, "manual");
  assert.equal(calls, 1);
  assert.equal(bounded.counts.total, 1);
});

test("report serialization has a fixed size limit", () => {
  assert.throws(() => boundedReportText({ payload: "x".repeat(100) }, 50), /size limit/);
});

test("busy super-model has one allowlisted Lightning fallback and the summary counts audit failures", () => {
  assert.deepEqual(conversationChatPolicy("nvidia/nemotron-3-super-120b-a12b"), {
    chatFallbackModels: ["nvidia/nemotron-3.5-lightning-30b-a3b"], maxProviderAttempts: 2,
  });
  assert.deepEqual(conversationChatPolicy(nvidiaChatModels[0]), { chatFallbackModels: [], maxProviderAttempts: 2 });
  const summary = summarizeConversationReport({ sequence: [{ status: "completed", audits: {
    preferenceChecks: { checks: { intent: false }, retained: { fields: true } },
    recommendationCount: { minimum: 1, actual: 0, passed: false },
    followUp: { expectedKey: "budget", passed: false },
    selectedConstraints: { checkedRecommendations: 1, violations: ["state:1:CA"] },
    compareIdentityCoverage: { expectedIds: [1, 2], missingIds: [2] },
    selected: [{ evidence: { factCount: 2, factBindingsVerified: 1, programFieldCount: 1, programBindingsVerified: 0, failures: ["fact:x:number"] } }],
  } }, { status: "skipped" }] });
  assert.equal(summary.preferenceFailures, 1);
  assert.equal(summary.minimumRecommendationFailures, 1);
  assert.equal(summary.recommendationCountChecks, 1);
  assert.equal(summary.followUpFailures, 1);
  assert.equal(summary.followUpChecks, 1);
  assert.equal(conversationStatusFromSummary(summary), "failed-checks");
  assert.equal(summary.retentionFailures, 0);
  assert.equal(summary.selectedConstraintFailures, 1);
  assert.equal(summary.comparisonIdentityFailures, 1);
  assert.equal(summary.factsChecked, 2);
  assert.equal(summary.factBindingsVerified, 1);
  assert.equal(summary.evidenceBindingFailures, 1);
  assert.equal(summary.skippedTurns, 1);
});

test("only dry-run and fully completed evaluations exit successfully", () => {
  assert.equal(conversationEvaluationExitCode("dry-run"), 0);
  assert.equal(conversationEvaluationExitCode("completed"), 0);
  for (const status of ["completed-with-skips", "failed-checks", "partial", "preflight-failed", "running", undefined]) {
    assert.equal(conversationEvaluationExitCode(status), 1);
  }
  assert.equal(conversationStatusFromSummary({ ...summarizeConversationReport({ sequence: [{ status: "skipped" }] }), minimumRecommendationFailures: 0 }), "completed-with-skips");
});
