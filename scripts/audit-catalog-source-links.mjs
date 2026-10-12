#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { atomicWriteFile } from "./lib/atomic-write.mjs";
import { validateInstitutionOverlays } from "./lib/institution-overlays.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultDataset = "data/colleges.json";
const defaultOverlays = "data/institution-overlays.json";
const defaultTuitionData = "data/college-tuition.json";
const defaultCostOverrides = "data/college-cost-overrides.json";
const maximumRequests = 120;
const maximumRedirects = 5;
const requestTimeoutMilliseconds = 15_000;
const maximumHashedResponseBytes = 5 * 1024 * 1024;
const maximumXlsxEntries = 2_048;
const maximumXlsxUncompressedBytes = 128 * 1024 * 1024;
const concurrency = 3;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function parseArguments(argv) {
  const options = {
    dataset: defaultDataset,
    overlays: defaultOverlays,
    tuitionData: defaultTuitionData,
    costOverrides: defaultCostOverrides,
    report: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const key = argument === "--dataset"
      ? "dataset"
      : argument === "--overlays"
        ? "overlays"
        : argument === "--tuition-data"
          ? "tuitionData"
          : argument === "--cost-overrides"
            ? "costOverrides"
        : argument === "--report"
          ? "report"
          : null;
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Expected a path after ${argument}.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function assertHttpsUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} must be a credential-free HTTPS URL.`);
  }
  return url;
}

function collectSourceLinks(dataset, tuitionDataset, costOverrides) {
  const usedSourceIds = new Set();
  const ucAccountabilitySource = (dataset.release?.sources ?? [])
    .find((source) => source.id === "uc-accountability-2026-chapter-2");
  for (const college of dataset.colleges ?? []) {
    for (const observation of [
      ...Object.values(college.observations ?? {}),
      ...Object.values(college.alternateObservations ?? {}),
      ...(college.majors ?? []),
    ]) {
      if (typeof observation?.sourceId === "string") usedSourceIds.add(observation.sourceId);
    }
  }

  const tuitionSource = tuitionDataset?.release;
  if (typeof tuitionSource?.id === "string") usedSourceIds.add(tuitionSource.id);
  const costSourceById = new Map();
  for (const college of costOverrides?.colleges ?? []) {
    for (const observation of Object.values(college.costs ?? {})) {
      if (typeof observation?.sourceId === "string") usedSourceIds.add(observation.sourceId);
      if (typeof observation?.sourceId !== "string" || typeof observation?.sourceUrl !== "string") continue;
      const source = costSourceById.get(observation.sourceId) ?? {
        id: observation.sourceId,
        sourceUrls: [],
        sourceHashes: [],
      };
      if (!source.sourceUrls.includes(observation.sourceUrl)) source.sourceUrls.push(observation.sourceUrl);
      if (typeof college.sourceSha256 === "string" &&
        !source.sourceHashes.some((entry) => entry.sourceUrl === observation.sourceUrl)) {
        source.sourceHashes.push({ sourceUrl: observation.sourceUrl, sha256: college.sourceSha256 });
      }
      costSourceById.set(observation.sourceId, source);
    }
    const budgetSourceId = Object.values(college.costs ?? {}).find((observation) => observation?.sourceId)?.sourceId;
    if (typeof budgetSourceId === "string" && typeof college.budget?.sourceUrl === "string") {
      const source = costSourceById.get(budgetSourceId) ?? {
        id: budgetSourceId,
        sourceUrls: [],
        sourceHashes: [],
      };
      if (!source.sourceUrls.includes(college.budget.sourceUrl)) source.sourceUrls.push(college.budget.sourceUrl);
      if (typeof college.budget.sourceSha256 === "string" &&
        !source.sourceHashes.some((entry) => entry.sourceUrl === college.budget.sourceUrl)) {
        source.sourceHashes.push({ sourceUrl: college.budget.sourceUrl, sha256: college.budget.sourceSha256 });
      }
      costSourceById.set(budgetSourceId, source);
    }
  }

  const sources = [
    ...(dataset.release?.sources ?? []).filter((source) => usedSourceIds.has(source.id)),
    ...(tuitionSource ? [{
      id: tuitionSource.id,
      sourcePage: tuitionSource.sourcePage,
      sourceUrl: tuitionSource.sourceUrl,
      sourceUrls: tuitionSource.sourceArchiveUrl ? [tuitionSource.sourceArchiveUrl] : [],
    }] : []),
    ...costSourceById.values(),
  ];
  const links = new Map();
  for (const source of sources) {
    const references = [
      ["sourcePage", source.sourcePage],
      ["sourceUrl", source.sourceUrl],
      ...(source.sourceUrls ?? []).map((url) => ["sourceUrls", url]),
      ...(source.sourceHashes ?? []).map((entry) => ["sourceHashes", entry?.sourceUrl]),
      ["artifactUrl", source.artifactUrl],
    ];
    for (const [kind, rawUrl] of references) {
      if (typeof rawUrl !== "string" || !rawUrl.trim()) continue;
      const url = rawUrl.trim();
      const entry = links.get(url) ?? {
        url,
        sourceIds: new Set(),
        kinds: new Set(),
        expectedHashes: new Map(),
        ucAdmissionsFacts: [],
        ucAccountabilityFacts: [],
      };
      entry.sourceIds.add(source.id);
      entry.kinds.add(kind);
      if (kind === "sourceHashes") {
        const expectedSha256 = source.sourceHashes.find((item) => item?.sourceUrl === url)?.sha256;
        if (typeof expectedSha256 === "string") {
          const hashSources = entry.expectedHashes.get(expectedSha256) ?? new Set();
          hashSources.add(source.id);
          entry.expectedHashes.set(expectedSha256, hashSources);
        }
      }
      if (kind === "sourceUrl" && source.workbookSha256) {
        const hashSources = entry.expectedHashes.get(source.workbookSha256) ?? new Set();
        hashSources.add(source.id);
        entry.expectedHashes.set(source.workbookSha256, hashSources);
      }
      links.set(url, entry);
    }
  }

  for (const college of dataset.colleges ?? []) {
    const observations = college.observations ?? {};
    const applicants = observations.applicants;
    const admits = observations.admits;
    const admitRate = observations.admitRate;
    if (
      applicants?.sourceId === "uc-admissions-fall-2026-snapshots" &&
      admits?.sourceId === applicants.sourceId &&
      admitRate?.sourceId === applicants.sourceId &&
      applicants.sourceUrl === admits.sourceUrl &&
      applicants.sourceUrl === admitRate.sourceUrl
    ) {
      const entry = links.get(applicants.sourceUrl);
      if (entry) {
        entry.ucAdmissionsFacts.push({
          unitId: college.unitId,
          campus: college.name.replace(/^University of California-/, ""),
          applicants: applicants.value,
          admits: admits.value,
          admitRate: admitRate.value,
        });
      }
    }

    const enrollees = observations.enrollees;
    const yieldRate = observations.yieldRate;
    if (
      enrollees?.sourceId === "uc-accountability-2026-chapter-2" &&
      yieldRate?.sourceId === enrollees.sourceId &&
      enrollees.sourceUrl === yieldRate.sourceUrl
    ) {
      const entry = links.get(ucAccountabilitySource?.sourceUrl);
      if (entry) {
        entry.ucAccountabilityFacts.push({
          unitId: college.unitId,
          campus: college.name.replace(/^University of California-/, ""),
          enrollees: enrollees.value,
          yieldRate: yieldRate.value,
        });
      }
    }
  }

  return {
    sourceCount: sources.length,
    usedSourceIds: [...usedSourceIds].sort(),
    links: [...links.values()]
      .map((entry) => ({
        url: entry.url,
        sourceIds: [...entry.sourceIds].sort(),
        kinds: [...entry.kinds].sort(),
        expectedHashes: [...entry.expectedHashes].map(([sha256, sourceIds]) => ({
          sha256,
          sourceIds: [...sourceIds].sort(),
        })),
        ucAdmissionsFacts: entry.ucAdmissionsFacts,
        ucAccountabilityFacts: entry.ucAccountabilityFacts,
      }))
      .sort((left, right) => left.url.localeCompare(right.url)),
  };
}

function decodeXmlText(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([\da-f]+);/gi, (_, digits) => String.fromCodePoint(parseInt(digits, 16)));
}

function xmlAttributes(rawAttributes) {
  return Object.fromEntries(
    [...rawAttributes.matchAll(/([\w:.-]+)="([^"]*)"/g)]
      .map((match) => [match[1], decodeXmlText(match[2])]),
  );
}

function readXlsxSheetRows(bytes, sheetName) {
  let entryCount = 0;
  let uncompressedBytes = 0;
  const archive = unzipSync(bytes, {
    filter(entry) {
      entryCount += 1;
      if (entryCount > maximumXlsxEntries) throw new Error(`XLSX exceeded ${maximumXlsxEntries} entries.`);
      if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) {
        throw new Error("XLSX contains an invalid uncompressed entry size.");
      }
      uncompressedBytes += entry.originalSize;
      if (uncompressedBytes > maximumXlsxUncompressedBytes) {
        throw new Error(`XLSX exceeded ${maximumXlsxUncompressedBytes} uncompressed bytes.`);
      }
      return entry.name === "xl/workbook.xml" ||
        entry.name === "xl/_rels/workbook.xml.rels" ||
        entry.name === "xl/sharedStrings.xml" ||
        /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name);
    },
  });
  const decode = (name) => {
    if (!archive[name]) throw new Error(`XLSX is missing ${name}.`);
    return new TextDecoder("utf-8", { fatal: true }).decode(archive[name]);
  };

  const workbook = decode("xl/workbook.xml");
  const relationships = decode("xl/_rels/workbook.xml.rels");
  const sheet = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)]
    .map((match) => xmlAttributes(match[1]))
    .find((attributes) => attributes.name === sheetName);
  if (!sheet?.["r:id"]) throw new Error(`XLSX has no ${sheetName} worksheet.`);
  const relationship = [...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)]
    .map((match) => xmlAttributes(match[1]))
    .find((attributes) => attributes.Id === sheet["r:id"]);
  if (!relationship?.Target) throw new Error(`XLSX has no target for worksheet ${sheetName}.`);
  const sheetPath = relationship.Target.startsWith("/")
    ? relationship.Target.slice(1)
    : `xl/${relationship.Target.replace(/^\.\.\//, "")}`;
  const sheetXml = decode(sheetPath);

  let sharedStrings = [];
  if (archive["xl/sharedStrings.xml"]) {
    const sharedXml = decode("xl/sharedStrings.xml");
    sharedStrings = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
      .map((item) => [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
        .map((text) => decodeXmlText(text[1]))
        .join(""));
  }

  const rows = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttributes = xmlAttributes(rowMatch[1]);
    const row = { rowNumber: Number(rowAttributes.r) };
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = xmlAttributes(cellMatch[1]);
      const address = /^([A-Z]+)\d+$/.exec(attributes.r ?? "");
      if (!address) continue;
      const value = /<v>([\s\S]*?)<\/v>/.exec(cellMatch[2])?.[1];
      const inline = /<is>([\s\S]*?)<\/is>/.exec(cellMatch[2])?.[1];
      let cellValue = value == null ? null : decodeXmlText(value);
      if (attributes.t === "s" && cellValue != null) cellValue = sharedStrings[Number(cellValue)] ?? cellValue;
      if (attributes.t === "inlineStr" && inline) {
        cellValue = [...inline.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map((text) => decodeXmlText(text[1]))
          .join("");
      }
      if (typeof cellValue === "string" && /^-?\d+(?:\.\d+)?$/.test(cellValue)) {
        cellValue = Number(cellValue);
      }
      row[address[1]] = cellValue;
    }
    rows.push(row);
  }
  return rows;
}

function visibleHtmlText(bytes) {
  return bytes.toString("utf8")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([\da-f]+);/gi, (_, digits) => String.fromCodePoint(parseInt(digits, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function checkUcAdmissionsFacts(bytes, expectations) {
  const text = visibleHtmlText(bytes);
  const matches = [...text.matchAll(/Applicants\s*:\s*([\d,]+)\s+Admits\s*:\s*([\d,]+)\s+Overall admit rate\s*:?\s*([\d.]+)\s*%/gi)];
  if (matches.length !== 1) {
    throw new Error(`Expected one UC admissions summary in the official page; found ${matches.length}.`);
  }
  const [, applicantsText, admitsText, rateText] = matches[0];
  const applicants = Number(applicantsText.replaceAll(",", ""));
  const admits = Number(admitsText.replaceAll(",", ""));
  const publishedPercent = Number(rateText);
  const publishedDecimals = rateText.includes(".") ? rateText.split(".")[1].length : 0;
  const rateTolerance = 0.5 * (10 ** -publishedDecimals) / 100 + 1e-12;
  return expectations.map((expected) => {
    const computedRate = admits / applicants;
    const checks = {
      applicants: applicants === expected.applicants,
      admits: admits === expected.admits,
      computedRate: Math.abs(computedRate - expected.admitRate) <= 1e-12,
      publishedRoundedRate: Math.abs(publishedPercent / 100 - computedRate) <= rateTolerance,
    };
    return {
      unitId: expected.unitId,
      campus: expected.campus,
      expected: {
        applicants: expected.applicants,
        admits: expected.admits,
        admitRate: expected.admitRate,
      },
      observed: { applicants, admits, publishedPercent, computedRate },
      checks,
      status: Object.values(checks).every(Boolean) ? "match" : "mismatch",
    };
  });
}

function checkUcAccountabilityFacts(bytes, expectations) {
  const rows = readXlsxSheetRows(bytes, "2.1.1");
  return expectations.map((expected) => {
    const row = rows.find((candidate) => candidate.A === expected.campus && candidate.B === 2025);
    if (!row) {
      return {
        unitId: expected.unitId,
        campus: expected.campus,
        status: "mismatch",
        checks: { campusRowFound: false, enrollees: false, derivedYield: false },
      };
    }
    const computedYield = Number(row.E) / Number(row.D);
    const checks = {
      campusRowFound: true,
      enrollees: row.E === expected.enrollees,
      derivedYield: Math.abs(computedYield - expected.yieldRate) <= 1e-12,
    };
    return {
      unitId: expected.unitId,
      campus: expected.campus,
      expected: { enrollees: expected.enrollees, yieldRate: expected.yieldRate },
      observed: { applicants: row.C, admits: row.D, enrollees: row.E, computedYield },
      checks,
      status: Object.values(checks).every(Boolean) ? "match" : "mismatch",
    };
  });
}

function httpClassification(status) {
  if (status >= 200 && status < 300) return "reachable";
  if ([401, 403, 429].includes(status)) return "blocked-or-rate-limited";
  if ([404, 410].includes(status)) return "missing";
  if (status >= 500) return "server-error";
  return "other-http-error";
}

async function checkLink(link) {
  let currentUrl = assertHttpsUrl(link.url, `Source URL for ${link.sourceIds.join(", ")}`);
  const redirects = [];
  const signal = AbortSignal.timeout(requestTimeoutMilliseconds);
  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetch(currentUrl, { method: "GET", redirect: "manual", signal });
    const status = response.status;
    if (!redirectStatuses.has(status)) {
      let contentHash = null;
      let factChecks = [];
      const requiresBody = link.expectedHashes.length > 0 ||
        link.ucAdmissionsFacts.length > 0 || link.ucAccountabilityFacts.length > 0;
      if (status >= 200 && status < 300 && requiresBody) {
        const chunks = [];
        let byteLength = 0;
        let bodyError = null;
        try {
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Response body was unavailable for content checks.");
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            byteLength += value.byteLength;
            if (byteLength > maximumHashedResponseBytes) {
              await reader.cancel();
              throw new Error(`Recorded-hash response exceeded ${maximumHashedResponseBytes} bytes.`);
            }
            chunks.push(Buffer.from(value));
          }
        } catch (error) {
          await response.body?.cancel().catch(() => {});
          bodyError = String(error?.message ?? error).slice(0, 500);
        }

        if (bodyError) {
          if (link.expectedHashes.length > 0) {
            contentHash = {
              status: "not-checked",
              expected: link.expectedHashes,
              responseBytes: byteLength,
              error: bodyError,
            };
          }
          if (link.ucAdmissionsFacts.length > 0 || link.ucAccountabilityFacts.length > 0) {
            const expectations = [...link.ucAdmissionsFacts, ...link.ucAccountabilityFacts];
            factChecks = expectations.map((expected) => ({
              unitId: expected.unitId,
              campus: expected.campus,
              status: "not-checked",
              error: bodyError,
            }));
          }
        } else {
          const bytes = Buffer.concat(chunks);
          if (link.expectedHashes.length > 0) {
            const actualSha256 = createHash("sha256").update(bytes).digest("hex");
            const matchingExpected = link.expectedHashes.filter((item) => item.sha256 === actualSha256);
            contentHash = {
              status: matchingExpected.length ? "match" : "mismatch",
              actualSha256,
              expected: link.expectedHashes,
              matchingSources: matchingExpected.flatMap((item) => item.sourceIds),
              responseBytes: byteLength,
            };
          }
          try {
            if (link.ucAdmissionsFacts.length > 0) factChecks = checkUcAdmissionsFacts(bytes, link.ucAdmissionsFacts);
            if (link.ucAccountabilityFacts.length > 0) factChecks = checkUcAccountabilityFacts(bytes, link.ucAccountabilityFacts);
          } catch (error) {
            const expectations = [...link.ucAdmissionsFacts, ...link.ucAccountabilityFacts];
            factChecks = expectations.map((expected) => ({
              unitId: expected.unitId,
              campus: expected.campus,
              status: "not-checked",
              error: String(error?.message ?? error).slice(0, 500),
            }));
          }
        }
      } else {
        await response.body?.cancel();
      }
      return {
        ...link,
        status: httpClassification(status),
        httpStatus: status,
        finalHost: currentUrl.hostname,
        redirects,
        contentHash,
        factChecks,
      };
    }
    if (redirectCount >= maximumRedirects) {
      await response.body?.cancel();
      throw new Error(`Exceeded ${maximumRedirects} redirects.`);
    }
    const location = response.headers.get("location");
    if (!location) {
      await response.body?.cancel();
      throw new Error(`HTTP ${status} redirect has no Location header.`);
    }
    const nextUrl = new URL(location, currentUrl);
    assertHttpsUrl(nextUrl, "Redirect target");
    redirects.push({ status, fromHost: currentUrl.hostname, toHost: nextUrl.hostname });
    await response.body?.cancel();
    currentUrl = nextUrl;
  }
}

function summarizeCatalogEvidence(dataset, overlayDataset) {
  const registeredSources = new Map((dataset.release?.sources ?? []).map((source) => [source.id, source]));
  const usedSources = new Set();
  const metricSummary = {};
  const sourceSummary = {};
  const joinCounts = { observationRecords: 0, observationJoins: 0, programRecords: 0, programJoins: 0, missingSourceIds: 0, unknownSourceIds: 0 };

  function registerObservation(metric, observation) {
    if (!observation || typeof observation !== "object") return;
    joinCounts.observationRecords += 1;
    const sourceId = observation.sourceId;
    const sourceExists = typeof sourceId === "string" && registeredSources.has(sourceId);
    if (!sourceId) joinCounts.missingSourceIds += 1;
    else if (!sourceExists) joinCounts.unknownSourceIds += 1;
    else {
      joinCounts.observationJoins += 1;
      usedSources.add(sourceId);
    }
    const summary = metricSummary[metric] ?? {
      records: 0,
      numeric: 0,
      unavailable: 0,
      sourceJoins: 0,
      reportingYears: {},
      sources: {},
    };
    summary.records += 1;
    if (typeof observation.value === "number" && Number.isFinite(observation.value)) summary.numeric += 1;
    else if (observation.value === null) summary.unavailable += 1;
    if (Number.isInteger(observation.reportingYear)) {
      const year = String(observation.reportingYear);
      summary.reportingYears[year] = (summary.reportingYears[year] ?? 0) + 1;
    }
    if (sourceExists) {
      summary.sourceJoins += 1;
      summary.sources[sourceId] = (summary.sources[sourceId] ?? 0) + 1;
      const sourceCount = sourceSummary[sourceId] ?? { observationRecords: 0, programRecords: 0 };
      sourceCount.observationRecords += 1;
      sourceSummary[sourceId] = sourceCount;
    }
    metricSummary[metric] = summary;
  }

  for (const college of dataset.colleges ?? []) {
    for (const [metric, observation] of Object.entries(college.observations ?? {})) registerObservation(metric, observation);
    for (const [metric, observation] of Object.entries(college.alternateObservations ?? {})) registerObservation(metric, observation);
    for (const program of college.majors ?? []) {
      joinCounts.programRecords += 1;
      const sourceId = program?.sourceId;
      if (!sourceId) joinCounts.missingSourceIds += 1;
      else if (!registeredSources.has(sourceId)) joinCounts.unknownSourceIds += 1;
      else {
        joinCounts.programJoins += 1;
        usedSources.add(sourceId);
        const sourceCount = sourceSummary[sourceId] ?? { observationRecords: 0, programRecords: 0 };
        sourceCount.programRecords += 1;
        sourceSummary[sourceId] = sourceCount;
      }
    }
  }

  const overlaySummary = validateInstitutionOverlays(overlayDataset);
  const overlayMetrics = {};
  const currentTuitionYears = {};
  for (const college of overlayDataset.colleges) {
    for (const [metric, observation] of Object.entries(college.observations)) {
      const summary = overlayMetrics[metric] ?? { records: 0, byStatus: {}, byReportingYear: {} };
      summary.records += 1;
      summary.byStatus[observation.status] = (summary.byStatus[observation.status] ?? 0) + 1;
      const year = String(observation.reportingYear);
      summary.byReportingYear[year] = (summary.byReportingYear[year] ?? 0) + 1;
      overlayMetrics[metric] = summary;
      if (["tuitionInState", "tuitionOutOfState"].includes(metric)) {
        currentTuitionYears[year] = (currentTuitionYears[year] ?? 0) + 1;
      }
    }
  }

  return {
    sourceJoins: {
      observationRecords: joinCounts.observationRecords,
      observationsJoinedToRegisteredSources: joinCounts.observationJoins,
      programEvidenceRecords: joinCounts.programRecords,
      programEvidenceJoinedToRegisteredSources: joinCounts.programJoins,
      missingOrUnknownSourceIds: joinCounts.missingSourceIds + joinCounts.unknownSourceIds,
      missingSourceIds: joinCounts.missingSourceIds,
      unknownSourceIds: joinCounts.unknownSourceIds,
      registeredSources: registeredSources.size,
      sourcesActuallyUsed: usedSources.size,
      bySourceId: sourceSummary,
    },
    observationMetrics: metricSummary,
    overlayValidation: {
      ...overlaySummary,
      method: "existing institution overlay schema, lineage, cohort, numeric domain, and derived-rate checks",
      metrics: overlayMetrics,
      tuitionObservationCountByReportingYear: currentTuitionYears,
    },
  };
}

function summarizeTuitionEvidence(dataset, tuitionDataset) {
  const catalogUnitIds = new Set((dataset.colleges ?? []).map((college) => college.unitId));
  const source = tuitionDataset?.release ?? {};
  const rows = tuitionDataset?.colleges ?? [];
  const seenIds = new Set();
  const metricFields = {
    "tuition.inDistrict": "TUITION1",
    "tuition.inState": "TUITION2",
    "tuition.outOfState": "TUITION3",
    "fees.inDistrict": "FEE1",
    "fees.inState": "FEE2",
    "fees.outOfState": "FEE3",
  };
  const metrics = Object.fromEntries(Object.keys(metricFields).map((key) => [key, {
    records: 0,
    numeric: 0,
    unavailable: 0,
    sourceIdJoins: 0,
    sourceFieldMatches: 0,
    valueStatusMatches: 0,
    periodMatches: 0,
    sourceUrlMatches: 0,
  }]));
  let catalogUnitJoins = 0;
  let duplicateUnitIds = 0;
  let extraUnitIds = 0;
  let missingUnitIds = 0;
  let sourceRecordPresent = 0;
  let sourceRecordAbsent = 0;
  const observationIssues = [];

  for (const row of rows) {
    if (seenIds.has(row.unitId)) duplicateUnitIds += 1;
    seenIds.add(row.unitId);
    if (catalogUnitIds.has(row.unitId)) catalogUnitJoins += 1;
    else extraUnitIds += 1;
    if (row.sourceRecordPresent) sourceRecordPresent += 1;
    else sourceRecordAbsent += 1;

    for (const [metric, sourceField] of Object.entries(metricFields)) {
      const [group, name] = metric.split(".");
      const observation = row[group]?.[name];
      const summary = metrics[metric];
      summary.records += 1;
      if (typeof observation?.value === "number" && Number.isFinite(observation.value)) summary.numeric += 1;
      else if (observation?.value === null) summary.unavailable += 1;
      const checks = {
        sourceId: observation?.sourceId === source.id,
        sourceField: observation?.sourceField === sourceField,
        valueStatus: observation && ((observation.value === null && observation.status === "unavailable") ||
          (typeof observation.value === "number" && Number.isFinite(observation.value) && observation.value >= 0 &&
            ["reported", "derived"].includes(observation.status))),
        period: observation?.reportingYear === source.reportingYear &&
          observation?.periodLabel === source.periodLabel && observation?.finality === source.finality,
        sourceUrl: observation?.sourceUrl === (source.sourceArchiveUrl ?? source.sourceUrl),
      };
      for (const [check, matches] of Object.entries(checks)) {
        if (matches) summary[check === "sourceId" ? "sourceIdJoins" :
          check === "sourceField" ? "sourceFieldMatches" :
            check === "valueStatus" ? "valueStatusMatches" :
              check === "period" ? "periodMatches" : "sourceUrlMatches"] += 1;
        else observationIssues.push({ unitId: row.unitId, metric, check });
      }
    }
  }
  for (const unitId of catalogUnitIds) if (!seenIds.has(unitId)) missingUnitIds += 1;

  return {
    sourceId: source.id ?? null,
    archiveSha256: source.archiveSha256 ?? null,
    archiveMemberSha256: source.archiveMemberSha256 ?? null,
    catalogCollegeCount: catalogUnitIds.size,
    records: rows.length,
    uniqueUnitIds: seenIds.size,
    catalogUnitJoins,
    extraUnitIds,
    missingUnitIds,
    duplicateUnitIds,
    sourceRecordPresent,
    sourceRecordAbsent,
    observationRecordCount: rows.length * Object.keys(metricFields).length,
    observationIssues: observationIssues.length,
    observationIssueExamples: observationIssues.slice(0, 20),
    metrics,
    reportedCoverage: tuitionDataset?.coverage ?? null,
  };
}

function summarizeCostOverrideEvidence(dataset, costOverrides) {
  const catalogUnitIds = new Set((dataset.colleges ?? []).map((college) => college.unitId));
  const seenIds = new Set();
  let catalogUnitJoins = 0;
  let duplicateUnitIds = 0;
  let extraUnitIds = 0;
  let costObservations = 0;
  let sourceIdJoins = 0;
  let validObservations = 0;
  let budgetTotalsChecked = 0;
  let budgetTotalsMatched = 0;
  let feeBasisValid = 0;
  const issues = [];

  for (const college of costOverrides?.colleges ?? []) {
    if (seenIds.has(college.unitId)) duplicateUnitIds += 1;
    seenIds.add(college.unitId);
    if (catalogUnitIds.has(college.unitId)) catalogUnitJoins += 1;
    else extraUnitIds += 1;
    const costs = college.costs ?? {};
    if (["required", "allowance"].includes(costs.feeBasis)) feeBasisValid += 1;
    else issues.push({ unitId: college.unitId, check: "feeBasis" });
    for (const key of ["tuitionInState", "tuitionOutOfState", "feesInState", "feesOutOfState"]) {
      costObservations += 1;
      const observation = costs[key];
      const sourceIdMatches = typeof observation?.sourceId === "string";
      if (sourceIdMatches) sourceIdJoins += 1;
      const valid = observation?.unit === "usd" &&
        typeof observation.value === "number" && Number.isFinite(observation.value) && observation.value >= 0 &&
        Number.isInteger(observation.reportingYear) && observation.periodLabel && observation.sourceField &&
        observation.cohort && observation.definition && /^https:\/\//.test(observation.sourceUrl ?? "") &&
        sourceIdMatches && ["reported", "derived"].includes(observation.status);
      if (valid) validObservations += 1;
      else issues.push({ unitId: college.unitId, check: `cost:${key}` });
    }
    if (Array.isArray(college.budget?.rows) && Number.isFinite(college.budget.total)) {
      budgetTotalsChecked += 1;
      const sum = college.budget.rows.reduce((total, row) => total + Number(row?.[1]), 0);
      if (sum === college.budget.total) budgetTotalsMatched += 1;
      else issues.push({ unitId: college.unitId, check: "budgetTotal" });
    } else issues.push({ unitId: college.unitId, check: "budgetRows" });
  }
  return {
    records: (costOverrides?.colleges ?? []).length,
    uniqueUnitIds: seenIds.size,
    catalogUnitCount: catalogUnitIds.size,
    catalogUnitJoins,
    catalogUnitRecordsWithoutOverride: catalogUnitIds.size - catalogUnitJoins,
    extraUnitIds,
    duplicateUnitIds,
    feeBasisValid,
    costObservations,
    sourceIdJoins,
    validObservations,
    budgetTotalsChecked,
    budgetTotalsMatched,
    integrityIssues: issues.length,
    integrityIssueExamples: issues.slice(0, 20),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write([
      "Check deduplicated official source URLs referenced by generated catalog evidence.",
      "",
      "Usage:",
      "  node scripts/audit-catalog-source-links.mjs [--dataset PATH] [--overlays PATH] [--tuition-data PATH] [--cost-overrides PATH] [--report PATH]",
      "",
      "Each deduplicated URL receives one bounded GET request. Bodies are cancelled after headers",
      "except for registered hash artifacts and two UC source tables with numeric comparisons.",
    ].join("\n") + "\n");
    return;
  }

  const datasetPath = resolve(repositoryRoot, options.dataset);
  const overlaysPath = resolve(repositoryRoot, options.overlays);
  const tuitionDataPath = resolve(repositoryRoot, options.tuitionData);
  const costOverridesPath = resolve(repositoryRoot, options.costOverrides);
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  const overlayDataset = JSON.parse(await readFile(overlaysPath, "utf8"));
  const tuitionDataset = JSON.parse(await readFile(tuitionDataPath, "utf8"));
  const costOverrides = JSON.parse(await readFile(costOverridesPath, "utf8"));
  const scope = collectSourceLinks(dataset, tuitionDataset, costOverrides);
  const catalogEvidence = summarizeCatalogEvidence(dataset, overlayDataset);
  const tuitionEvidence = summarizeTuitionEvidence(dataset, tuitionDataset);
  const costOverrideEvidence = summarizeCostOverrideEvidence(dataset, costOverrides);
  if (scope.links.length > maximumRequests) {
    throw new Error(`Found ${scope.links.length} unique URLs, over the ${maximumRequests}-request safety limit.`);
  }

  const checkedAt = new Date().toISOString();
  const results = new Array(scope.links.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, scope.links.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= scope.links.length) return;
      const link = scope.links[index];
      try {
        results[index] = await checkLink(link);
      } catch (error) {
        results[index] = {
          ...link,
          status: "request-error",
          httpStatus: null,
          finalHost: null,
          redirects: [],
          error: String(error?.message ?? error).slice(0, 500),
        };
      }
    }
  }));

  const counts = Object.fromEntries(
    ["reachable", "blocked-or-rate-limited", "missing", "server-error", "other-http-error", "request-error"]
      .map((status) => [status, results.filter((result) => result.status === status).length]),
  );
  const contentHashLinks = results.filter((result) => result.expectedHashes.length > 0);
  const contentHashCounts = {
    checked: contentHashLinks.filter((result) => result.contentHash?.status === "match").length,
    changed: contentHashLinks.filter((result) => result.contentHash?.status === "mismatch").length,
    notChecked: contentHashLinks.filter((result) => result.contentHash?.status === "not-checked").length,
    bytesRead: contentHashLinks.reduce((sum, result) => sum + (result.contentHash?.responseBytes ?? 0), 0),
  };
  const numericFactChecks = results.flatMap((result) => result.factChecks ?? []);
  const numericObservationChecks = numericFactChecks.flatMap((check) => {
    if (check.checks && "applicants" in check.checks) {
      return [
        { metric: "applicants", matched: check.checks.applicants },
        { metric: "admits", matched: check.checks.admits },
        { metric: "admitRate", matched: check.checks.computedRate && check.checks.publishedRoundedRate },
      ];
    }
    if (check.checks && "enrollees" in check.checks) {
      return [
        { metric: "enrollees", matched: check.checks.enrollees && check.checks.campusRowFound },
        { metric: "yieldRate", matched: check.checks.derivedYield && check.checks.campusRowFound },
      ];
    }
    return [];
  });
  const numericFactCounts = {
    campusSourceRecordsChecked: numericFactChecks.filter((check) => check.status === "match").length,
    campusSourceRecordMismatches: numericFactChecks.filter((check) => check.status === "mismatch").length,
    campusSourceRecordsNotChecked: numericFactChecks.filter((check) => check.status === "not-checked").length,
    observationChecks: numericObservationChecks.length,
    observationMatches: numericObservationChecks.filter((check) => check.matched).length,
    observationMismatches: numericObservationChecks.filter((check) => check.matched === false).length,
    observationChecksNotDerived: numericFactChecks.filter((check) => check.status === "not-checked").length,
  };
  const report = {
    schemaVersion: 1,
    checkedAt,
    status: counts.reachable === results.length &&
      contentHashCounts.changed === 0 && contentHashCounts.notChecked === 0 &&
      numericFactCounts.campusSourceRecordMismatches === 0 &&
      numericFactCounts.campusSourceRecordsNotChecked === 0 &&
      numericFactCounts.observationMismatches === 0 &&
      numericFactCounts.observationChecksNotDerived === 0 &&
      tuitionEvidence.observationIssues === 0 &&
      tuitionEvidence.catalogUnitJoins === tuitionEvidence.catalogCollegeCount &&
      tuitionEvidence.extraUnitIds === 0 && tuitionEvidence.missingUnitIds === 0 &&
      tuitionEvidence.duplicateUnitIds === 0 &&
      costOverrideEvidence.integrityIssues === 0 &&
      costOverrideEvidence.catalogUnitJoins === costOverrideEvidence.records &&
      costOverrideEvidence.extraUnitIds === 0 &&
      costOverrideEvidence.duplicateUnitIds === 0
      ? "passed"
      : "attention-needed",
    checkKind: "http-reachability-recorded-hash-and-uc-value-audit",
    scope: {
      dataset: datasetPath,
      overlays: overlaysPath,
      tuitionData: tuitionDataPath,
      costOverrides: costOverridesPath,
      collegeCount: dataset.colleges?.length ?? 0,
      registeredEvidenceSourceCount: (dataset.release?.sources ?? []).length + 1 +
        new Set((costOverrides.colleges ?? []).flatMap((college) =>
          Object.values(college.costs ?? {}).map((observation) => observation?.sourceId).filter(Boolean))).size,
      usedEvidenceSourceCount: scope.sourceCount,
      uniqueOfficialSourceUrls: scope.links.length,
      maximumRequests,
      concurrency,
      responseBodiesReadForRecordedHashOrFactChecks: contentHashLinks.length,
      responseBodyBytesReadForRecordedHashChecks: contentHashCounts.bytesRead,
      recordedHashResponseLimitBytes: maximumHashedResponseBytes,
      perCollegeWebsiteChecks: 0,
      note: "Per-college website links identify institutions; the pinned archive and registered source artifacts establish reported numbers. Website URLs were not crawled individually.",
    },
    counts,
    recordedContentHashes: contentHashCounts,
    numericSourceFactChecks: numericFactCounts,
    catalogEvidence,
    tuitionEvidence,
    costOverrideEvidence,
    sourcesUsed: scope.usedSourceIds,
    links: results,
  };

  if (options.report) {
    const reportPath = resolve(repositoryRoot, options.report);
    await mkdir(dirname(reportPath), { recursive: true });
    await atomicWriteFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`Official source URL reachability: ${report.status}\n`);
  process.stdout.write(`Institutions: ${report.scope.collegeCount}; evidence sources: ${scope.sourceCount}; deduplicated URLs checked: ${results.length}\n`);
  process.stdout.write(`HTTP outcomes: ${Object.entries(counts).map(([name, count]) => `${name}=${count}`).join(", " )}\n`);
  process.stdout.write(`Recorded hashes: ${contentHashCounts.checked} matched, ${contentHashCounts.changed} changed, ${contentHashCounts.notChecked} not checked; UC tables: ${numericFactCounts.campusSourceRecordsChecked} matched, ${numericFactCounts.campusSourceRecordMismatches} mismatched; UC observations: ${numericFactCounts.observationMatches}/${numericFactCounts.observationChecks} matched\n`);
  process.stdout.write(`Source joins: ${catalogEvidence.sourceJoins.observationsJoinedToRegisteredSources}/${catalogEvidence.sourceJoins.observationRecords} observations and ${catalogEvidence.sourceJoins.programEvidenceJoinedToRegisteredSources}/${catalogEvidence.sourceJoins.programEvidenceRecords} program records\n`);
  process.stdout.write(`Tuition sidecar joins: ${tuitionEvidence.catalogUnitJoins}/${tuitionEvidence.catalogCollegeCount} UNITIDs; ${Object.entries(tuitionEvidence.metrics).map(([key, value]) => `${key}=${value.numeric} numeric/${value.unavailable} unavailable`).join(", ")}\n`);
  process.stdout.write(`Cost overrides: ${costOverrideEvidence.catalogUnitJoins}/${costOverrideEvidence.records} UNITIDs; ${costOverrideEvidence.validObservations}/${costOverrideEvidence.costObservations} cost observations valid; budgets ${costOverrideEvidence.budgetTotalsMatched}/${costOverrideEvidence.budgetTotalsChecked} totals matched\n`);
  if (options.report) process.stdout.write(`Full report: ${resolve(repositoryRoot, options.report)}\n`);
  if (report.status !== "passed") process.exitCode = 1;
}

await main();
