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
  measurements: OrderItemMeasurement[];
};

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
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Cutting card
            </h4>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {item.measurements.map((m) => (
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
        ) : (
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
            <span className="label">Stitching (₹ each)</span>
            <input
              className="field tabular-nums"
              name="stitchingRate"
              type="text"
              inputMode="decimal"
              defaultValue={paiseToInput(item.stitchingRatePaise)}
            />
          </label>
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
            <select className="field" name="fabricSource" defaultValue={item.fabricSource}>
              <option value="client">Client&rsquo;s own</option>
              <option value="shop">Shop</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
              {item.tailorId && !tailors.some((t) => t.id === item.tailorId) ? (
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
          <label className="block">
            <span className="label">Garment notes</span>
            <input
              className="field"
              name="itemNotes"
              defaultValue={item.itemNotes ?? ""}
              placeholder="Working cuffs, no vent"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Saving…">
            Save garment
          </SubmitButton>
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form action={saveAction}>
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
