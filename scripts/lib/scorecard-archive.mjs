import { createHash } from "node:crypto";
import { unzipSync } from "fflate";

/** RFC-style CSV records; preserves embedded commas, escaped quotes and newlines. */
export function* csvRecords(text) {
  let row = [], cell = "", quoted = false, closedQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (character === '"') { quoted = false; closedQuote = true; }
      else cell += character;
    } else if (character === '"') {
      if (cell || closedQuote) throw new Error("Unexpected quote in Scorecard CSV.");
      quoted = true;
    }
    else if (character === ",") { row.push(cell); cell = ""; closedQuote = false; }
    else if (character === "\n" || character === "\r") {
      row.push(cell); if (row.some(Boolean)) yield row;
      row = []; cell = ""; closedQuote = false;
      if (character === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      if (closedQuote) throw new Error("Unexpected character after a quoted Scorecard field.");
      cell += character;
    }
  }
  if (quoted) throw new Error("Unterminated quoted field in Scorecard CSV.");
  if (row.length || cell.length) { row.push(cell); yield row; }
}

export function readScorecardArchive(bytes, expectedSha256, fields) {
  if (!Array.isArray(fields) || !fields.includes("UNITID") || new Set(fields).size !== fields.length) throw new Error("Scorecard fields must be unique and include UNITID.");
  if (bytes.byteLength > 250 * 1024 * 1024) throw new Error("Scorecard ZIP exceeds safety limit.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== expectedSha256) throw new Error("Scorecard archive does not match the reviewed release hash.");
  let entries = 0;
  const archive = unzipSync(bytes, { filter: ({ name, originalSize }) => {
    const matches = name.endsWith("Most-Recent-Cohorts-Institution.csv") && !name.startsWith("__MACOSX/");
    if (matches && (++entries > 1 || originalSize > 250 * 1024 * 1024)) throw new Error("Ambiguous or oversized Scorecard CSV.");
    return matches;
  } });
  if (entries !== 1) throw new Error("Expected exactly one Scorecard institution CSV.");
  const records = csvRecords(new TextDecoder("utf-8", { fatal: true }).decode(Object.values(archive)[0]));
  const headers = records.next().value;
  if (!headers?.length) throw new Error("Scorecard CSV is empty.");
  headers[0] = headers[0].replace(/^\uFEFF/, "");
  if (new Set(headers).size !== headers.length) throw new Error("Duplicate Scorecard CSV headers.");
  const indexes = fields.map((field) => {
    const index = headers.indexOf(field);
    if (index < 0) throw new Error(`Scorecard release lacks ${field}.`);
    return index;
  });
  const rows = [], ids = new Set();
  for (const record of records) {
    if (record.length !== headers.length) throw new Error("Scorecard record column count differs from its header.");
    const row = Object.fromEntries(fields.map((field, index) => [field, record[indexes[index]]]));
    if (!/^[1-9]\d*$/.test(row.UNITID) || !Number.isSafeInteger(Number(row.UNITID))) throw new Error("Invalid source UNITID.");
    if (ids.has(row.UNITID)) throw new Error(`Duplicate source UNITID ${row.UNITID}.`);
    ids.add(row.UNITID); rows.push(row);
  }
  return { rows, sha256 };
}
