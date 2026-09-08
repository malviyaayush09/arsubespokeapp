import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderFull } from "@/lib/orders";
import { getShop } from "@/lib/settings";
import {
  ClientSheet,
  ShopSheet,
  TailorSheet,
  VARIANT_LABELS,
  type Variant,
} from "@/components/print-sheets";
import { PrintBar } from "./print-bar";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

const VARIANTS: Variant[] = ["tailor", "client", "shop"];

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string; variant: string }>;
}) {
  await requireUnlocked();

  const { id, variant } = await params;

  const isAll = variant === "all";
  if (!isAll && !VARIANTS.includes(variant as Variant)) notFound();

  const data = getOrderFull(Number(id));
  if (!data) notFound();

  const shop = getShop();
  const sheets = isAll ? VARIANTS : [variant as Variant];

  const title = isAll
    ? "All three copies"
    : VARIANT_LABELS[variant as Variant];

  return (
    <>
      <PrintBar
        orderId={data.order.id}
        orderNo={data.order.orderNo}
        title={title}
        sheetCount={sheets.length}
      />

      <div className="no-print mx-auto mt-4 flex max-w-[210mm] flex-wrap gap-2 text-sm">
        {VARIANTS.map((v) => (
          <Link
            key={v}
            href={`/orders/${data.order.id}/print/${v}`}
            className={`rounded-md px-3 py-1.5 ${
              variant === v ? "bg-ink text-bone" : "border border-line bg-white hover:bg-bone"
            }`}
          >
            {VARIANT_LABELS[v]}
          </Link>
        ))}
        <Link
          href={`/orders/${data.order.id}/print/all`}
          className={`rounded-md px-3 py-1.5 ${
            isAll ? "bg-ink text-bone" : "border border-line bg-white hover:bg-bone"
          }`}
        >
          All three
        </Link>
      </div>

      {/* On screen each sheet is drawn at true A4 width with its own margin so
          what you see is what comes out of the printer. In print those screen
          affordances are stripped and the @page margin takes over. */}
      <div className="mt-4 space-y-6 print:mt-0 print:space-y-0">
        {sheets.map((v) => (
          <div
            key={v}
            className="mx-auto w-full max-w-[210mm] bg-white p-[14mm] shadow-sm ring-1 ring-line print:max-w-none print:p-0 print:shadow-none print:ring-0"
          >
            {v === "tailor" ? <TailorSheet data={data} shop={shop} /> : null}
            {v === "client" ? <ClientSheet data={data} shop={shop} /> : null}
            {v === "shop" ? <ShopSheet data={data} shop={shop} /> : null}
          </div>
        ))}
      </div>
    </>
  );
}
