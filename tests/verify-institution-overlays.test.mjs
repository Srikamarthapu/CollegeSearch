import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import {
  fetchArtifactWithRedirectValidation,
  validateArtifactResponse,
  validateXlsxWorkbook,
  verifyInstitutionOverlays,
} from "../scripts/verify-institution-overlays.mjs";
import { sha256Hex } from "../scripts/lib/institution-overlays.mjs";

function validWorkbookBytes() {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    ),
    "xl/workbook.xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>',
    ),
  });
}

function xlsxSource() {
  return {
    id: "fixture-cds",
    artifactKind: "xlsx",
    artifactUrl: "https://allowed.example/workbook.xlsx",
    allowedArtifactHosts: ["allowed.example"],
  };
}

function reviewedPdfSource({ id, artifactUrl, bytes }) {
  const artifactSha256 = sha256Hex(bytes);
  return {
    id,
    publisher: "Fixture University",
    sourceName: `${id} reviewed record`,
    sourcePage: "https://example.edu/evidence",
    sourceUrl: artifactUrl,
    artifactUrl,
    artifactSha256,
    artifactKind: "pdf",
    allowedArtifactHosts: ["allowed.example"],
    review: {
      status: "approved",
      reviewedOn: "2026-08-09",
      approvedSha256: artifactSha256,
      method: "manual",
      notes: "The fixture values were manually checked against this artifact.",
    },
    accessedOn: "2026-08-09",
    finality: "finalized",
    publicationStatus: "published",
    revisionStatus: "current when reviewed",
    cohort: "Fall 2025",
    notes: "A hash-bound verification fixture.",
  };
}

function sourcedObservation({
  value,
  unit,
  sourceId,
  status = "reported",
  comparabilityKey,
}) {
  return {
    value,
    unit,
    reportingYear: 2025,
    periodLabel: "Fall 2025",
    finality: "finalized",
    comparabilityKey,
    sourceField: `Fixture field for ${comparabilityKey}`,
    cohort: "Fall 2025 first-time, first-year degree-seeking students",
    definition: `Fixture definition for ${comparabilityKey}`,
    status,
    sourceId,
  };
}

function verifiedMultiSourceDataset() {
  const admissionsBytes = new TextEncoder().encode("%PDF-admissions-fixture");
  const outcomesBytes = new TextEncoder().encode("%PDF-outcomes-fixture");
  const admissionsUrl = "https://allowed.example/admissions.pdf";
  const outcomesUrl = "https://allowed.example/outcomes.pdf";
  const admissionsSourceId = "fixture-admissions";
  const outcomesSourceId = "fixture-outcomes";

  return {
    artifacts: new Map([
      [admissionsUrl, admissionsBytes],
      [outcomesUrl, outcomesBytes],
    ]),
    dataset: {
      sources: [
        reviewedPdfSource({
          id: admissionsSourceId,
          artifactUrl: admissionsUrl,
          bytes: admissionsBytes,
        }),
        reviewedPdfSource({
          id: outcomesSourceId,
          artifactUrl: outcomesUrl,
          bytes: outcomesBytes,
        }),
      ],
      colleges: [
        {
          unitId: 123456,
          sourceId: admissionsSourceId,
          sourceIds: [admissionsSourceId, outcomesSourceId],
          observations: {
            applicants: sourcedObservation({
              value: 1_000,
              unit: "count",
              sourceId: admissionsSourceId,
              comparabilityKey: "admissions.first-year.applicants",
            }),
            admits: sourcedObservation({
              value: 200,
              unit: "count",
              sourceId: admissionsSourceId,
              comparabilityKey: "admissions.first-year.admits",
            }),
            admitRate: sourcedObservation({
              value: 0.2,
              unit: "ratio",
              sourceId: admissionsSourceId,
              status: "derived",
              comparabilityKey: "admissions.first-year.rate",
            }),
            undergraduateEnrollment: sourcedObservation({
              value: 5_000,
              unit: "count",
              sourceId: outcomesSourceId,
              comparabilityKey: "undergraduate-enrollment.total",
            }),
          },
        },
      ],
    },
  };
}

test("accepts a bounded XLSX workbook with the required OOXML entries", () => {
  const bytes = validWorkbookBytes();
  const response = new Response(bytes, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });

  assert.doesNotThrow(() => validateXlsxWorkbook(bytes));
  assert.doesNotThrow(() =>
    validateArtifactResponse(xlsxSource(), response, bytes),
  );
});

test("rejects an arbitrary ZIP that is not an XLSX workbook", () => {
  const bytes = zipSync({ "notes.txt": strToU8("not a workbook") });

  assert.throws(
    () => validateXlsxWorkbook(bytes),
    /missing required entry \[Content_Types\]\.xml/,
  );
});

