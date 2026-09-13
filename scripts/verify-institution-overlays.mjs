import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";

import {
  artifactBytesForHash,
  sha256Hex,
  validateInstitutionOverlays,
} from "./lib/institution-overlays.mjs";
import { readResponseBytes } from "./lib/limited-response.mjs";
import { atomicWriteFile } from "./lib/atomic-write.mjs";

const MAXIMUM_ARTIFACT_BYTES = {
  html: 4 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
  xlsx: 25 * 1024 * 1024,
};
const MAXIMUM_TOTAL_BYTES = 100 * 1024 * 1024;
const MAXIMUM_REDIRECTS = 5;
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const MAXIMUM_XLSX_ENTRIES = 2_048;
const MAXIMUM_XLSX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const MAXIMUM_REQUIRED_XLSX_ENTRY_BYTES = 4 * 1024 * 1024;
const REQUIRED_XLSX_ENTRIES = new Set([
  "[Content_Types].xml",
  "xl/workbook.xml",
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const defaultOverlayPath = resolve(scriptDirectory, "../data/institution-overlays.json");

export function resolveOverlayPath(
  configuredPath = process.env.INSTITUTION_OVERLAYS_PATH,
) {
  return configuredPath ? resolve(configuredPath) : defaultOverlayPath;
}

function assertAllowedArtifactUrl(source, value, label) {
  let url;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error(`Source ${source.id} ${label} is not a valid URL.`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`Source ${source.id} ${label} must use HTTPS.`);
  }
  if (url.username || url.password) {
    throw new Error(`Source ${source.id} ${label} must not include credentials.`);
  }
  if (url.port && url.port !== "443") {
    throw new Error(`Source ${source.id} ${label} must use the standard HTTPS port.`);
  }

  const allowedHosts = new Set(
    source.allowedArtifactHosts.map((host) => host.toLowerCase()),
  );
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.has(host)) {
    throw new Error(
      `Source ${source.id} ${label} uses non-allowlisted host ${host}.`,
    );
  }

  return url;
}

export async function fetchArtifactWithRedirectValidation(
  source,
  {
    fetchImplementation = fetch,
    maximumRedirects = MAXIMUM_REDIRECTS,
    timeoutMilliseconds = REQUEST_TIMEOUT_MILLISECONDS,
  } = {},
) {
  let currentUrl = assertAllowedArtifactUrl(
    source,
    source.artifactUrl,
    "artifact URL",
  );
  const signal = AbortSignal.timeout(timeoutMilliseconds);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetchImplementation(currentUrl, {
      redirect: "manual",
      signal,
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }
    if (redirectCount >= maximumRedirects) {
      await response.body?.cancel();
      throw new Error(
        `Source ${source.id} exceeded the ${maximumRedirects}-redirect safety limit.`,
      );
    }

    const location = response.headers.get("location");
    if (!location) {
      await response.body?.cancel();
      throw new Error(
        `Source ${source.id} returned HTTP ${response.status} without a redirect location.`,
      );
    }

    let nextUrl;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      await response.body?.cancel();
      throw new Error(`Source ${source.id} returned an invalid redirect location.`);
    }
    await response.body?.cancel();
    currentUrl = assertAllowedArtifactUrl(source, nextUrl, "redirect URL");
  }
}

