"use client";

import { useActionState } from "react";
import { repeatOrder, type ActionState } from "@/app/actions/orders";
import { SubmitButton } from "@/components/forms";
import { FormError } from "@/components/ui";

export function RepeatOrderButton({
  orderId,
  orderNo,
  className = "btn-secondary btn-sm",
  label = "Repeat this order",
}: {
  orderId: number;
  orderNo: string;
  className?: string;
  /** "Repeat" inside a table row, the full sentence where there is space. */
  label?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    repeatOrder,
    {},
  );

  return (
    <>
      <FormError message={state.error} />
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <SubmitButton
          className={className}
          pendingLabel="Creating…"
          confirm={`Start a new order with the same garments and the exact measurements from ${orderNo}?`}
        >
          {label}
        </SubmitButton>
      </form>
    </>
  );
}
