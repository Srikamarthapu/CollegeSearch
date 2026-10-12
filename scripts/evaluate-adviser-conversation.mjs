#!/usr/bin/env node
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runAdviserTurn } from "../app/lib/adviser/engine.ts";
import { adviserQuestions, emptyAdviserPreferences, parseAdviserInterpretation } from "../app/lib/adviser/contracts.ts";
import { usableAdviserObservation } from "../app/lib/adviser/evidence.ts";
import { createKnowledgeRetriever } from "../app/lib/adviser/retrieval.ts";
import { createNvidiaProvider, nvidiaChatModels, nvidiaConfigFromEnv, NvidiaProviderError } from "../app/lib/adviser/nvidia.ts";
import { auditRecommendationEvidence } from "./adviser-evaluation-evidence.mjs";
import { createLocalPsqlRpc, verifyRuntimeRelease } from "./evaluate-nvidia-adviser.mjs";

const localDatabase = "collegesearch_m8_retrieval_verify";
const maxAllowedHttpCalls = 24;
const maxReportBytes = 256 * 1024;
const timeoutDefaultMs = 110_000;
const budgetKeys = ["fields", "states", "residencyState", "annualBudget", "budgetBasis", "size", "ownership"];
const busyModelFallbacks = { "nvidia/nemotron-3-super-120b-a12b": "nvidia/nemotron-3.5-lightning-30b-a3b" };

/** Synthetic, predeclared conversation. Messages are never copied to the report. */
export const conversationSequence = [
  { id: "engineering-california", message: "I want to study engineering in California.", expectedIntent: "recommend", minimumRecommendations: 1, retain: [], preferenceChecks: { fields: ["Engineering"], states: ["CA"] }, selectedConstraints: { fields: ["Engineering"], states: ["CA"] } },
  { id: "public-only", message: "Please limit the colleges to public schools.", expectedIntent: "recommend", minimumRecommendations: 1, retain: ["fields", "states"], preferenceChecks: { fields: ["Engineering"], states: ["CA"], ownership: "Public" }, selectedConstraints: { fields: ["Engineering"], states: ["CA"], ownership: "Public" } },
  { id: "small-under-5000", message: "I prefer a small campus, with fewer than 5,000 undergraduates.", expectedIntent: "recommend", minimumRecommendations: 1, retain: ["fields", "states", "ownership"], preferenceChecks: { fields: ["Engineering"], states: ["CA"], ownership: "Public", size: "small" }, selectedConstraints: { fields: ["Engineering"], states: ["CA"], ownership: "Public", undergraduateEnrollmentBelow: 5_000 } },
  { id: "broaden-to-any-size", message: "Actually, broaden that to any campus size while keeping my other preferences.", expectedIntent: "recommend", minimumRecommendations: 1, retain: ["fields", "states", "ownership"], preferenceChecks: { fields: ["Engineering"], states: ["CA"], ownership: "Public", size: null }, selectedConstraints: { fields: ["Engineering"], states: ["CA"], ownership: "Public" } },
  { id: "compare-first-two", message: "Compare the first and second colleges you just recommended.", expectedIntent: "compare", minimumRecommendations: 2, condition: "at-least-two-prior-recommendations", retain: budgetKeys, preferenceChecks: { fields: ["Engineering"], states: ["CA"], ownership: "Public", size: null }, selectedConstraints: { fields: ["Engineering"], states: ["CA"], ownership: "Public" } },
];

function fail(message) { throw new Error(message); }

