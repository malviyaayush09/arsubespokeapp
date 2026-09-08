import type { OrderFull } from "@/lib/orders";
import type { Shop } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { formatPaisePlain } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, STATUS_LABELS } from "@/db/schema";

/* Three copies, one order. What separates them is not styling but WHAT IS ON
 * THEM:
 *
 *   tailor — every measurement, set large enough to read across a cutting
 *            table. No prices at all: the person cutting has no reason to see
 *            them, and a rate sheet left on a bench is how a client ends up
 *            knowing another client's price.
 *   client — the bill. No measurements, no internal notes.
 *   shop   — everything, including internal notes and the payment history.
 */

export type Variant = "tailor" | "client" | "shop";

export const VARIANT_LABELS: Record<Variant, string> = {
  tailor: "Tailor / cutting copy",
  client: "Client copy",
  shop: "Shop record",
};

function Letterhead({ shop, copyLabel }: { shop: Shop; copyLabel: string }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-6 border-b-2 border-black pb-3">
      <div>
        <div className="font-serif text-2xl tracking-[0.2em]">{shop.name}</div>
        {shop.tagline ? (
          <div className="text-[10pt] tracking-wide">{shop.tagline}</div>
        ) : null}
        {shop.address ? (
          <div className="mt-1 text-[9pt] leading-snug whitespace-pre-line">
            {shop.address}
          </div>
        ) : null}
      </div>
      <div className="text-right text-[9pt] leading-snug">
        <div className="mb-1 inline-block border border-black px-2 py-0.5 text-[8pt] font-semibold tracking-wider uppercase">
          {copyLabel}
        </div>
        {shop.phone ? <div className="tabular-nums">{shop.phone}</div> : null}
        {shop.instagram ? <div>{shop.instagram}</div> : null}
      </div>
    </header>
  );
}

