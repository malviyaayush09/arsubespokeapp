"use client";

import { useActionState } from "react";
import {
  addOrderItem,
  updateOrderMeta,
  type ActionState,
} from "@/app/actions/orders";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";
import {
  CATEGORY_LABELS,
  GARMENT_CATEGORIES,
  type GarmentCategory,
} from "@/db/schema";

export function AddGarmentForm({
  orderId,
  garments,
}: {
  orderId: number;
  garments: { id: number; name: string; category: GarmentCategory }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    addOrderItem,
    {},
  );

  /* Grouped, because this list is now thirty rows: fifteen garments and
     fifteen things sold alongside them. A tie is most often added here rather
     than at the counter - the client picks one at the trial, with the suit in
     front of him - so it has to be findable without reading every line. */
  const byCategory = GARMENT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    list: garments.filter((g) => g.category === category),
  })).filter((section) => section.list.length > 0);

  return (
    <div className="card p-4">
      <FormError message={state.error} />
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="orderId" value={orderId} />
        <label className="min-w-48 flex-1">
          <span className="label">Add a garment or something with it</span>
          <select className="field" name="garmentTypeId" defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {byCategory.map((section) => (
              <optgroup key={section.category} label={section.label}>
                {section.list.map((garment) => (
                  <option key={garment.id} value={garment.id}>
                    {garment.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <SubmitButton className="btn-secondary" pendingLabel="Adding…">
          Add
        </SubmitButton>
      </form>
      <p className="mt-1 text-xs text-muted">
        Saved measurements for this client come across automatically. A tie or a
        pocket square has none — just a price.
      </p>
    </div>
  );
}

export function OrderMetaForm({
  orderId,
  orderNo,
  orderDate,
  trialDate,
  promisedDate,
  internalNotes,
}: {
  orderId: number;
  orderNo: string;
  orderDate: string;
  trialDate: string | null;
  promisedDate: string | null;
  internalNotes: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateOrderMeta,
    {},
  );

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
        Number, dates &amp; internal notes
      </h2>
      <FormError message={state.error} />
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="orderId" value={orderId} />
        <label className="block sm:max-w-[14rem]">
          <span className="label">Order number</span>
          <input
            className="field font-mono"
            type="text"
            name="orderNo"
            defaultValue={orderNo}
            maxLength={40}
          />
          <span className="mt-1 block text-xs text-muted">
            Changing this does not change paper already printed.
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Order date</span>
            <input
              className="field"
              type="date"
              name="orderDate"
              defaultValue={orderDate}
            />
          </label>
          {/* A trial is its own appointment and its own row on his sheet.
              Leaving it off sent him back to paper for the one date he must
              not forget. */}
          <label className="block">
            <span className="label">Trial date</span>
            <input
              className="field"
              type="date"
              name="trialDate"
              defaultValue={trialDate ?? ""}
            />
          </label>
          <label className="block">
            <span className="label">Delivery date</span>
            <input
              className="field"
              type="date"
              name="promisedDate"
              defaultValue={promisedDate ?? ""}
            />
          </label>
        </div>
        <label className="block">
          <span className="label">Internal notes</span>
          <textarea
            className="field"
            name="internalNotes"
            rows={2}
            defaultValue={internalNotes ?? ""}
            placeholder="Shop-only — never printed on the client's copy."
          />
        </label>
        <SubmitButton className="btn-secondary btn-sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </form>
    </div>
  );
}
