/* CSV in and out, hand-written.
 *
 * No dependency for this on purpose. Excel reads and writes CSV natively, so
 * "import his Excel" is File → Save As → CSV, and export opens straight back
 * into Excel. Reading .xlsx binaries directly would mean adding a parser
 * library, which is a decision for Ayush rather than a default. */

/**
 * Parses CSV including quoted fields, escaped quotes ("" inside a quoted
 * field), embedded newlines and commas, and both CRLF and LF line endings.
 * Returns rows of raw strings; blank trailing lines are dropped.
 */
export function parseCsv(input: string): string[][] {
  /* Strip a UTF-8 BOM. Excel writes one, and left in place it becomes part of
     the first header cell, so "Name" silently stops matching. */
  const text = input.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // handled by the \n that follows
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Wraps a cell only when it needs it, and doubles any inner quotes. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Serialises rows to CSV with a UTF-8 BOM and CRLF endings — both are what
 * Excel on Windows expects. Without the BOM, Indian names with non-ASCII
 * characters open as mojibake.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Loose header matching, so "Client Name", "client_name" and "NAME" all hit. */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}