export function parseConversationArgs(args) {
  const options = { evaluate: false, mode: null, localDatabase: null, maxHttpCalls: null, model: nvidiaChatModels[0], turnTimeoutMs: timeoutDefaultMs };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--evaluate") options.evaluate = true;
    else if (["--mode", "--local-database", "--max-http-calls", "--model", "--turn-timeout-ms"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail("Evaluation option requires a value.");
      index += 1;
      if (arg === "--mode") {
        if (value !== "evaluation") fail("Only evaluation mode is allowed.");
        options.mode = value;
      } else if (arg === "--local-database") {
        if (value !== localDatabase) fail("Only the designated disposable local database is allowed.");
        options.localDatabase = value;
      } else if (arg === "--max-http-calls") {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maxAllowedHttpCalls) fail("The HTTP ceiling must be an integer from 1 to 24.");
        options.maxHttpCalls = Number(value);
      } else if (arg === "--model") {
        if (!nvidiaChatModels.includes(value)) fail("The model must be an allowlisted NVIDIA chat model.");
        options.model = value;
      } else {
        if (!/^\d+$/.test(value) || Number(value) < 10_000 || Number(value) > timeoutDefaultMs) fail("The turn timeout must be an integer from 10000 to 110000.");
        options.turnTimeoutMs = Number(value);
      }
    } else if (arg === "--help" || arg === "-h") options.help = true;
    else fail("Unknown evaluation option.");
  }
  if (options.evaluate && (options.mode !== "evaluation" || options.localDatabase !== localDatabase || options.maxHttpCalls === null)) {
    fail("Live evaluation requires --mode evaluation, the designated --local-database, and --max-http-calls no greater than 24.");
  }
  return options;
}

export function conversationCarryState(answer) {
  if (!answer || !answer.preferences || !Array.isArray(answer.recommendations)) fail("Cannot carry invalid adviser answer state.");
  return {
    preferences: JSON.parse(JSON.stringify(answer.preferences)),
    previousRecommendationIds: answer.recommendations.map((recommendation) => recommendation.unitId),
  };
}

function sameValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

/** Mirrors the documented engine nextQuestion priority, using inputs before the answer is built. */
export function expectedAdviserQuestionKey(preferences, proposed, hasNamedColleges = false) {
  if (preferences.annualBudget !== null && !preferences.budgetBasis) return "budget-basis";
  const needsResidency = preferences.annualBudget !== null && preferences.budgetBasis !== "total-cost" && !preferences.residencyState && preferences.ownership !== "Private nonprofit";
  if (needsResidency) return "residency";
  const unanswered = {
    field: !preferences.fields.length,
    location: !preferences.states.length && !hasNamedColleges,
    budget: preferences.annualBudget === null,
    residency: needsResidency,
    size: !preferences.size,
    "budget-basis": preferences.annualBudget !== null && !preferences.budgetBasis,
    none: false,
  };
  if (unanswered[proposed]) return proposed;
  if (!preferences.fields.length) return "field";
  if (!preferences.states.length && !hasNamedColleges) return "location";
  if (preferences.annualBudget === null) return "budget";
  return "none";
}

function preferenceAudit(preferences, previousPreferences, step, intent) {
  const checks = {};
  for (const field of step.preferenceChecks.fields ?? []) checks[`field:${field}`] = preferences.fields.includes(field);
  for (const state of step.preferenceChecks.states ?? []) checks[`state:${state}`] = preferences.states.includes(state);
  if ("ownership" in step.preferenceChecks) checks.ownership = preferences.ownership === step.preferenceChecks.ownership;
  if ("size" in step.preferenceChecks) checks.size = preferences.size === step.preferenceChecks.size;
  if (step.preferenceChecks.sizeNonNull) checks.sizeNonNull = preferences.size !== null;
  checks.intent = intent === step.expectedIntent;
  const retained = Object.fromEntries(step.retain.map((key) => [key, sameValue(preferences[key], previousPreferences[key])]));
  return { checks, retained, passed: Object.values(checks).every((value) => value === true) && Object.values(retained).every(Boolean) };
}

