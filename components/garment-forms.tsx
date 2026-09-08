"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  CATEGORY_LABELS,
  GARMENT_CATEGORIES,
  type GarmentType,
  type MeasurementField,
} from "@/db/schema";
import {
  addField,
  createGarmentType,
  deleteField,
  deleteGarmentType,
  duplicateGarmentType,
  moveField,
  updateField,
  updateGarmentType,
  type ActionState,
} from "@/app/actions/garments";
import { formatPaise, paiseToInput } from "@/lib/money";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

const CATEGORY_OPTIONS = GARMENT_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

export function NewGarmentTypeForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createGarmentType,
    {},
  );

  return (
    <div className="card p-5">
      <h2 className="mb-3 font-serif text-lg">Add a garment type</h2>
      <FormError message={state.error} />
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1">
          <span className="label">Name</span>
          <input className="field" name="name" placeholder="Nehru jacket" />
        </label>
        <label className="w-48">
          <span className="label">Category</span>
          <select className="field" name="category" defaultValue="other">
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      </form>
      <p className="mt-2 text-xs text-muted">
        You add its measurement fields on the next screen.
      </p>
    </div>
  );
}

export function GarmentTypeForm({ garment }: { garment: GarmentType }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateGarmentType,
    {},
  );
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteGarmentType,
    {},
  );
  const [duplicateState, duplicateAction] = useActionState<ActionState, FormData>(
    duplicateGarmentType,
    {},
  );

  return (
    <div className="card p-5">
      <FormError message={state.error} />
      <FormError message={deleteState.error} />
      <FormError message={duplicateState.error} />

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={garment.id} />
        <label className="min-w-48 flex-1">
          <span className="label">Name</span>
          <input className="field" name="name" defaultValue={garment.name} />
        </label>
        <label className="w-48">
          <span className="label">Category</span>
          <select className="field" name="category" defaultValue={garment.category}>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="w-36">
          <span className="label">Stitching rate ₹</span>
          <input
            className="field tabular-nums"
            name="defaultStitching"
            inputMode="decimal"
            defaultValue={paiseToInput(garment.defaultStitchingPaise)}
          />
        </label>
        <label className="w-36">
          <span className="label">Fabric rate ₹</span>
          <input
            className="field tabular-nums"
            name="defaultFabric"
            inputMode="decimal"
            defaultValue={paiseToInput(garment.defaultFabricPaise)}
          />
        </label>
        <label className="flex items-center gap-2 pb-2.5">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={garment.isActive}
            className="size-4 accent-[#a8842a]"
          />
          <span className="text-sm">Available for new orders</span>
        </label>
        <SubmitButton className="btn-secondary" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </form>

      <p className="mt-2 text-xs text-muted">
        The rates fill in automatically on a new order line, and can still be
        changed there. Raising a rate here never touches an order already
        written — those keep the price they were quoted at.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <form action={duplicateAction}>
          <input type="hidden" name="id" value={garment.id} />
          <SubmitButton className="btn-secondary btn-sm" pendingLabel="Copying…">
            Duplicate with all its fields
          </SubmitButton>
        </form>

        <form action={deleteAction} className="ml-auto">
          <input type="hidden" name="id" value={garment.id} />
          <SubmitButton
            className="btn-danger btn-sm"
            pendingLabel="Removing…"
            confirm={`Delete ${garment.name}? If it has ever been ordered it will be hidden instead, and past orders keep their own copy.`}
          >
            Delete garment type
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export function FieldsEditor({
  garmentTypeId,
  fields,
}: {
  garmentTypeId: number;
  fields: MeasurementField[];
}) {
  const [addState, addAction] = useActionState<ActionState, FormData>(addField, {});
  const [fieldType, setFieldType] = useState("number");

  return (
    <div className="space-y-4">
      <div className="card divide-y divide-line">
        {fields.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            No fields yet. Add the first one below.
          </p>
        ) : (
          fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              garmentTypeId={garmentTypeId}
              isFirst={index === 0}
              isLast={index === fields.length - 1}
            />
          ))
        )}
      </div>
      {fields.length > 1 ? (
        <p className="text-xs text-muted">
          The order here is the order the fields appear when measuring and on
          the printed cutting card. Use ↑ ↓ to arrange them the way Arsu
          actually measures.
        </p>
      ) : null}

      <div className="card p-5">
        <h3 className="mb-3 font-serif text-lg">Add a field</h3>
        <FormError message={addState.error} />
        <form action={addAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="garmentTypeId" value={garmentTypeId} />

          <label className="block">
            <span className="label">Label</span>
            <input className="field" name="label" placeholder="Cross Back" />
          </label>

          <label className="block">
            <span className="label">Type</span>
            <select
              className="field"
              name="fieldType"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value)}
            >
              <option value="number">Measurement</option>
              <option value="text">Free text</option>
              <option value="choice">Choice</option>
            </select>
          </label>

          {fieldType === "choice" ? (
            <label className="block lg:col-span-2">
              <span className="label">Options</span>
              <input
                className="field"
                name="choices"
                placeholder="None, Single, Double"
              />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="label">Unit</span>
                <input className="field" name="unit" defaultValue="in" />
              </label>
              <label className="block">
                <span className="label">Hint</span>
                <input className="field" name="hint" placeholder="Optional" />
              </label>
            </>
          )}

          <div className="flex items-end">
            <SubmitButton className="btn-secondary" pendingLabel="Adding…">
              Add field
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  garmentTypeId,
  isFirst,
  isLast,
}: {
  field: MeasurementField;
  garmentTypeId: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [saveState, saveAction] = useActionState<ActionState, FormData>(
    updateField,
    {},
  );
  const [, removeAction] = useActionState<ActionState, FormData>(deleteField, {});
  const [, moveAction] = useActionState<ActionState, FormData>(moveField, {});

  /* Local so the row swaps between a unit box and an options box the moment
     the type changes, without a round trip. */
  const [fieldType, setFieldType] = useState<string>(field.fieldType);

  const existingChoices: string[] = (() => {
    if (!field.choices) return [];
    try {
      const parsed = JSON.parse(field.choices);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div className="p-3">
      <FormError message={saveState.error} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1 pb-1">
          <MoveButton
            action={moveAction}
            field={field}
            garmentTypeId={garmentTypeId}
            direction="up"
            disabled={isFirst}
          />
          <MoveButton
            action={moveAction}
            field={field}
            garmentTypeId={garmentTypeId}
            direction="down"
            disabled={isLast}
          />
        </div>

        <form
          action={saveAction}
          className="flex flex-1 flex-wrap items-end gap-2"
        >
          <input type="hidden" name="id" value={field.id} />
          <input type="hidden" name="garmentTypeId" value={garmentTypeId} />

          <label className="min-w-36 flex-1">
            <span className="label">Label</span>
            <input className="field" name="label" defaultValue={field.label} />
          </label>

          <label className="w-36">
            <span className="label">Type</span>
            <select
              className="field"
              name="fieldType"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value)}
            >
              <option value="number">Measurement</option>
              <option value="text">Free text</option>
              <option value="choice">Choice</option>
            </select>
          </label>

          {fieldType === "choice" ? (
            <label className="min-w-44 flex-1">
              <span className="label">Options (comma separated)</span>
              <input
                className="field"
                name="choices"
                defaultValue={existingChoices.join(", ")}
                placeholder="None, Single, Double"
              />
            </label>
          ) : (
            <>
              <label className="w-20">
                <span className="label">Unit</span>
                <input className="field" name="unit" defaultValue={field.unit} />
              </label>
              <label className="min-w-36 flex-1">
                <span className="label">Hint</span>
                <input
                  className="field"
                  name="hint"
                  defaultValue={field.hint ?? ""}
                  placeholder="Optional"
                />
              </label>
            </>
          )}

          <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
            Save
          </SubmitButton>
        </form>

        <form action={removeAction} className="pb-1">
          <input type="hidden" name="id" value={field.id} />
          <input type="hidden" name="garmentTypeId" value={garmentTypeId} />
          <SubmitButton
            className="btn-danger btn-sm"
            pendingLabel="…"
            confirm={`Delete "${field.label}"? Orders already placed keep their own copy of this measurement, so nothing already cut is affected.`}
          >
            Delete
          </SubmitButton>
        </form>
      </div>

      <code className="mt-1 block text-xs text-muted">{field.code}</code>
    </div>
  );
}