export function validateXlsxWorkbook(bytes, label = "XLSX artifact") {
  const isZip =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  if (!isZip) {
    throw new Error(`${label} is not a ZIP-based workbook.`);
  }

  let entryCount = 0;
  let cumulativeUncompressedBytes = 0;
  const requiredEntriesSeen = new Set();
  let extracted;

  try {
    extracted = unzipSync(bytes, {
      filter(entry) {
        entryCount += 1;
        if (entryCount > MAXIMUM_XLSX_ENTRIES) {
          throw new Error(
            `${label} exceeds the ${MAXIMUM_XLSX_ENTRIES}-entry safety limit.`,
          );
        }

        if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) {
          throw new Error(`${label} contains an entry with an invalid size.`);
        }
        cumulativeUncompressedBytes += entry.originalSize;
        if (cumulativeUncompressedBytes > MAXIMUM_XLSX_UNCOMPRESSED_BYTES) {
          throw new Error(
            `${label} exceeds the ${MAXIMUM_XLSX_UNCOMPRESSED_BYTES}-byte uncompressed safety limit.`,
          );
        }

        if (!REQUIRED_XLSX_ENTRIES.has(entry.name)) return false;
        if (requiredEntriesSeen.has(entry.name)) {
          throw new Error(`${label} contains duplicate entry ${entry.name}.`);
        }
        if (entry.originalSize > MAXIMUM_REQUIRED_XLSX_ENTRY_BYTES) {
          throw new Error(
            `${label} entry ${entry.name} exceeds the ${MAXIMUM_REQUIRED_XLSX_ENTRY_BYTES}-byte extraction limit.`,
          );
        }
        requiredEntriesSeen.add(entry.name);
        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) throw error;
    throw new Error(`${label} is not a valid ZIP archive.`, { cause: error });
  }

  for (const entryName of REQUIRED_XLSX_ENTRIES) {
    if (!requiredEntriesSeen.has(entryName) || !extracted[entryName]) {
      throw new Error(`${label} is missing required entry ${entryName}.`);
    }
  }

  let contentTypes;
  let workbook;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    contentTypes = decoder.decode(extracted["[Content_Types].xml"]);
    workbook = decoder.decode(extracted["xl/workbook.xml"]);
  } catch (error) {
    throw new Error(`${label} contains invalid UTF-8 workbook XML.`, {
      cause: error,
    });
  }

  if (
    !/<(?:\w+:)?Types\b/.test(contentTypes) ||
    !contentTypes.includes(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    ) ||
    !/<(?:\w+:)?workbook\b/.test(workbook)
  ) {
    throw new Error(`${label} does not contain the expected XLSX workbook XML.`);
  }
}

export function validateArtifactResponse(source, response, bytes) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (source.artifactKind === "pdf") {
    const magic = new TextDecoder("ascii").decode(bytes.subarray(0, 5));
    if (
      magic !== "%PDF-" ||
      (!contentType.includes("pdf") && !contentType.includes("octet-stream"))
    ) {
      throw new Error(`Source ${source.id} did not return the expected PDF artifact.`);
    }
    return;
  }

  if (source.artifactKind === "xlsx") {
    if (
      !contentType.includes("spreadsheetml") &&
      !contentType.includes("octet-stream")
    ) {
      throw new Error(`Source ${source.id} did not return the expected XLSX MIME type.`);
    }
    validateXlsxWorkbook(bytes, `Source ${source.id} XLSX artifact`);
    return;
  }

  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!contentType.includes("text/html") || !/^\s*<!doctype html/i.test(html)) {
    throw new Error(`Source ${source.id} did not return the expected HTML artifact.`);
  }
  for (const anchor of source.evidenceAnchors ?? []) {
    if (!html.includes(anchor)) {
      throw new Error(
        `Source ${source.id} is missing reviewed evidence anchor ${JSON.stringify(anchor)}.`,
      );
    }
  }
}