export function auditConversationTurn({ step, answer, intent, dataset, previousPreferences, expectedCompareIds = [], proposedQuestion = "budget", hasNamedColleges = expectedCompareIds.length > 0 }) {
  const preferences = answer.preferences;
  const preferenceChecks = preferenceAudit(preferences, previousPreferences, step, intent);
  const minimum = step.minimumRecommendations ?? 1;
  const recommendationCount = { minimum, actual: answer.recommendations.length, passed: answer.recommendations.length >= minimum };
  const expectedQuestionKey = expectedAdviserQuestionKey(preferences, proposedQuestion, hasNamedColleges);
  const followUp = { expectedKey: expectedQuestionKey, passed: answer.question === adviserQuestions[expectedQuestionKey] };
  const violations = [];
  const selected = [];
  for (const recommendation of answer.recommendations) {
    const college = dataset.colleges.find((item) => item.unitId === recommendation.unitId);
    if (!college) { violations.push(`unknown-college:${recommendation.unitId}`); continue; }
    if (recommendation.name !== college.name || recommendation.slug !== college.slug) violations.push(`identity-mismatch:${college.unitId}`);
    for (const field of step.selectedConstraints.fields ?? []) {
      if (!college.majors.some((major) => major.name === field && (major.bachelorsAvailable || major.associatesAvailable === true))) violations.push(`field:${college.unitId}:${field}`);
    }
    for (const state of step.selectedConstraints.states ?? []) if (college.state !== state) violations.push(`state:${college.unitId}:${state}`);
    if (step.selectedConstraints.ownership && college.ownership !== step.selectedConstraints.ownership) violations.push(`ownership:${college.unitId}`);
    if (step.selectedConstraints.undergraduateEnrollmentBelow !== undefined) {
      const enrollment = college.observations.undergraduateEnrollment;
      if (!usableAdviserObservation(enrollment) || enrollment.value >= step.selectedConstraints.undergraduateEnrollmentBelow) violations.push(`undergraduate-enrollment:${college.unitId}`);
    }
    const evidence = auditRecommendationEvidence(recommendation, college, preferences, dataset);
    selected.push({ unitId: college.unitId, name: college.name, state: college.state, ownership: college.ownership,
      undergraduateEnrollment: usableAdviserObservation(college.observations.undergraduateEnrollment) ? college.observations.undergraduateEnrollment.value : null,
      evidence });
  }
  const selectedConstraints = {
    checkedRecommendations: selected.length,
    violations,
    passed: selected.length ? violations.length === 0 : null,
  };
  const compareIdentityCoverage = expectedCompareIds.length ? {
    expectedIds: [...expectedCompareIds],
    selectedIds: answer.recommendations.map((recommendation) => recommendation.unitId),
    missingIds: expectedCompareIds.filter((id) => !answer.recommendations.some((recommendation) => recommendation.unitId === id)),
    passed: expectedCompareIds.every((id) => answer.recommendations.some((recommendation) => recommendation.unitId === id)),
  } : null;
  return {
    preferenceChecks,
    recommendationCount,
    followUp,
    selectedConstraints,
    compareIdentityCoverage,
    selected,
    evidenceBindingsPassed: selected.every((item) => item.evidence.passed),
  };
}

export function createBoundedProviderFetch(maxHttpCalls, fetchImpl = fetch) {
  if (!Number.isSafeInteger(maxHttpCalls) || maxHttpCalls < 1 || maxHttpCalls > maxAllowedHttpCalls) fail("Provider HTTP ceiling is outside the 1 to 24 bound.");
  const counts = { total: 0, chat: 0, queryEmbedding: 0 };
  const boundedFetch = async (input, init) => {
    let target;
    try { target = new URL(String(input)); } catch { throw new NvidiaProviderError("invalid_config", "Evaluation provider target is invalid."); }
    if (target.protocol !== "https:" || target.hostname !== "integrate.api.nvidia.com" || !target.pathname.startsWith("/v1/")) {
      throw new NvidiaProviderError("invalid_config", "Evaluation provider target is not allowlisted.");
    }
    if (counts.total >= maxHttpCalls) throw new NvidiaProviderError("request_budget_exhausted", "Conversation evaluation reached its HTTP ceiling.");
    counts.total += 1;
    if (target.pathname.endsWith("/embeddings")) counts.queryEmbedding += 1;
    else counts.chat += 1;
    const response = await fetchImpl(input, { ...init, redirect: "manual" });
    if (Number.isInteger(response?.status) && response.status >= 300 && response.status < 400) {
      throw new NvidiaProviderError("http_error", "Evaluation provider redirect was refused.", { httpStatus: response.status });
    }
    return response;
  };
  return { fetch: boundedFetch, counts };
}

export function createDryRunReport(dataset, releaseId, options = {}) {
  return {
    schemaVersion: 1,
    status: "dry-run",
    sequence: conversationSequence.map(({ id, condition }) => ({ id, ...(condition ? { condition } : {}) })),
    retrievalMode: "runtime",
    localDatabase: localDatabase,
    releaseId,
    institutionCount: dataset.colleges.length,
    maxHttpCalls: options.maxHttpCalls ?? null,
    httpCallPlan: {
      baseCallsIfAllFiveTurnsReachRetrieval: conversationSequence.length * 3,
      upperBoundWithOneBusyModelFallbackPerChatOperation: conversationSequence.length * 5,
      enforcedCeiling: options.maxHttpCalls ?? maxAllowedHttpCalls,
    },
    liveProviderCalls: 0,
    liveDatabaseCalls: 0,
    limitations: ["Dry-run makes no provider or database calls.", "This evaluation does not include human review or hosted route/browser UI verification."],
  };
}

