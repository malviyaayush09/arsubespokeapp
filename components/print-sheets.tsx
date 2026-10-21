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

function Letterhead({
  shop,
  copyLabel,
  /* The monogram goes on the copies that leave the shop as documents - the
     client's bill and the shop's own record. NOT on the cutting copy: that
     sheet is kept deliberately spare, with no prices, no phone number and no
     terms, because everything on it should be something the person at the
     bench needs. A logo is not. */
  withLogo = false,
}: {
  shop: Shop;
  copyLabel: string;
  withLogo?: boolean;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-6 border-b-2 border-black pb-3">
      <div className="flex items-start gap-3">
        {withLogo ? (
          /* 135x160 source printed about 15mm tall. That works out near 250
             dots per inch on paper - crisp - and the source is never scaled
             up, which is what makes a printed logo look cheap. */
          <img
            src="/logo.png"
            alt=""
            width={135}
            height={160}
            className="h-[15mm] w-auto shrink-0"
          />
        ) : null}
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
      </div>
      <div className="text-right text-[9pt] leading-snug">
        <div className="mb-1 inline-block border border-black px-2 py-0.5 text-[8pt] font-semibold tracking-wider uppercase">
          {copyLabel}
        </div>
        {/* Both numbers and the address he already prints: the landline is
            what clients ring, the mobile is what he answers. */}
        {shop.storePhone ? (
          <div className="tabular-nums">{shop.storePhone}</div>
        ) : null}
        {shop.phone ? <div className="tabular-nums">{shop.phone}</div> : null}
        {shop.email ? <div>{shop.email}</div> : null}
        {shop.instagram ? <div>{shop.instagram}</div> : null}
      </div>
    </header>
  );
}

/* The terms along the foot of his own sheet - collection times, the thirty-day
   limit, opening hours. They exist because clients ask, and because a garment
   left for a year is a garment he is still storing. */
function Terms({ shop }: { shop: Shop }) {
  if (!shop.terms) return null;
  return (
    <div className="mt-6 border-t border-black pt-2 text-[7.5pt] leading-snug whitespace-pre-line text-neutral-700">
      {shop.terms}
    </div>
  );
}

