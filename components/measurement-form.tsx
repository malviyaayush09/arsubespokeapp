"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { MeasurementField } from "@/db/schema";
import {
  saveMeasurementSet,
  type ActionState,
} from "@/app/actions/measurements";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export type FieldWithChoices = MeasurementField & { choiceList: string[] };

export function MeasurementForm({
  clientId,
  garmentTypeId,
  garmentName,
  fields,
  setId,
  takenOn,
  notes,
  values,
}: {
  clientId: number;
  garmentTypeId: number;
  garmentName: string;
  fields: FieldWithChoices[];
  setId?: number;
  takenOn: string;
  notes?: string | null;
  values?: Record<number, string>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveMeasurementSet,
    {},
  );

  const measurements = fields.filter((f) => f.fieldType !== "choice");
  const styles = fields.filter((f) => f.fieldType === "choice");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="garmentTypeId" value={garmentTypeId} />
      {setId ? <input type="hidden" name="setId" value={setId} /> : null}

      <FormError message={state.error} />

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-serif text-xl">{garmentName}</h2>
          <label className="block">
            <span className="label">Date measured</span>
            <input
              className="field"
              type="date"
              name="takenOn"
              defaultValue={takenOn}
            />
          </label>
        </div>

        {measurements.length === 0 ? (
          <p className="text-sm text-muted">
            This garment type has no measurement fields yet. Add some in
            Settings → Garment types.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {measurements.map((field) => (
              <label key={field.id} className="block">
                <span className="label">
                  {field.label}
                  {field.unit ? (
                    <span className="font-normal text-muted"> ({field.unit})</span>
                  ) : null}
                </span>
                <input
                  className="field tabular-nums"
                  name={`m_${field.id}`}
                  /* Deliberately type=text, not number: 15½ and 15 1/2 are how
                     these get written, and a number input rejects both. */
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={values?.[field.id] ?? ""}
                  placeholder={field.hint ?? ""}
                />
                {field.hint ? (
                  <span className="mt-1 block text-xs text-muted">{field.hint}</span>
                ) : null}
              </label>
            ))}
          </div>
        )}

        {styles.length > 0 ? (
          <>
            <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Style
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {styles.map((field) => (
                <label key={field.id} className="block">
                  <span className="label">{field.label}</span>
                  <select
                    className="field"
                    name={`m_${field.id}`}
                    defaultValue={values?.[field.id] ?? ""}
                  >
                    <option value="">—</option>
                    {field.choiceList.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        ) : null}

        <label className="mt-6 block">
          <span className="label">Notes</span>
          <textarea
            className="field"
            name="notes"
            rows={2}
            defaultValue={notes ?? ""}
            placeholder="Fit preferences, what changed since last time…"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">
          {setId ? "Save changes" : "Save measurements"}
        </SubmitButton>
        <Link href={`/clients/${clientId}`} className="btn-secondary">
          Cancel
        </Link>
      </div>

      <p className="text-xs text-muted">
        Saving creates a dated record. Past orders keep their own copy of the
        numbers they were cut to, so nothing already made is affected.
      </p>
    </form>
  );
}
