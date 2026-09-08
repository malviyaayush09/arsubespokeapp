"use client";

import { useActionState } from "react";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type OrderCharge,
  type Payment,
} from "@/db/schema";
import {
  addCharge,
  addPayment,
  removeCharge,
  removePayment,
  updateDiscount,
  type ActionState,
} from "@/app/actions/orders";
import type { Totals } from "@/lib/orders";
import { paiseToInput } from "@/lib/money";
import { formatDate, today } from "@/lib/format";
import { SubmitButton } from "@/components/forms";
import { FormError, Money } from "@/components/ui";

export function OrderBilling({
  orderId,
  totals,
  charges,
  payments,
  lines,
}: {
  orderId: number;
  totals: Totals;
  charges: OrderCharge[];
  payments: Payment[];
  lines: { label: string; quantity: number; lineTotalPaise: number }[];
}) {
  const [discountState, discountAction] = useActionState<ActionState, FormData>(
    updateDiscount,
    {},
  );
  const [chargeState, chargeAction] = useActionState<ActionState, FormData>(
    addCharge,
    {},
  );
  const [, removeChargeAction] = useActionState<ActionState, FormData>(
    removeCharge,
    {},
  );
  const [paymentState, paymentAction] = useActionState<ActionState, FormData>(
    addPayment,
    {},
  );
  const [, removePaymentAction] = useActionState<ActionState, FormData>(
    removePayment,
    {},
  );

  const settled = totals.balancePaise === 0 && totals.totalPaise > 0;
  const overpaid = totals.balancePaise < 0;

  return (
    <div className="card p-5">
      <h2 className="mb-4 font-serif text-lg">Bill</h2>

      <table className="w-full text-sm">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td className="py-1.5 text-ink-2">
                {line.label}
                {line.quantity > 1 ? ` ×${line.quantity}` : ""}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                <Money paise={line.lineTotalPaise} />
              </td>
            </tr>
          ))}

          <tr className="border-t border-line">
            <td className="py-1.5 font-medium">Subtotal</td>
            <td className="py-1.5 text-right font-medium">
              <Money paise={totals.subtotalPaise} />
            </td>
          </tr>

          {charges.map((charge) => (
            <tr key={charge.id}>
              <td className="py-1.5 text-ink-2">
                {charge.label}
                <form action={removeChargeAction} className="ml-2 inline">
                  <input type="hidden" name="orderId" value={orderId} />
                  <input type="hidden" name="chargeId" value={charge.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-xs text-muted hover:text-danger"
                  >
                    remove
                  </button>
                </form>
              </td>
              <td className="py-1.5 text-right">
                <Money paise={charge.amountPaise} />
              </td>
            </tr>
          ))}

          {totals.discountPaise > 0 ? (
            <tr>
              <td className="py-1.5 text-good">Discount</td>
              <td className="py-1.5 text-right text-good">
                −<Money paise={totals.discountPaise} />
              </td>
            </tr>
          ) : null}

          <tr className="border-t-2 border-ink">
            <td className="py-2 font-serif text-lg">Total</td>
            <td className="py-2 text-right font-serif text-lg">
              <Money paise={totals.totalPaise} />
            </td>
          </tr>

          {payments.map((payment) => (
            <tr key={payment.id}>
              <td className="py-1.5 text-ink-2">
                Paid {formatDate(payment.paidOn)} · {PAYMENT_METHOD_LABELS[payment.method]}
                {payment.note ? ` · ${payment.note}` : ""}
                <form action={removePaymentAction} className="ml-2 inline">
                  <input type="hidden" name="orderId" value={orderId} />
                  <input type="hidden" name="paymentId" value={payment.id} />
                  <button
                    type="submit"
                    className="cursor-pointer text-xs text-muted hover:text-danger"
                  >
                    remove
                  </button>
                </form>
              </td>
              <td className="py-1.5 text-right text-good">
                −<Money paise={payment.amountPaise} />
              </td>
            </tr>
          ))}

          <tr className="border-t border-line">
            <td className="py-2 font-medium">
              {overpaid ? "Refund due" : settled ? "Settled" : "Balance due"}
            </td>
            <td
              className={`py-2 text-right font-serif text-lg ${
                overpaid ? "text-gold" : settled ? "text-good" : "text-danger"
              }`}
            >
              <Money paise={Math.abs(totals.balancePaise)} />
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-5 space-y-4 border-t border-line pt-4">
        <div>
          <FormError message={chargeState.error} />
          <form action={chargeAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="orderId" value={orderId} />
            <label className="flex-1 min-w-40">
              <span className="label">Extra charge</span>
              <input className="field" name="label" placeholder="Express delivery" />
            </label>
            <label className="w-28">
              <span className="label">₹</span>
              <input
                className="field tabular-nums"
                name="amount"
                inputMode="decimal"
                placeholder="0"
              />
            </label>
            <SubmitButton className="btn-secondary" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </form>
        </div>

        <div>
          <FormError message={discountState.error} />
          <form action={discountAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="orderId" value={orderId} />
            <label className="w-40">
              <span className="label">Discount (₹)</span>
              <input
                className="field tabular-nums"
                name="discount"
                inputMode="decimal"
                defaultValue={paiseToInput(totals.discountPaise)}
              />
            </label>
            <SubmitButton className="btn-secondary" pendingLabel="Saving…">
              Apply
            </SubmitButton>
          </form>
        </div>

        <div>
          <FormError message={paymentState.error} />
          <form action={paymentAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="orderId" value={orderId} />
            <label className="w-28">
              <span className="label">Payment ₹</span>
              <input
                className="field tabular-nums"
                name="amount"
                inputMode="decimal"
                placeholder="0"
              />
            </label>
            <label className="w-32">
              <span className="label">Method</span>
              <select className="field" name="method" defaultValue="cash">
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-40">
              <span className="label">Date</span>
              <input className="field" type="date" name="paidOn" defaultValue={today()} />
            </label>
            <SubmitButton className="btn-primary" pendingLabel="Recording…">
              Record payment
            </SubmitButton>
          </form>
          <p className="mt-1 text-xs text-muted">
            Advance now, balance on delivery — record each one as it comes in.
          </p>
        </div>
      </div>
    </div>
  );
}