function MoveButton({
  action,
  field,
  garmentTypeId,
  direction,
  disabled,
}: {
  action: (payload: FormData) => void;
  field: MeasurementField;
  garmentTypeId: number;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={field.id} />
      <input type="hidden" name="garmentTypeId" value={garmentTypeId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${field.label} ${direction}`}
        className="btn btn-sm min-h-9 w-9 border border-line bg-white px-0 text-ink hover:border-gold disabled:opacity-30"
      >
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

export function GarmentTypeList({
  garments,
}: {
  garments: (GarmentType & { fieldCount: number })[];
}) {
  return (
    <div className="card divide-y divide-line">
      {garments.map((garment) => (
        <Link
          key={garment.id}
          href={`/settings/garments/${garment.id}`}
          className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-bone"
        >
          <span className="font-medium">{garment.name}</span>
          <span className="chip bg-line/60 text-ink-2">
            {CATEGORY_LABELS[garment.category]}
          </span>
          {!garment.isActive ? (
            <span className="chip bg-danger-soft text-danger">Hidden</span>
          ) : null}
          <span className="ml-auto text-sm text-muted">
            {garment.defaultStitchingPaise > 0 ? (
              <span className="tabular-nums">
                {formatPaise(garment.defaultStitchingPaise)}
                {garment.defaultFabricPaise > 0
                  ? ` + ${formatPaise(garment.defaultFabricPaise)} cloth`
                  : ""}
              </span>
            ) : (
              <span className="text-gold">No rate set</span>
            )}
          </span>
          <span className="w-20 shrink-0 text-right text-sm text-muted">
            {garment.fieldCount} field{garment.fieldCount === 1 ? "" : "s"}
          </span>
        </Link>
      ))}
    </div>
  );
}