test("rejects a workbook served with an unapproved MIME type", () => {
  const bytes = validWorkbookBytes();
  const response = new Response(bytes, {
    headers: { "content-type": "application/zip" },
  });

  assert.throws(
    () => validateArtifactResponse(xlsxSource(), response, bytes),
    /expected XLSX MIME type/,
  );
});

test("rejects a redirect host before making the redirected request", async () => {
  const requestedUrls = [];
  const fetchImplementation = async (url, options) => {
    requestedUrls.push(url.href);
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null, {
      status: 302,
      headers: { location: "https://untrusted.example/workbook.xlsx" },
    });
  };

  await assert.rejects(
    fetchArtifactWithRedirectValidation(xlsxSource(), { fetchImplementation }),
    /redirect URL uses non-allowlisted host untrusted\.example/,
  );
  assert.deepEqual(requestedUrls, [
    "https://allowed.example/workbook.xlsx",
  ]);
});

test("independently downloads and fingerprint-checks every source in a multi-artifact overlay", async () => {
  const { artifacts, dataset } = verifiedMultiSourceDataset();
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "college-search-overlays-"),
  );
  const manifestPath = join(temporaryDirectory, "institution-overlays.json");
  await writeFile(manifestPath, `${JSON.stringify(dataset)}\n`);
  const requestedUrls = [];
  const fetchImplementation = async (url) => {
    requestedUrls.push(url.href);
    return new Response(artifacts.get(url.href), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    });
  };

  try {
    const summary = await verifyInstitutionOverlays({
      fetchImplementation,
      path: manifestPath,
    });
    assert.equal(summary.artifactCount, 2);
    assert.equal(summary.multiSourceCollegeCount, 1);
    assert.deepEqual(requestedUrls, [...artifacts.keys()]);

    await assert.rejects(
      verifyInstitutionOverlays({
        path: manifestPath,
        fetchImplementation: async (url) =>
          new Response(
            url.href.endsWith("outcomes.pdf")
              ? new TextEncoder().encode("%PDF-changed-outcomes")
              : artifacts.get(url.href),
            {
              status: 200,
              headers: { "content-type": "application/pdf" },
            },
          ),
      }),
      /Source fixture-outcomes changed: expected [a-f0-9]{64}, received [a-f0-9]{64}/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("records every source failure and preserves the last approved evidence before rejecting", async () => {
  const { dataset } = verifiedMultiSourceDataset();
  const directory = await mkdtemp(join(tmpdir(), "college-search-report-"));
  const manifestPath = join(directory, "overlays.json");
  const reportPath = join(directory, "report.json");
  const checkedAt = "2026-09-13T20:00:00.000Z";
  const requested = [];
  await writeFile(manifestPath, JSON.stringify(dataset));
  try {
    await assert.rejects(verifyInstitutionOverlays({
      path: manifestPath,
      reportPath,
      now: () => checkedAt,
      fetchImplementation: async (url) => {
        requested.push(url.href);
        return url.href.endsWith("admissions.pdf")
          ? new Response(null, { status: 404 })
          : new Response("%PDF-changed", { headers: { "content-type": "application/pdf" } });
      },
    }), /failed for 2 of 2 artifacts/);
    assert.equal(requested.length, 2);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.status, "failed");
    assert.equal(report.checkedAt, checkedAt);
    assert.equal(report.checkKind, "artifact-integrity");
    assert.deepEqual(report.counts, { total: 2, passed: 0, failed: 2, notChecked: 0 });
    assert.equal(report.sources[0].httpStatus, 404);
    assert.equal(report.sources[0].error.stage, "request");
    assert.equal(report.sources[1].error.stage, "fingerprint");
    assert.equal(report.sources[1].actualSha256, sha256Hex(new TextEncoder().encode("%PDF-changed")));
    assert.equal(report.sources[1].lastApprovedEvidence.artifactSha256, dataset.sources[1].artifactSha256);
    assert.equal(report.sources[1].lastApprovedEvidence.reviewedOn, "2026-08-09");
    assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), dataset);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an invalid manifest produces a schema failure report without fetching or approving sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "college-search-report-schema-"));
  const manifestPath = join(directory, "overlays.json");
  const reportPath = join(directory, "report.json");
  await writeFile(manifestPath, "{}");
  try {
    await assert.rejects(verifyInstitutionOverlays({
      path: manifestPath,
      reportPath,
      fetchImplementation: () => assert.fail("invalid manifest must not fetch"),
    }), /needs a sources array/);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.status, "failed");
    assert.equal(report.schemaStatus, "failed");
    assert.equal(report.error.stage, "schema");
    assert.deepEqual(report.sources, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