function OrderMeta({
  data,
  showStatus,
}: {
  data: OrderFull;
  showStatus?: boolean;
}) {
  const { order, client } = data;
  return (
    <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[10pt]">
      <Line label="Order no." value={order.orderNo} strong />
      <Line label="Client" value={client.name} strong />
      <Line label="Order date" value={formatDate(order.orderDate)} />
      <Line label="Phone" value={client.phone} />
      <Line
        label="Delivery"
        value={order.promisedDate ? formatDate(order.promisedDate) : "—"}
        strong
      />
      {showStatus ? <Line label="Status" value={STATUS_LABELS[order.status]} /> : null}
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-[9pt] text-neutral-600">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

function SignOff({ note }: { note?: string }) {
  return (
    <div className="mt-8 flex items-end justify-between gap-8 text-[9pt]">
      <div className="text-neutral-600">{note}</div>
      <div className="w-48 border-t border-black pt-1 text-center text-neutral-600">
        Signature
      </div>
    </div>
  );
}

/* ── tailor ───────────────────────────────────────────────────────────── */

export function TailorSheet({ data, shop }: { data: OrderFull; shop: Shop }) {
  return (
    <section className="sheet bg-white p-0 text-black">
      <Letterhead shop={shop} copyLabel="Tailor copy" />
      <OrderMeta data={data} showStatus />

      {data.items.map((item, index) => (
        <div key={item.id} className="keep-together mt-4">
          <div className="flex items-baseline justify-between border-b border-black pb-1">
            <h2 className="font-serif text-lg">
              {index + 1}. {item.garmentLabel}
              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
            </h2>
            <span className="text-[9pt] text-neutral-600">
              Fabric: {item.fabricSource === "shop" ? "shop" : "client's own"}
            </span>
          </div>

          {item.measurements.length > 0 ? (
            /* Four across on A4 gives roughly 42mm per cell — wide enough for a
               two-digit number and a fraction at 13pt, which is legible at
               arm's length on a cutting table. */
            <div className="mt-2 grid grid-cols-4 gap-x-4 gap-y-1.5">
              {item.measurements.map((m) => (
                <div key={m.id} className="flex items-baseline justify-between border-b border-neutral-300 pb-0.5">
                  <span className="text-[8.5pt] text-neutral-700">{m.fieldLabel}</span>
                  <span className="ml-2 text-[13pt] font-semibold tabular-nums">
                    {m.valueText.trim() === "" ? (
                      <span className="text-neutral-400">____</span>
                    ) : (
                      m.valueText
                    )}
                    {m.valueText.trim() !== "" && m.unit ? (
                      <span className="text-[8pt] font-normal text-neutral-600">
                        {m.unit === "in" ? '"' : ` ${m.unit}`}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {item.fabricNotes || item.itemNotes ? (
            <div className="mt-2 text-[9.5pt]">
              {item.fabricNotes ? (
                <div>
                  <span className="text-neutral-600">Fabric: </span>
                  {item.fabricNotes}
                </div>
              ) : null}
              {item.itemNotes ? (
                <div>
                  <span className="text-neutral-600">Notes: </span>
                  {item.itemNotes}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}

      <SignOff note="No pricing on this copy." />
    </section>
  );
}

/* ── client ───────────────────────────────────────────────────────────── */

export function ClientSheet({ data, shop }: { data: OrderFull; shop: Shop }) {
  const { items, charges, payments, totals } = data;

  return (
    <section className="sheet bg-white p-0 text-black">
      <Letterhead shop={shop} copyLabel="Receipt" />
      <OrderMeta data={data} />

      <table className="mt-2 w-full text-[10pt]">
        <thead>
          <tr className="border-y border-black">
            <th className="py-1.5 text-left font-semibold">Garment</th>
            <th className="py-1.5 text-right font-semibold">Qty</th>
            <th className="py-1.5 text-right font-semibold">Rate (₹)</th>
            <th className="py-1.5 text-right font-semibold">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-300">
              <td className="py-1.5">
                {item.garmentLabel}
                {item.fabricNotes ? (
                  <div className="text-[8.5pt] text-neutral-600">{item.fabricNotes}</div>
                ) : null}
              </td>
              <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatPaisePlain(item.stitchingRatePaise + item.fabricRatePaise)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatPaisePlain(item.lineTotalPaise)}
              </td>
            </tr>
          ))}

          {charges.map((charge) => (
            <tr key={charge.id} className="border-b border-neutral-300">
              <td className="py-1.5" colSpan={3}>
                {charge.label}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatPaisePlain(charge.amountPaise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="keep-together mt-3 ml-auto w-72 text-[10pt]">
        {/* Charges are already itemised as rows in the table above, so the
            subtotal here includes them. Listing them again as a separate
            "Extras" line made a client's receipt read as if the express fee
            had been charged twice, even though the total was right. */}
        <Total label="Subtotal" paise={totals.subtotalPaise + totals.chargesPaise} />
        {totals.discountPaise > 0 ? (
          <Total label="Discount" paise={-totals.discountPaise} />
        ) : null}
        <div className="my-1 border-t-2 border-black" />
        <Total label="Total" paise={totals.totalPaise} strong />
        {payments.map((payment) => (
          <Total
            key={payment.id}
            label={`Paid ${formatDate(payment.paidOn)} (${PAYMENT_METHOD_LABELS[payment.method]})`}
            paise={-payment.amountPaise}
            small
          />
        ))}
        <div className="my-1 border-t border-black" />
        <Total
          label={totals.balancePaise < 0 ? "Refund due" : "Balance due"}
          paise={Math.abs(totals.balancePaise)}
          strong
        />
      </div>

      <SignOff note={shop.billFooter} />
    </section>
  );
}

function Total({
  label,
  paise,
  strong,
  small,
}: {
  label: string;
  paise: number;
  strong?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex justify-between py-0.5 ${strong ? "font-semibold" : ""} ${
        small ? "text-[9pt] text-neutral-700" : ""
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {paise < 0 ? "−" : ""}
        {formatPaisePlain(Math.abs(paise))}
      </span>
    </div>
  );
}

/* ── shop ─────────────────────────────────────────────────────────────── */

export function ShopSheet({ data, shop }: { data: OrderFull; shop: Shop }) {
  const { order, items, totals, payments } = data;

  return (
    <section className="sheet bg-white p-0 text-black">
      <Letterhead shop={shop} copyLabel="Shop record" />
      <OrderMeta data={data} showStatus />

      {items.map((item, index) => (
        <div key={item.id} className="keep-together mt-3">
          <div className="flex items-baseline justify-between border-b border-black pb-1">
            <h2 className="font-serif text-base">
              {index + 1}. {item.garmentLabel}
              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
            </h2>
            <span className="text-[9pt] tabular-nums">
              ₹{formatPaisePlain(item.lineTotalPaise)}
            </span>
          </div>

          {item.measurements.length > 0 ? (
            <div className="mt-1.5 grid grid-cols-5 gap-x-3 gap-y-0.5 text-[8.5pt]">
              {item.measurements.map((m) => (
                <div key={m.id} className="flex justify-between border-b border-neutral-200">
                  <span className="text-neutral-600">{m.fieldLabel}</span>
                  <span className="font-semibold tabular-nums">
                    {m.valueText.trim() === "" ? "—" : m.valueText}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-1 text-[9pt] text-neutral-700">
            Fabric: {item.fabricSource === "shop" ? "shop" : "client's own"}
            {item.fabricNotes ? ` · ${item.fabricNotes}` : ""}
            {item.itemNotes ? ` · ${item.itemNotes}` : ""}
            {" · stitching ₹"}
            {formatPaisePlain(item.stitchingRatePaise)}
            {item.fabricRatePaise > 0
              ? ` · fabric ₹${formatPaisePlain(item.fabricRatePaise)}`
              : ""}
          </div>
        </div>
      ))}

      <div className="keep-together mt-4 flex items-start justify-between gap-8">
        <div className="flex-1 text-[9pt]">
          {order.internalNotes ? (
            <>
              <div className="font-semibold">Internal notes</div>
              <div className="whitespace-pre-line text-neutral-700">
                {order.internalNotes}
              </div>
            </>
          ) : null}
          {payments.length > 0 ? (
            <div className="mt-2">
              <div className="font-semibold">Payments</div>
              {payments.map((payment) => (
                <div key={payment.id} className="text-neutral-700 tabular-nums">
                  {formatDate(payment.paidOn)} · {PAYMENT_METHOD_LABELS[payment.method]} ·
                  ₹{formatPaisePlain(payment.amountPaise)}
                  {payment.note ? ` · ${payment.note}` : ""}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="w-64 text-[10pt]">
          <Total label="Subtotal" paise={totals.subtotalPaise} />
          {totals.chargesPaise > 0 ? (
            <Total label="Extras" paise={totals.chargesPaise} />
          ) : null}
          {totals.discountPaise > 0 ? (
            <Total label="Discount" paise={-totals.discountPaise} />
          ) : null}
          <div className="my-1 border-t-2 border-black" />
          <Total label="Total" paise={totals.totalPaise} strong />
          <Total label="Paid" paise={-totals.paidPaise} />
          <div className="my-1 border-t border-black" />
          <Total
            label={totals.balancePaise < 0 ? "Refund due" : "Balance"}
            paise={Math.abs(totals.balancePaise)}
            strong
          />
        </div>
      </div>
    </section>
  );
}
