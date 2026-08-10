import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";

import {
  artifactBytesForHash,
  sha256Hex,
  validateInstitutionOverlays,
} from "./lib/institution-overlays.mjs";
import { readResponseBytes } from "./lib/limited-response.mjs";

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
} = {}) {
  const dataset = JSON.parse(await readFile(path, "utf8"));
  const summary = validateInstitutionOverlays(dataset);

  if (!offline) {
    let totalBytes = 0;
    for (const source of dataset.sources) {
      if (!source.artifactUrl) {
        throw new Error(
          `Source ${source.id} has no refresh-verifiable artifact. Add an official artifact URL and hash before publication.`,
        );
      }

      const response = await fetchArtifactWithRedirectValidation(source, {
        fetchImplementation,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          `Source ${source.id} artifact request failed with HTTP ${response.status}.`,
        );
      }
      const bytes = await readResponseBytes(
        response,
        MAXIMUM_ARTIFACT_BYTES[source.artifactKind],
        `${source.id} artifact`,
      );
      totalBytes += bytes.byteLength;
      if (totalBytes > MAXIMUM_TOTAL_BYTES) {
        throw new Error(
          "Institution overlay artifacts exceed the refresh byte budget.",
        );
      }

      validateArtifactResponse(source, response, bytes);
      const actualHash = sha256Hex(
        artifactBytesForHash(bytes, source.artifactHashMode ?? "raw"),
      );
      if (actualHash !== source.artifactSha256) {
        throw new Error(
          `Source ${source.id} changed: expected ${source.artifactSha256}, received ${actualHash}. Review the official artifact before updating the overlay.`,
        );
      }
    }
  }

  return summary;
}

async function main() {
  const offline = process.argv.includes("--offline");
  const summary = await verifyInstitutionOverlays({ offline });
  console.log(
    `Verified ${summary.collegeCount} institution overlays, ${summary.observationCount} observations, and ${summary.artifactCount} registered artifacts${offline ? " (offline schema check)" : ""}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await main();
}
