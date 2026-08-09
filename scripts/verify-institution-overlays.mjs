import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  artifactBytesForHash,
  sha256Hex,
  validateInstitutionOverlays,
} from "./lib/institution-overlays.mjs";
import { fetchWithTimeout, readResponseBytes } from "./lib/limited-response.mjs";

const MAXIMUM_ARTIFACT_BYTES = {
  html: 4 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
};
const MAXIMUM_TOTAL_BYTES = 100 * 1024 * 1024;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const overlayPath = resolve(scriptDirectory, "../data/institution-overlays.json");
const dataset = JSON.parse(await readFile(overlayPath, "utf8"));
const summary = validateInstitutionOverlays(dataset);

if (!process.argv.includes("--offline")) {
  let totalBytes = 0;
  for (const source of dataset.sources) {
    if (!source.artifactUrl) {
      throw new Error(
        `Source ${source.id} has no refresh-verifiable artifact. Add an official artifact URL and hash before publication.`,
      );
    }

    const response = await fetchWithTimeout(source.artifactUrl);
    if (!response.ok) {
      throw new Error(
        `Source ${source.id} artifact request failed with HTTP ${response.status}.`,
      );
    }
    const finalHost = new URL(response.url).hostname.toLowerCase();
    if (!source.allowedArtifactHosts.includes(finalHost)) {
      throw new Error(
        `Source ${source.id} redirected to non-allowlisted host ${finalHost}.`,
      );
    }
    const bytes = await readResponseBytes(
      response,
      MAXIMUM_ARTIFACT_BYTES[source.artifactKind],
      `${source.id} artifact`,
    );
    totalBytes += bytes.byteLength;
    if (totalBytes > MAXIMUM_TOTAL_BYTES) {
      throw new Error("Institution overlay artifacts exceed the refresh byte budget.");
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (source.artifactKind === "pdf") {
      const magic = new TextDecoder("ascii").decode(bytes.subarray(0, 5));
      if (magic !== "%PDF-" || (!contentType.includes("pdf") && !contentType.includes("octet-stream"))) {
        throw new Error(`Source ${source.id} did not return the expected PDF artifact.`);
      }
    } else {
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

console.log(
  `Verified ${summary.collegeCount} institution overlays, ${summary.observationCount} observations, and ${summary.artifactCount} registered artifacts${process.argv.includes("--offline") ? " (offline schema check)" : ""}.`,
);