export function summarizeConversationReport(report) {
  const turns = report.sequence ?? [];
  const completed = turns.filter((turn) => turn.status === "completed");
  const skipped = turns.filter((turn) => turn.status === "skipped");
  const failed = turns.filter((turn) => turn.status === "failed");
  let preferenceChecks = 0, preferenceFailures = 0, retentionChecks = 0, retentionFailures = 0;
  let recommendationsChecked = 0, selectedConstraintFailures = 0, noRecommendationTurns = 0;
  let recommendationCountChecks = 0, minimumRecommendationFailures = 0;
  let followUpChecks = 0, followUpFailures = 0;
  let comparisonChecks = 0, comparisonFailures = 0;
  let factsChecked = 0, factsVerified = 0, programFieldsChecked = 0, programFieldsVerified = 0, evidenceBindingFailures = 0;
  for (const turn of completed) {
    const audits = turn.audits;
    if (!audits) continue;
    for (const passed of Object.values(audits.preferenceChecks.checks)) { preferenceChecks += 1; if (!passed) preferenceFailures += 1; }
    for (const passed of Object.values(audits.preferenceChecks.retained)) { retentionChecks += 1; if (!passed) retentionFailures += 1; }
    if (audits.recommendationCount) { recommendationCountChecks += 1; if (!audits.recommendationCount.passed) minimumRecommendationFailures += 1; }
    if (audits.followUp) { followUpChecks += 1; if (!audits.followUp.passed) followUpFailures += 1; }
    recommendationsChecked += audits.selectedConstraints.checkedRecommendations;
    if (audits.selectedConstraints.checkedRecommendations === 0) noRecommendationTurns += 1;
    selectedConstraintFailures += audits.selectedConstraints.violations.length;
    if (audits.compareIdentityCoverage) {
      comparisonChecks += audits.compareIdentityCoverage.expectedIds.length;
      comparisonFailures += audits.compareIdentityCoverage.missingIds.length;
    }
    for (const selected of audits.selected) {
      factsChecked += selected.evidence.factCount;
      factsVerified += selected.evidence.factBindingsVerified;
      programFieldsChecked += selected.evidence.programFieldCount;
      programFieldsVerified += selected.evidence.programBindingsVerified;
      evidenceBindingFailures += selected.evidence.failures.length;
    }
  }
  return {
    completedTurns: completed.length,
    skippedTurns: skipped.length,
    failedTurns: failed.length,
    preferenceChecks,
    preferenceFailures,
    retainedPreferenceChecks: retentionChecks,
    retentionFailures,
    recommendationsChecked,
    turnsWithNoRecommendations: noRecommendationTurns,
    recommendationCountChecks,
    minimumRecommendationFailures,
    followUpChecks,
    followUpFailures,
    selectedConstraintFailures,
    comparisonIdentityChecks: comparisonChecks,
    comparisonIdentityFailures: comparisonFailures,
    factsChecked,
    factBindingsVerified: factsVerified,
    programFieldsChecked,
    programBindingsVerified: programFieldsVerified,
    evidenceBindingFailures,
  };
}

export function conversationStatusFromSummary(summary) {
  const failedChecks = summary.preferenceFailures + summary.retentionFailures + summary.minimumRecommendationFailures + summary.followUpFailures +
    summary.selectedConstraintFailures + summary.comparisonIdentityFailures + summary.evidenceBindingFailures;
  return failedChecks ? "failed-checks" : summary.skippedTurns ? "completed-with-skips" : "completed";
}

export function conversationEvaluationExitCode(status) {
  return status === "dry-run" || status === "completed" ? 0 : 1;
}

export function conversationChatPolicy(model) {
  return { chatFallbackModels: busyModelFallbacks[model] ? [busyModelFallbacks[model]] : [], maxProviderAttempts: 2 };
}

