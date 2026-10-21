"use client";

import { useActionState } from "react";
import type { OrderItemMeasurement } from "@/db/schema";
import {
  removeOrderItem,
  saveItemMeasurementsToClient,
  updateOrderItem,
  type ActionState,
} from "@/app/actions/orders";
import { paiseToInput } from "@/lib/money";
import { SubmitButton } from "@/components/forms";
import { FormError, Money } from "@/components/ui";

export type ItemForCard = {
  id: number;
  garmentLabel: string;
  quantity: number;
  fabricSource: "shop" | "client";
  fabricNotes: string | null;
  itemNotes: string | null;
  stitchingRatePaise: number;
  fabricRatePaise: number;
  lineTotalPaise: number;
  tailorId: number | null;
  /* What kind of thing this is, from the live type - see lib/orders.ts. Only
     decides which controls to draw. */
  category: string | null;
  /* The snapshot, plus the live field definition for drawing the input. See
     the note in lib/orders.ts: the value is history, the dropdown is not. */
  measurements: (OrderItemMeasurement & {
    fieldType: string | null;
    choices: string | null;
    groupName: string | null;
  })[];
};

/** Choices are stored as a JSON array; a hand-edited one degrades to a text box. */
function parseChoiceList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function OrderItemCard({
  orderId,
  item,
  index,
  tailors,
}: {
  orderId: number;
  item: ItemForCard;
  index: number;
  tailors: { id: number; name: string }[];
}) {
  const numbers = item.measurements.filter((m) => m.groupName !== "Style");
  const styleFields = item.measurements.filter((m) => m.groupName === "Style");

  /* A tie is sold, not stitched. It has no measurements, no fabric, nobody
     assigned to make it and no cutting instructions - so it gets a quantity,
     a price and a note, and none of the other seven controls. Leaving them on
     screen invited somebody to set a fabric source for a pocket square.
  
     Omitting the inputs is safe rather than destructive: updateOrderItem
     reads a missing fabric rate as 0, a missing source as the client's own
     and a missing tailor as unassigned, which is the truth about a tie. */
  const sold = item.category === "accessory";

  const [state, formAction] = useActionState<ActionState, FormData>(
    updateOrderItem,
    {},
  );
  const [, removeAction] = useActionState<ActionState, FormData>(
    removeOrderItem,
    {},
  );
  const [saveState, saveAction] = useActionState<ActionState, FormData>(
    saveItemMeasurementsToClient,
    {},
  );

  const blanks = item.measurements.filter((m) => m.valueText.trim() === "").length;

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg">
          <span className="text-muted">{index + 1}.</span> {item.garmentLabel}
          {item.quantity > 1 ? (
            <span className="text-muted"> ×{item.quantity}</span>
          ) : null}
        </h3>
        <div className="flex items-center gap-3">
          {blanks > 0 ? (
            <span className="chip bg-danger-soft text-danger">
              {blanks} measurement{blanks === 1 ? "" : "s"} blank
            </span>
          ) : null}
          <span className="text-sm text-muted">
            Line total <Money paise={item.lineTotalPaise} className="text-ink" />
          </span>
        </div>
      </div>

      <FormError message={state.error} />
      <FormError message={saveState.error} />

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="itemId" value={item.id} />

        {item.measurements.length > 0 ? (
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Cutting card
              </h4>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {numbers.map((m) => (
                  <label key={m.id} className="block">
                    <span className="mb-1 block text-xs text-ink-2">
                      {m.fieldLabel}
                      {m.unit ? <span className="text-muted"> ({m.unit})</span> : null}
                    </span>
                    <input
                      className={`field tabular-nums ${
                        m.valueText.trim() === "" ? "border-danger/40 bg-danger-soft/40" : ""
                      }`}
                      name={`m_${m.id}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      defaultValue={m.valueText}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Style sits apart from the numbers because it is a different
                kind of thing: not the client's body but what he wants made
                this time. Blank is normal here, so no red boxes. */}
            {styleFields.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  Pockets, cuffs and the rest
                </h4>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {styleFields.map((m) => {
                    const options = parseChoiceList(m.choices);
                    return (
                      <label key={m.id} className="block">
                        <span className="mb-1 block text-xs text-ink-2">
                          {m.fieldLabel}
                        </span>
                        {options.length > 0 ? (
                          <select
                            className="field"
                            name={`m_${m.id}`}
                            defaultValue={m.valueText}
                          >
                            <option value="">—</option>
                            {options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="field"
                            name={`m_${m.id}`}
                            type="text"
                            autoComplete="off"
                            defaultValue={m.valueText}
                          />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : sold ? null : (
          <p className="text-sm text-muted">
            This garment type has no measurement fields configured.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">Quantity</span>
            <input
              className="field tabular-nums"
              name="quantity"
              type="number"
              min={1}
              defaultValue={item.quantity}
            />
          </label>
          <label className="block">
            <span className="label">{sold ? "Price (₹ each)" : "Stitching (₹ each)"}</span>
            <input
              className="field tabular-nums"
              name="stitchingRate"
              type="text"
              inputMode="decimal"
              defaultValue={paiseToInput(item.stitchingRatePaise)}
            />
          </label>
          {sold ? null : (
            <>
              <label className="block">
                <span className="label">Fabric (₹ each)</span>
                <input
                  className="field tabular-nums"
                  name="fabricRate"
                  type="text"
                  inputMode="decimal"
                  defaultValue={paiseToInput(item.fabricRatePaise)}
                />
              </label>
              <label className="block">
                <span className="label">Fabric from</span>
                <select
                  className="field"
                  name="fabricSource"
                  defaultValue={item.fabricSource}
                >
                  <option value="client">Client&rsquo;s own</option>
                  <option value="shop">Shop</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {sold ? null : (
            <>
              <label className="block">
                <span className="label">Made by</span>
                <select
                  className="field"
                  name="tailorId"
                  defaultValue={item.tailorId ? String(item.tailorId) : ""}
                >
                  <option value="">Not assigned</option>
                  {tailors.map((tailor) => (
                    <option key={tailor.id} value={tailor.id}>
                      {tailor.name}
                    </option>
                  ))}
                  {/* A garment assigned to someone since made inactive keeps
                      showing them, so the record does not silently blank. */}
                  {item.tailorId &&
                  !tailors.some((t) => t.id === item.tailorId) ? (
                    <option value={item.tailorId}>(previously assigned)</option>
                  ) : null}
                </select>
              </label>

              <label className="block">
                <span className="label">Fabric notes</span>
                <input
                  className="field"
                  name="fabricNotes"
                  defaultValue={item.fabricNotes ?? ""}
                  placeholder="Navy wool, 3.2m"
                />
              </label>
            </>
          )}
          <label className="block">
            <span className="label">{sold ? "Notes" : "Garment notes"}</span>
            <input
              className="field"
              name="itemNotes"
              defaultValue={item.itemNotes ?? ""}
              placeholder={sold ? "Navy silk, striped" : "Working cuffs, no vent"}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving…">
            {sold ? "Save" : "Save garment"}
          </SubmitButton>
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* Nothing to copy to a profile when there are no measurements. */}
        <form action={saveAction} className={sold ? "hidden" : undefined}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="itemId" value={item.id} />
          <SubmitButton
            className="btn-secondary btn-sm"
            pendingLabel="Saving…"
            confirm="Save these measurements to the client's profile as a new dated record?"
          >
            Save to client&rsquo;s profile
          </SubmitButton>
        </form>

        <form action={removeAction} className="ml-auto">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="itemId" value={item.id} />
          <SubmitButton
            className="btn-danger btn-sm"
            pendingLabel="Removing…"
            confirm={`Remove ${item.garmentLabel} from this order?`}
          >
            Remove
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
