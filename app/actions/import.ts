"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  garmentTypes,
  measurementSets,
  measurementValues,
} from "@/db/schema";
import { getFieldsFor } from "@/lib/measurements";
import { parseMeasurement } from "@/lib/measure";
import { normaliseHeader, parseCsv } from "@/lib/csv";
import { HEADER_GUESSES, type ImportField } from "@/lib/import-fields";
import { today } from "@/lib/format";

/* Importing the shop's existing spreadsheet.
 *
 * This is deliberately a two-step flow — analyse, then import — because I have
 * never seen Arsu's actual file. Column names, ordering and which measurements
 * he records are all unknown, so the app reads the headers, guesses a mapping,
 * shows what it is about to do, and lets a person correct it before a single
 * row is written. An importer that guessed silently would be worse than none.
 *
 * CSV rather than .xlsx: Excel saves CSV natively (File → Save As), and
 * reading the binary .xlsx format would mean adding a parser dependency.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 5000;

export type AnalyseState = {
  error?: string;
  headers?: string[];
  sample?: string[][];
  rowCount?: number;
  csv?: string;
  suggested?: Partial<Record<ImportField, number>>;
  /** garment field label -> column index, for measurement columns. */
  measurementMatches?: { label: string; column: string }[];
  garmentTypeId?: number;
};

export async function analyseCsv(
  _prev: AnalyseState,
  formData: FormData,
): Promise<AnalyseState> {
  const pasted = String(formData.get("csv") ?? "");
  const file = formData.get("file");

  let text = pasted;
  if (!text.trim() && file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return { error: "That file is over 4 MB. Split it and import in parts." };
    }
    text = await file.text();
  }

  if (!text.trim()) return { error: "Paste the CSV or choose a file" };

  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { error: "That looks like a header row with no data under it" };
  }
  if (rows.length - 1 > MAX_ROWS) {
    return { error: `That is ${rows.length - 1} rows. Import at most ${MAX_ROWS} at a time.` };
  }

  const headers = rows[0].map((h) => h.trim());
  const normalised = headers.map(normaliseHeader);

  const suggested: Partial<Record<ImportField, number>> = {};
  for (const [field, candidates] of Object.entries(HEADER_GUESSES) as [
    ImportField,
    string[],
  ][]) {
    const index = normalised.findIndex((h) => candidates.includes(h));
    if (index >= 0) suggested[field] = index;
  }

  const garmentTypeId = Number(formData.get("garmentTypeId")) || 0;
  let measurementMatches: { label: string; column: string }[] | undefined;

  if (garmentTypeId > 0) {
    const fields = getFieldsFor(garmentTypeId);
    measurementMatches = [];
    for (const field of fields) {
      const index = normalised.findIndex(
        (h) => h === normaliseHeader(field.label) || h === normaliseHeader(field.code),
      );
      if (index >= 0) {
        measurementMatches.push({ label: field.label, column: headers[index] });
      }
    }
  }

  return {
    headers,
    sample: rows.slice(1, 6),
    rowCount: rows.length - 1,
    csv: text,
    suggested,
    measurementMatches,
    garmentTypeId: garmentTypeId || undefined,
  };
}

export type ImportResult = {
  error?: string;
  message?: string;
  created?: number;
  skipped?: number;
  measurementsCreated?: number;
  problems?: string[];
};

export async function importClients(
  _prev: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  const text = String(formData.get("csv") ?? "");
  if (!text.trim()) return { error: "Nothing to import — analyse a file first" };

  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "No data rows found" };

  const headers = rows[0].map((h) => h.trim());
  const normalised = headers.map(normaliseHeader);

  const column = (field: ImportField): number => {
    const raw = String(formData.get(`map_${field}`) ?? "");
    const index = Number(raw);
    return raw !== "" && Number.isFinite(index) && index >= 0 ? index : -1;
  };

  const nameCol = column("name");
  const phoneCol = column("phone");
  if (nameCol < 0) return { error: "Choose which column holds the name" };
  if (phoneCol < 0) return { error: "Choose which column holds the phone number" };

  const garmentTypeId = Number(formData.get("garmentTypeId")) || 0;
  const garment =
    garmentTypeId > 0
      ? db.select().from(garmentTypes).where(eq(garmentTypes.id, garmentTypeId)).get()
      : null;

  /* Measurement columns are matched by header name against this garment's
     field labels and codes. Anything unmatched is simply left alone rather
     than guessed at. */
  const measurementColumns: { fieldId: number; index: number }[] = [];
  if (garment) {
    for (const field of getFieldsFor(garment.id)) {
      const index = normalised.findIndex(
        (h) => h === normaliseHeader(field.label) || h === normaliseHeader(field.code),
      );
      if (index >= 0) measurementColumns.push({ fieldId: field.id, index });
    }
  }

  const cell = (row: string[], index: number) =>
    index >= 0 ? (row[index] ?? "").trim() : "";

  let created = 0;
  let skipped = 0;
  let measurementsCreated = 0;
  const problems: string[] = [];

  db.transaction((tx) => {
    for (const [offset, row] of rows.slice(1).entries()) {
      const lineNo = offset + 2; // 1-based, plus the header
      const name = cell(row, nameCol);
      const phone = cell(row, phoneCol);

      if (!name) {
        problems.push(`Row ${lineNo}: no name — skipped`);
        skipped += 1;
        continue;
      }
      if (!phone) {
        problems.push(`Row ${lineNo}: "${name}" has no phone — skipped`);
        skipped += 1;
        continue;
      }

      /* Same name AND same phone is the same person being imported twice.
         Same phone with a different name is a family sharing a number, which
         is normal and must not be treated as a duplicate. */
      const existing = tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.name, name), eq(clients.phone, phone)))
        .get();

      if (existing) {
        skipped += 1;
        continue;
      }

      const client = tx
        .insert(clients)
        .values({
          name,
          phone,
          altPhone: cell(row, column("altPhone")) || null,
          address: cell(row, column("address")) || null,
          email: cell(row, column("email")) || null,
          notes: cell(row, column("notes")) || null,
        })
        .returning({ id: clients.id })
        .get();

      created += 1;

      if (garment && measurementColumns.length > 0) {
        const values = measurementColumns
          .map(({ fieldId, index }) => {
            const { text: valueText, num } = parseMeasurement(cell(row, index));
            if (valueText === "") return null;
            return { fieldId, valueText, valueNum: num };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null);

        if (values.length > 0) {
          const set = tx
            .insert(measurementSets)
            .values({
              clientId: client.id,
              garmentTypeId: garment.id,
              takenOn: today(),
              notes: "Imported from spreadsheet",
            })
            .returning({ id: measurementSets.id })
            .get();

          tx.insert(measurementValues)
            .values(values.map((v) => ({ ...v, setId: set.id })))
            .run();

          measurementsCreated += 1;
        }
      }
    }
  });

  revalidatePath("/clients");
  revalidatePath("/");

  return {
    created,
    skipped,
    measurementsCreated,
    problems: problems.slice(0, 20),
    message:
      `Imported ${created} client${created === 1 ? "" : "s"}` +
      (measurementsCreated
        ? `, with ${measurementsCreated} measurement set${measurementsCreated === 1 ? "" : "s"}`
        : "") +
      (skipped ? `. Skipped ${skipped} (already present or incomplete).` : "."),
  };
}