export function boundedReportText(report, limit = maxReportBytes) {
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(text, "utf8") > limit) fail("Evaluation report exceeds its size limit.");
  return text;
}

async function writeReport(path, report) {
  const content = boundedReportText(report);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

function runtimeErrorCode(error) {
  return error instanceof NvidiaProviderError ? error.code : "adviser_or_runtime_error";
}

function reportPath() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  return resolve(`work/adviser-conversation-evaluation-${stamp}.json`);
}

async function main(args = process.argv.slice(2)) {
  const options = parseConversationArgs(args);
  if (options.help) {
    process.stdout.write("Usage: node scripts/evaluate-adviser-conversation.mjs [--evaluate --mode evaluation --local-database collegesearch_m8_retrieval_verify --max-http-calls 1..24] [--model <allowlisted-id>] [--turn-timeout-ms 10000..110000]\n\nDry-run is the default and makes no provider or database calls. Live mode requires explicit evaluation mode, the designated disposable local database, and a hard HTTP ceiling. Only synthetic prompts and read-only local RPCs are used.\n");
    return;
  }
  const destination = reportPath();
  const dataset = JSON.parse(await readFile(resolve("data/colleges.json"), "utf8"));
  const releaseId = JSON.parse(await readFile(resolve("data/college-knowledge-release.json"), "utf8")).releaseId;
  if (!options.evaluate) {
    const report = createDryRunReport(dataset, releaseId, options);
    await writeReport(destination, report);
    process.stdout.write(`${JSON.stringify({ status: report.status, reportPath: destination, steps: report.sequence.map((step) => step.id), liveProviderCalls: 0, liveDatabaseCalls: 0, maxHttpCalls: report.maxHttpCalls })}\n`);
    process.exitCode = conversationEvaluationExitCode(report.status);
    return;
  }

  try { process.loadEnvFile(resolve(".env.local")); } catch { /* Missing local env file leaves evaluation configuration absent. */ }
  const environmentConfig = nvidiaConfigFromEnv();
  if (environmentConfig.mode !== "evaluation") fail("NVIDIA_MODE must be evaluation.");
  if (!environmentConfig.apiKey?.trim()) fail("NVIDIA_API_KEY is required for an explicitly requested evaluation.");
  const chatPolicy = conversationChatPolicy(options.model);
  const config = { ...environmentConfig, mode: "evaluation", chatModel: options.model, ...chatPolicy, retryDelayMs: 0,
    maxOutputTokens: Math.min(environmentConfig.maxOutputTokens, 1_024) };
  const report = {
    schemaVersion: 1,
    status: "running",
    evaluatedAt: new Date().toISOString(),
    mode: "evaluation",
    model: options.model,
    localDatabase: options.localDatabase,
    httpCeiling: options.maxHttpCalls,
    chatFallbackModels: chatPolicy.chatFallbackModels,
    maximumProviderAttemptsPerChatOperation: chatPolicy.maxProviderAttempts,
    releaseId,
    sequence: [],
    counts: { providerHttp: 0, chatHttp: 0, queryEmbeddingHttp: 0, databaseRpc: 0 },
    limitations: ["Synthetic prompts and the designated local read-only database are used.", "Results are not human review and do not verify the hosted route, saved UI actions, or browser rendering."],
  };

  let databaseRpcCalls = 0;
  const localRpc = createLocalPsqlRpc({ database: options.localDatabase });
  const rpc = async (name, parameters, signal) => { databaseRpcCalls += 1; return localRpc(name, parameters, signal); };
  try {
    report.pinnedRelease = await verifyRuntimeRelease(rpc, dataset, releaseId, config);
    const bounded = createBoundedProviderFetch(options.maxHttpCalls);
    const provider = createNvidiaProvider(config, bounded.fetch);
    const embeddingProvider = createNvidiaProvider({ ...config, chatFallbackModels: [], maxProviderAttempts: 1 }, bounded.fetch);
    const retrieve = createKnowledgeRetriever(dataset, releaseId, rpc, {
      model: config.embeddingModel,
      modelVersion: config.embeddingModelVersion,
      query: async (text, signal) => {
        const result = await embeddingProvider.embed(text, "query", signal);
        return { embedding: result.embedding, model: result.model, modelVersion: result.modelVersion };
      },
    });

    let previousPreferences = { ...emptyAdviserPreferences };
    let previousRecommendationIds = [];
    for (const step of conversationSequence) {
      if (step.condition === "at-least-two-prior-recommendations" && previousRecommendationIds.length < 2) {
        report.sequence.push({ id: step.id, status: "skipped", reasonCode: "fewer_than_two_actual_prior_recommendations" });
        continue;
      }
      const preferencesBefore = JSON.parse(JSON.stringify(previousPreferences));
      const idsBefore = [...previousRecommendationIds];
      const callsBefore = { ...bounded.counts };
      const dbBefore = databaseRpcCalls;
      let validatedInterpretation = null;
      try {
        const answer = await runAdviserTurn(step.message, previousPreferences, {
          dataset,
          previousRecommendationIds,
          generate: async (system, input, signal) => {
            const value = (await provider.generateWithUsage(system, input, signal)).value;
            if (system.startsWith("You interpret college research preferences.")) {
              validatedInterpretation = parseAdviserInterpretation(value, new Set(idsBefore));
            }
            return value;
          },
          retrieve,
        }, AbortSignal.timeout(options.turnTimeoutMs));
        const expectedCompareIds = step.id === "compare-first-two" ? idsBefore.slice(0, 2) : [];
        const audited = auditConversationTurn({ step, answer, intent: validatedInterpretation?.intent, dataset, previousPreferences, expectedCompareIds,
          proposedQuestion: validatedInterpretation?.question ?? "none", hasNamedColleges: step.id === "compare-first-two" });
        const turn = {
          id: step.id,
          status: "completed",
          inputState: { preferences: preferencesBefore, previousRecommendationIds: idsBefore },
          outputState: { intent: validatedInterpretation?.intent, preferences: answer.preferences, questionPresent: Boolean(answer.question), retrievalMode: answer.retrievalMode },
          validatedAnswer: answer,
          providerHttp: bounded.counts.total - callsBefore.total,
          chatHttp: bounded.counts.chat - callsBefore.chat,
          queryEmbeddingHttp: bounded.counts.queryEmbedding - callsBefore.queryEmbedding,
          databaseRpc: databaseRpcCalls - dbBefore,
          recommendationCount: answer.recommendations.length,
          selectedUnitIds: answer.recommendations.map((recommendation) => recommendation.unitId),
          audits: audited,
        };
        report.sequence.push(turn);
        const next = conversationCarryState(answer);
        previousPreferences = next.preferences;
        previousRecommendationIds = next.previousRecommendationIds;
      } catch (error) {
        report.sequence.push({ id: step.id, status: "failed", errorCode: runtimeErrorCode(error), providerHttp: bounded.counts.total - callsBefore.total,
          chatHttp: bounded.counts.chat - callsBefore.chat, queryEmbeddingHttp: bounded.counts.queryEmbedding - callsBefore.queryEmbedding,
          databaseRpc: databaseRpcCalls - dbBefore, inputState: { preferences: preferencesBefore, previousRecommendationIds: idsBefore } });
        report.status = "partial";
        break;
      }
    }
    report.counts = { providerHttp: bounded.counts.total, chatHttp: bounded.counts.chat, queryEmbeddingHttp: bounded.counts.queryEmbedding, databaseRpc: databaseRpcCalls };
    report.summary = summarizeConversationReport(report);
    if (report.status === "running") {
      report.status = conversationStatusFromSummary(report.summary);
    }
  } catch (error) {
    report.status = "preflight-failed";
    report.errorCode = runtimeErrorCode(error);
    report.counts.databaseRpc = databaseRpcCalls;
    report.summary = summarizeConversationReport(report);
  }
  await writeReport(destination, report);
  process.stdout.write(`${JSON.stringify({ status: report.status, reportPath: destination, stepsCompleted: report.sequence.filter((turn) => turn.status === "completed").length,
    stepsSkipped: report.sequence.filter((turn) => turn.status === "skipped").length, liveProviderCalls: report.counts.providerHttp,
    liveDatabaseCalls: report.counts.databaseRpc, maxHttpCalls: report.httpCeiling })}\n`);
  process.exitCode = conversationEvaluationExitCode(report.status);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch(() => {
    process.stderr.write("Conversation evaluation could not start. Check the explicit evaluation configuration and local runtime.\n");
    process.exitCode = 1;
  });
}
