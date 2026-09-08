"use client";

import { useActionState } from "react";
import {
  analyseCsv,
  importClients,
  type AnalyseState,
  type ImportResult,
} from "@/app/actions/import";
import { IMPORT_FIELDS } from "@/lib/import-fields";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export function ImportForm({
  garments,
}: {
  garments: { id: number; name: string }[];
}) {
  const [analysis, analyseAction] = useActionState<AnalyseState, FormData>(
    analyseCsv,
    {},
  );
  const [result, importAction] = useActionState<ImportResult, FormData>(
    importClients,
    {},
  );

  const ready = Boolean(analysis.headers && analysis.csv);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="font-serif text-lg">1. Choose the file</h2>
        <p className="mt-1 text-sm text-muted">
          In Excel: <strong>File → Save As → CSV (Comma delimited)</strong>. Then
          pick that file here, or paste the contents below. Nothing is written
          until you confirm on the next step.
        </p>

        <FormError message={analysis.error} />

        <form action={analyseAction} className="mt-3 space-y-3">
          <label className="block">
            <span className="label">CSV file</span>
            <input
              className="field"
              type="file"
              name="file"
              accept=".csv,text/csv,text/plain"
            />
          </label>

          <label className="block">
            <span className="label">…or paste it</span>
            <textarea
              className="field font-mono text-xs"
              name="csv"
              rows={5}
              /* Deliberately an unusable number. A format-valid Indian mobile
                 sitting in a live app's placeholder is somebody's real number. */
              placeholder="Name,Phone,Address&#10;A. Kumar,90000 00000,Jayanagar"
            />
          </label>

          <label className="block max-w-sm">
            <span className="label">
              Do these rows also hold measurements? (optional)
            </span>
            <select className="field" name="garmentTypeId" defaultValue="">
              <option value="">No — clients only</option>
              {garments.map((g) => (
                <option key={g.id} value={g.id}>
                  Yes, for {g.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">
              Columns whose heading matches a field name for that garment
              (Chest, Waist, Sleeve Length…) will be read as measurements.
            </span>
          </label>

          <SubmitButton className="btn-secondary" pendingLabel="Reading…">
            Read the file
          </SubmitButton>
        </form>
      </div>

      {ready ? (
        <form action={importAction} className="card space-y-4 p-5">
          <input type="hidden" name="csv" value={analysis.csv} />
          {analysis.garmentTypeId ? (
            <input
              type="hidden"
              name="garmentTypeId"
              value={analysis.garmentTypeId}
            />
          ) : null}

          <div>
            <h2 className="font-serif text-lg">2. Check the columns</h2>
            <p className="mt-1 text-sm text-muted">
              {analysis.rowCount} row{analysis.rowCount === 1 ? "" : "s"} found.
              I have guessed the mapping from your headings — correct anything
              that is wrong.
            </p>
          </div>

          <FormError message={result.error} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="label">
                  {field.label}
                  {field.required ? <span className="text-danger"> *</span> : null}
                </span>
                <select
                  className="field"
                  name={`map_${field.key}`}
                  defaultValue={
                    analysis.suggested?.[field.key] !== undefined
                      ? String(analysis.suggested[field.key])
                      : ""
                  }
                >
                  <option value="">— not in this file —</option>
                  {analysis.headers!.map((header, index) => (
                    <option key={index} value={index}>
                      {header || `(column ${index + 1})`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {analysis.measurementMatches &&
          analysis.measurementMatches.length > 0 ? (
            <div className="rounded-md border border-good/25 bg-good-soft px-3 py-2 text-sm text-good">
              Measurement columns recognised:{" "}
              {analysis.measurementMatches
                .map((m) => `${m.column} → ${m.label}`)
                .join(", ")}
            </div>
          ) : analysis.garmentTypeId ? (
            <div className="rounded-md border border-gold/30 bg-gold-soft px-3 py-2 text-sm text-gold">
              No column headings matched that garment&rsquo;s measurement
              fields. Clients will import; measurements will not. Renaming the
              spreadsheet headings to match the field names would fix it.
            </div>
          ) : null}

          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              First few rows
            </h3>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bone">
                    {analysis.headers!.map((header, index) => (
                      <th key={index} className="px-2 py-1.5 text-left font-semibold">
                        {header || `(col ${index + 1})`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.sample!.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {analysis.headers!.map((_, colIndex) => (
                        <td
                          key={colIndex}
                          className="border-t border-line px-2 py-1.5 whitespace-nowrap"
                        >
                          {row[colIndex] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted">
            A row is skipped when it has no name or no phone, and when a client
            with that exact name <em>and</em> phone already exists. Two people
            sharing a phone number are treated as two people, because families
            do share one.
          </p>

          <SubmitButton pendingLabel="Importing…">
            Import {analysis.rowCount} row{analysis.rowCount === 1 ? "" : "s"}
          </SubmitButton>
        </form>
      ) : null}

      {result.message ? (
        <div className="card p-5">
          <h2 className="font-serif text-lg">Done</h2>
          <p className="mt-1 text-sm text-good">{result.message}</p>
          {result.problems && result.problems.length > 0 ? (
            <>
              <h3 className="mt-3 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                Rows that need a look
              </h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                {result.problems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