export async function verifyInstitutionOverlays({
  fetchImplementation = fetch,
  offline = false,
  path = resolveOverlayPath(),
  reportPath,
  now = () => new Date().toISOString(),
} = {}) {
  const report = {
    schemaVersion: 1,
    checkKind: offline ? "offline-schema" : "artifact-integrity",
    startedAt: now(),
    checkedAt: null,
    status: "failed",
    schemaStatus: "not_checked",
    counts: { total: 0, passed: 0, failed: 0, notChecked: 0 },
    sources: [],
  };
  async function saveReport() {
    report.checkedAt = now();
    if (!reportPath) return;
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await atomicWriteFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  }
  let dataset;
  let summary;
  try {
    dataset = JSON.parse(await readFile(path, "utf8"));
    summary = validateInstitutionOverlays(dataset);
    report.schemaStatus = "passed";
  } catch (error) {
    report.schemaStatus = "failed";
    report.error = { stage: "schema", message: error.message };
    await saveReport();
    throw error;
  }

  const failures = [];

  if (!offline) {
    let totalBytes = 0;
    let byteBudgetExceeded = false;
    for (const source of dataset.sources) {
      const result = {
        sourceId: source.id,
        publisher: source.publisher,
        sourceName: source.sourceName,
        artifactUrl: source.artifactUrl ?? null,
        artifactKind: source.artifactKind,
        artifactHashMode: source.artifactHashMode ?? "raw",
        checkedAt: now(),
        status: "failed",
        httpStatus: null,
        finalHost: null,
        artifactBytes: null,
        expectedSha256: source.artifactSha256 ?? null,
        actualSha256: null,
        error: null,
        lastApprovedEvidence: {
          reviewedOn: source.review?.reviewedOn ?? null,
          artifactSha256: source.review?.approvedSha256 ?? null,
          artifactUrl: source.artifactUrl ?? null,
          sourcePage: source.sourcePage ?? source.sourceUrl,
          cohort: source.cohort,
          reviewNotes: source.review?.notes ?? null,
        },
      };
      let stage = "request";
      try {
        if (byteBudgetExceeded) {
          stage = "byte-budget";
          result.status = "not_checked";
          throw new Error(`Source ${source.id} was not fetched because the refresh byte budget was exhausted.`);
        }
        if (!source.artifactUrl) {
          throw new Error(
            `Source ${source.id} has no refresh-verifiable artifact. Add an official artifact URL and hash before publication.`,
          );
        }
        const response = await fetchArtifactWithRedirectValidation(source, {
          fetchImplementation,
        });
        result.httpStatus = response.status;
        // Box download URLs contain expiring opaque tokens; persist only the final host.
        result.finalHost = response.url ? new URL(response.url).hostname : null;
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(
            `Source ${source.id} artifact request failed with HTTP ${response.status}.`,
          );
        }
        stage = "body";
        const remainingBytes = MAXIMUM_TOTAL_BYTES - totalBytes;
        const maximumBytes = Math.min(MAXIMUM_ARTIFACT_BYTES[source.artifactKind], remainingBytes);
        const bytes = await readResponseBytes(response, maximumBytes, `${source.id} artifact`);
        totalBytes += bytes.byteLength;
        result.artifactBytes = bytes.byteLength;
        byteBudgetExceeded = totalBytes >= MAXIMUM_TOTAL_BYTES;

        stage = "artifact-format";
        validateArtifactResponse(source, response, bytes);
        stage = "fingerprint";
        result.actualSha256 = sha256Hex(
          artifactBytesForHash(bytes, source.artifactHashMode ?? "raw"),
        );
        if (result.actualSha256 !== source.artifactSha256) {
          throw new Error(
            `Source ${source.id} changed: expected ${source.artifactSha256}, received ${result.actualSha256}. Review the official artifact before updating the overlay.`,
          );
        }
        result.status = "passed";
      } catch (error) {
        // Conservatively reserve the whole allowed body after a body-reader failure.
        // Its partial bytes cannot be safely reused for later requests.
        if (stage === "body") {
          totalBytes += Math.min(MAXIMUM_ARTIFACT_BYTES[source.artifactKind], MAXIMUM_TOTAL_BYTES - totalBytes);
          byteBudgetExceeded = totalBytes >= MAXIMUM_TOTAL_BYTES;
        }
        result.error = { stage, message: error.message };
        failures.push(error);
      }
      result.checkedAt = now();
      report.sources.push(result);
    }
  }

  report.counts = {
    total: report.sources.length,
    passed: report.sources.filter((source) => source.status === "passed").length,
    failed: report.sources.filter((source) => source.status === "failed").length,
    notChecked: report.sources.filter((source) => source.status === "not_checked").length,
  };
  report.status = failures.length ? "failed" : "passed";
  await saveReport();
  if (failures.length) {
    const error = new AggregateError(
      failures,
      `Institution source verification failed for ${failures.length} of ${report.sources.length} artifacts:\n${failures.map((failure) => failure.message).join("\n")}`,
    );
    error.report = report;
    throw error;
  }
  return summary;
}

async function main() {
  const offline = process.argv.includes("--offline");
  const reportFlag = process.argv.indexOf("--report");
  if (reportFlag >= 0 && (!process.argv[reportFlag + 1] || process.argv[reportFlag + 1].startsWith("--"))) {
    throw new Error("--report requires an output path.");
  }
  const reportPath = process.argv[reportFlag + 1] && reportFlag >= 0
    ? resolve(process.argv[reportFlag + 1])
    : process.env.INSTITUTION_VERIFICATION_REPORT_PATH
      ? resolve(process.env.INSTITUTION_VERIFICATION_REPORT_PATH)
      : offline ? undefined : resolve(scriptDirectory, "../data/institution-source-verification.json");
  const summary = await verifyInstitutionOverlays({ offline, reportPath });
  console.log(
    `Verified ${summary.collegeCount} institution overlays, ${summary.observationCount} observations, and ${summary.artifactCount} registered artifacts${offline ? " (offline schema check)" : ""}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await main();
}