function OrderMeta({
  data,
  showStatus,
  /* The tailor copy leaves the client's phone number off. That sheet goes out
     to the bench and is handled by whoever is cutting; the person stitching
     has no reason to be holding a client's number, and a cutting card left on
     a table is not where one should sit. The name stays, because the work
     still has to be attributable to someone. */
  showPhone = true,
}: {
  data: OrderFull;
  showStatus?: boolean;
  showPhone?: boolean;
}) {
  const { order, client } = data;
  return (
    <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[10pt]">
      <Line label="Order no." value={order.orderNo} strong />
      <Line label="Client" value={client.name} strong />
      <Line label="Order date" value={formatDate(order.orderDate)} />
      {showPhone ? <Line label="Phone" value={client.phone} /> : null}
      {showPhone && client.gstNo ? (
        <Line label="GST No" value={client.gstNo} />
      ) : null}
      {order.trialDate ? (
        <Line label="Trial" value={formatDate(order.trialDate)} />
      ) : null}
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

/* ── the working copies: one page, however many garments ───────────────────
 *
 * The tailor and shop copies used to run to two and three pages. Measured on
 * A4 at 14mm margins - 269mm of usable height - a THREE garment order came to
 * 304mm. Where it went is the point:
 *
 *   letterhead  58.7mm
 *   order meta  44.4mm   <- 103mm, 38% of the page, before a single garment
 *   per garment ~50mm each
 *
 * And the garments were mostly repetition. Measurements belong to the person,
 * not the garment: an order for a Pant and a Dhoti printed the same nine
 * lower-body numbers twice, and six garments would have printed them four or
 * five times. His own paper sheet never did that - the body is written once
 * at the top, and the garments are listed below with only what differs.
 *
 * So: a header band instead of a letterhead, each distinct set of numbers
 * printed once under the half of the body it measures, and the garments as a
 * list of what is actually particular to each - quantity, fabric, pockets,
 * cuffs. Six garments now sit inside half a page. */

/** The measurements of one body half, and which garments are cut from them. */
type BodyBlock = {
  key: string;
  owner: string;
  garments: string[];
  rows: OrderFull["items"][number]["measurements"];
};

/**
 * Collapse the per-garment snapshots into one block per distinct set.
 *
 * Keyed on the owner AND the values, never on the owner alone. Each garment
 * carries its own frozen copy, so two can legitimately disagree - a trouser
 * taken in after a fitting, an older garment repeated from last year's
 * numbers. When they differ they stay apart, each block naming the garments
 * it belongs to, because quietly showing one set for both would put a number
 * on the bench that nobody measured.
 */
function bodyBlocks(items: OrderFull["items"]): BodyBlock[] {
  const blocks = new Map<string, BodyBlock>();

  for (const item of items) {
    const rows = item.measurements.filter((m) => m.groupName !== "Style");
    if (rows.length === 0) continue;

    /* Fields a garment owns itself, rather than inheriting from a template,
       have no owner to group under - fall back to the garment's own name. */
    const owner = rows[0].ownerName ?? item.garmentLabel;
    const key =
      owner +
      "\u0000" +
      rows.map((m) => `${m.fieldId}=${m.valueText.trim()}`).join("|");

    const existing = blocks.get(key);
    if (existing) existing.garments.push(item.garmentLabel);
    else blocks.set(key, { key, owner, garments: [item.garmentLabel], rows });
  }

  return [...blocks.values()];
}

/** The style answers for one garment: pockets, cuffs, collar, bottom. */
function styleOf(item: OrderFull["items"][number]) {
  return item.measurements.filter(
    (m) => m.groupName === "Style" && m.valueText.trim() !== "",
  );
}

/* One band, not a letterhead. The name, which copy it is, and the four facts
   that decide what happens to the garment - who, when it is wanted, when the
   trial is. The shop's address is not one of them on a working copy. */
function HeadBand({
  data,
  shop,
  copyLabel,
  showPhone = false,
  showStatus = false,
  /* The monogram stays on the shop's own record, which is a document that
     gets filed. It costs nothing in height - the band is already as tall as
     the name - so the only copy without it is the cutting copy, where
     everything on the sheet should be something the bench needs. */
  withLogo = false,
}: {
  data: OrderFull;
  shop: Shop;
  copyLabel: string;
  showPhone?: boolean;
  showStatus?: boolean;
  withLogo?: boolean;
}) {
  const { order, client } = data;
  return (
    <header className="mb-2 border-b-2 border-black pb-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2.5">
          {withLogo ? (
            <img
              src="/logo.png"
              alt=""
              width={135}
              height={160}
              className="h-[8mm] w-auto shrink-0 self-center"
            />
          ) : null}
          <span className="font-serif text-xl tracking-[0.2em]">{shop.name}</span>
          <span className="border border-black px-1.5 text-[7pt] font-semibold tracking-wider uppercase">
            {copyLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[8pt] text-neutral-600">Order</span>
          <span className="font-mono text-lg font-semibold">{order.orderNo}</span>
        </div>
      </div>

      {/* Every fact on one line, each with its label, so it reads at a glance
          and costs 5mm instead of 44. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[9.5pt]">
        <span>
          <span className="text-[8pt] text-neutral-600">Client </span>
          <span className="font-semibold">{client.name}</span>
        </span>
        {showPhone ? (
          <span className="tabular-nums">
            <span className="text-[8pt] text-neutral-600">Phone </span>
            {client.phone}
          </span>
        ) : null}
        {showPhone && client.gstNo ? (
          <span className="tabular-nums">
            <span className="text-[8pt] text-neutral-600">GST </span>
            {client.gstNo}
          </span>
        ) : null}
        <span>
          <span className="text-[8pt] text-neutral-600">Ordered </span>
          {formatDate(order.orderDate)}
        </span>
        {order.trialDate ? (
          <span>
            <span className="text-[8pt] text-neutral-600">Trial </span>
            <span className="font-semibold">{formatDate(order.trialDate)}</span>
          </span>
        ) : null}
        <span>
          <span className="text-[8pt] text-neutral-600">Delivery </span>
          <span className="font-semibold">
            {order.promisedDate ? formatDate(order.promisedDate) : "—"}
          </span>
        </span>
        {showStatus ? (
          <span>
            <span className="text-[8pt] text-neutral-600">Status </span>
            {STATUS_LABELS[order.status]}
          </span>
        ) : null}
      </div>
    </header>
  );
}

/**
 * One body half, printed once.
 *
 * `big` is the cutting copy: five across on A4 is about 36mm a cell, which
 * holds a two-digit number and a fraction at 12pt - readable at arm's length
 * across a bench, which is the whole job of that sheet. The shop's record is
 * read at a desk, so it packs seven across at 8pt.
 */
function BodyMeasurements({ block, big }: { block: BodyBlock; big?: boolean }) {
  return (
    <div className="keep-together mt-2">
      <div className="flex items-baseline justify-between border-b border-black pb-0.5">
        <h2
          className={`font-semibold tracking-wide uppercase ${big ? "text-[9.5pt]" : "text-[8.5pt]"}`}
        >
          {block.owner}
        </h2>
        <span className="text-[8pt] text-neutral-600">
          {block.garments.join(", ")}
        </span>
      </div>

      <div
        className={`mt-1 grid gap-x-3 ${big ? "grid-cols-5 gap-y-1" : "grid-cols-7 gap-y-0.5"}`}
      >
        {block.rows.map((m) => (
          <div
            key={m.id}
            className="flex items-baseline justify-between gap-1 border-b border-neutral-300"
          >
            <span
              className={`shrink leading-tight text-neutral-700 ${big ? "text-[8pt]" : "text-[6.5pt]"}`}
            >
              {m.fieldLabel}
            </span>
            <span
              className={`shrink-0 font-semibold tabular-nums ${big ? "text-[12pt]" : "text-[8.5pt]"}`}
            >
              {m.valueText.trim() === "" ? (
                <span className="font-normal text-neutral-400">__</span>
              ) : (
                m.valueText
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── tailor ───────────────────────────────────────────────────────────── */

export function TailorSheet({
  data,
  shop,
}: {
  data: OrderFull;
  shop: Shop;
}) {
  const blocks = bodyBlocks(data.items);

  return (
    <section className="sheet bg-white p-0 text-black">
      <HeadBand data={data} shop={shop} copyLabel="Cutting copy" />

      {blocks.map((block) => (
        <BodyMeasurements key={block.key} block={block} big />
      ))}

      {/* What is particular to each garment. One row each, so the twelfth
          garment costs the same 6mm as the first. */}
      <div className="keep-together mt-3">
        <table className="w-full text-[9.5pt]">
          <thead>
            <tr className="border-y border-black text-[8pt] tracking-wide uppercase">
              <th className="w-6 py-1 pr-2 text-left font-semibold">#</th>
              <th className="py-1 text-left font-semibold">Garment</th>
              <th className="w-10 py-1 pr-4 text-right font-semibold">Qty</th>
              <th className="w-24 py-1 pr-3 text-left font-semibold">Fabric</th>
              <th className="py-1 text-left font-semibold">
                Pockets, cuffs and the rest
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => {
              const style = styleOf(item);
              const notes = [item.fabricNotes, item.itemNotes]
                .filter((n) => n && n.trim() !== "")
                .join(" · ");
              return (
                <tr key={item.id} className="border-b border-neutral-300 align-top">
                  <td className="py-1 pr-2 tabular-nums">{index + 1}</td>
                  <td className="py-1 font-semibold">{item.garmentLabel}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1 pr-3 text-[8.5pt]">
                    {/* Nothing is cut from cloth for a tie, so neither "shop"
                        nor "client's own" is true of one. */}
                    {item.category === "accessory"
                      ? "—"
                      : item.fabricSource === "shop"
                        ? "shop"
                        : "client's own"}
                  </td>
                  <td className="py-1">
                    {style.length > 0 ? (
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {style.map((m) => (
                          <span key={m.id}>
                            <span className="text-[8pt] text-neutral-600">
                              {m.fieldLabel}{" "}
                            </span>
                            <span className="font-semibold">{m.valueText}</span>
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {notes ? (
                      <span className="block text-[8.5pt] text-neutral-700">
                        {notes}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SignOff note="No pricing on this copy." />
    </section>
  );
}

/* ── client ───────────────────────────────────────────────────────────── */

export function ClientSheet({ data, shop }: { data: OrderFull; shop: Shop }) {
  const { items, charges, payments, totals } = data;

  return (
    <section className="sheet bg-white p-0 text-black">
      <Letterhead shop={shop} copyLabel="Receipt" withLogo />
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
        {/* The labels are the ones already on his printed sheet - Total,
            Fabric, Grand Total, Advance, Balance - so a figure here and a
            figure on his paper are obviously the same figure.

            Charges are itemised as rows in the table above, so Total includes
            them. Listing them again separately made a receipt read as if the
            express fee had been charged twice, even though the sum was right. */}
        <Total label="Total" paise={totals.stitchingPaise + totals.chargesPaise} />
        {totals.fabricPaise > 0 ? (
          <Total label="Fabric" paise={totals.fabricPaise} />
        ) : null}
        {totals.discountPaise > 0 ? (
          <Total label="Discount" paise={-totals.discountPaise} />
        ) : null}
        <div className="my-1 border-t-2 border-black" />
        <Total label="Grand Total" paise={totals.totalPaise} strong />
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
      <Terms shop={shop} />
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
      <HeadBand
        data={data}
        shop={shop}
        copyLabel="Shop record"
        showPhone
        showStatus
        withLogo
      />

      {bodyBlocks(items).map((block) => (
        <BodyMeasurements key={block.key} block={block} />
      ))}

      {/* The garments and the money in one table. This is the sheet that gets
          filed, so the figures sit next to the thing they were charged for
          rather than a paragraph below it. */}
      <div className="keep-together mt-3">
        <table className="w-full text-[9pt]">
          <thead>
            <tr className="border-y border-black text-[7.5pt] tracking-wide uppercase">
              <th className="w-5 py-1 pr-2 text-left font-semibold">#</th>
              <th className="py-1 text-left font-semibold">Garment</th>
              <th className="w-9 py-1 pr-3 text-right font-semibold">Qty</th>
              <th className="w-16 py-1 pr-3 text-left font-semibold">Fabric</th>
              <th className="py-1 text-left font-semibold">Details</th>
              <th className="w-16 py-1 text-right font-semibold">Stitch ₹</th>
              <th className="w-14 py-1 text-right font-semibold">Cloth ₹</th>
              <th className="w-16 py-1 text-right font-semibold">Amount ₹</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const style = styleOf(item);
              const notes = [item.fabricNotes, item.itemNotes]
                .filter((n) => n && n.trim() !== "")
                .join(" · ");
              return (
                <tr key={item.id} className="border-b border-neutral-300 align-top">
                  <td className="py-1 pr-2 tabular-nums">{index + 1}</td>
                  <td className="py-1 font-semibold">{item.garmentLabel}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1 pr-3 text-[8pt]">
                    {item.category === "accessory"
                      ? "—"
                      : item.fabricSource === "shop"
                        ? "shop"
                        : "client's"}
                  </td>
                  <td className="py-1 text-[8pt]">
                    {style.map((m) => `${m.fieldLabel} ${m.valueText}`).join(" · ")}
                    {style.length > 0 && notes ? " · " : ""}
                    {notes}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatPaisePlain(item.stitchingRatePaise)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {item.fabricRatePaise > 0
                      ? formatPaisePlain(item.fabricRatePaise)
                      : "—"}
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums">
                    {formatPaisePlain(item.lineTotalPaise)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
          <Total label="Total" paise={totals.stitchingPaise} />
          {totals.fabricPaise > 0 ? (
            <Total label="Fabric" paise={totals.fabricPaise} />
          ) : null}
          {totals.chargesPaise > 0 ? (
            <Total label="Extras" paise={totals.chargesPaise} />
          ) : null}
          {totals.discountPaise > 0 ? (
            <Total label="Discount" paise={-totals.discountPaise} />
          ) : null}
          <div className="my-1 border-t-2 border-black" />
          <Total label="Grand Total" paise={totals.totalPaise} strong />
          <Total label="Advance" paise={-totals.paidPaise} />
          <div className="my-1 border-t border-black" />
          <Total
            label={totals.balancePaise < 0 ? "Refund due" : "Balance"}
            paise={Math.abs(totals.balancePaise)}
            strong
          />
        </div>
      </div>
      <Terms shop={shop} />
    </section>
  );
}
