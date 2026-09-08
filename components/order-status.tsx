"use client";

import { useActionState } from "react";
import { STATUS_FLOW, STATUS_LABELS, type OrderStatus } from "@/db/schema";
import { setOrderStatus, type ActionState } from "@/app/actions/orders";
import { FormError } from "@/components/ui";

export function OrderStatusBar({
  orderId,
  status,
}: {
  orderId: number;
  status: OrderStatus;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setOrderStatus,
    {},
  );

  const cancelled = status === "cancelled";
  const currentIndex = STATUS_FLOW.indexOf(status);

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Status
        </h2>
        {cancelled ? (
          <span className="text-sm text-danger">This order is cancelled.</span>
        ) : null}
      </div>

      <FormError message={state.error} />

      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="orderId" value={orderId} />

        {STATUS_FLOW.map((step, index) => {
          const isCurrent = step === status;
          /* Done steps stay filled so the bar reads as a progress line, not a
             row of buttons — Arsu should see where the garment is at a glance
             before he reads any label. */
          const isDone = !cancelled && index < currentIndex;

          return (
            <button
              key={step}
              type="submit"
              name="status"
              value={step}
              disabled={pending || isCurrent}
              className={`btn btn-sm ${
                isCurrent
                  ? "cursor-default bg-ink text-bone opacity-100"
                  : isDone
                    ? "border border-good/30 bg-good-soft text-good"
                    : "border border-line bg-white text-ink hover:border-gold hover:bg-gold-soft"
              }`}
            >
              {STATUS_LABELS[step]}
            </button>
          );
        })}

        <button
          type="submit"
          name="status"
          value={cancelled ? "placed" : "cancelled"}
          disabled={pending}
          className="btn btn-sm ml-auto border border-danger/30 bg-white text-danger hover:bg-danger-soft"
          onClick={(event) => {
            if (
              !cancelled &&
              !window.confirm("Cancel this order? It stays on record and can be reopened.")
            ) {
              event.preventDefault();
            }
          }}
        >
          {cancelled ? "Reopen" : "Cancel order"}
        </button>
      </form>
    </div>
  );
}
