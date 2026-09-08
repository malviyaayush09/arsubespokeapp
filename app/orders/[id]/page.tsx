import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_LABELS } from "@/db/schema";
import { getOrderFull, listGarmentTypes } from "@/lib/orders";
import { listTailors } from "@/lib/reports";
import { getShop } from "@/lib/settings";
import { formatPaise } from "@/lib/money";
import { formatDate, formatDateTime, describeDue } from "@/lib/format";
import { Money, StatusChip } from "@/components/ui";
import { WaButton } from "@/components/wa-button";
import { RepeatOrderButton } from "@/components/repeat-order";
import { OrderStatusBar } from "@/components/order-status";
import { OrderItemCard } from "@/components/order-item-card";
import { OrderBilling } from "@/components/order-billing";
import { AddGarmentForm, OrderMetaForm } from "@/components/order-extras";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUnlocked();

  const { id } = await params;
  const data = getOrderFull(Number(id));
  if (!data) notFound();

  const { order, client, items, charges, payments, statusEvents, totals } = data;
  const garments = listGarmentTypes();
  const tailors = listTailors().map((t) => ({ id: t.id, name: t.name }));
  const shop = getShop();

  const waContext = {
    clientName: client.name,
    orderNo: order.orderNo,
    shopName: shop.name,
    balance: totals.balancePaise > 0 ? formatPaise(totals.balancePaise) : undefined,
    promisedDate: order.promisedDate ? formatDate(order.promisedDate) : undefined,
  };

  const blanks = items.reduce(
    (sum, item) => sum + item.measurements.filter((m) => m.valueText.trim() === "").length,
    0,
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-2xl">{order.orderNo}</h1>
            <StatusChip status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/clients/${client.id}`} className="text-gold hover:underline">
              {client.name}
            </Link>
            {" · "}
            <span className="tabular-nums">{client.phone}</span>
            {" · placed "}
            {formatDate(order.orderDate)}
            {order.promisedDate ? ` · ${describeDue(order.promisedDate)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/orders/${order.id}/print/tailor`} className="btn-secondary btn-sm">
            Tailor copy
          </Link>
          <Link href={`/orders/${order.id}/print/client`} className="btn-secondary btn-sm">
            Client copy
          </Link>
          <Link href={`/orders/${order.id}/print/shop`} className="btn-secondary btn-sm">
            Shop copy
          </Link>
          <Link href={`/orders/${order.id}/print/all`} className="btn-primary btn-sm">
            Print all 3
          </Link>
        </div>
      </div>

      <OrderStatusBar orderId={order.id} status={order.status} />

      <div className="no-print mt-3 flex flex-wrap items-center gap-2">
        <RepeatOrderButton orderId={order.id} orderNo={order.orderNo} />

        <span className="ml-2 text-xs text-muted">WhatsApp:</span>
        <WaButton phone={client.phone} template="confirmed" context={waContext} />
        <WaButton phone={client.phone} template="trial" context={waContext} />
        <WaButton phone={client.phone} template="ready" context={waContext} />
        {totals.balancePaise > 0 ? (
          <WaButton phone={client.phone} template="balance" context={waContext} />
        ) : null}
        <WaButton phone={client.phone} template="delayed" context={waContext} />
      </div>
      <p className="no-print mt-1 text-xs text-muted">
        These open WhatsApp with the message already written — nothing is sent
        until you press send there.
      </p>

      {blanks > 0 ? (
        <p className="mt-3 rounded-md border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {blanks} measurement{blanks === 1 ? " is" : "s are"} still blank. The
          tailor copy will print with {blanks === 1 ? "a gap" : "gaps"}.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {items.length === 0 ? (
            <p className="card px-4 py-8 text-center text-sm text-muted">
              No garments on this order yet.
            </p>
          ) : (
            items.map((item, index) => (
              <OrderItemCard
                key={item.id}
                orderId={order.id}
                item={item}
                index={index}
                tailors={tailors}
              />
            ))
          )}

          <AddGarmentForm orderId={order.id} garments={garments} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <OrderBilling
            orderId={order.id}
            totals={totals}
            charges={charges}
            payments={payments}
            lines={items.map((item) => ({
              label: item.garmentLabel,
              quantity: item.quantity,
              lineTotalPaise: item.lineTotalPaise,
            }))}
          />

          <OrderMetaForm
            orderId={order.id}
            orderDate={order.orderDate}
            promisedDate={order.promisedDate}
            internalNotes={order.internalNotes}
          />

          {statusEvents.length > 0 ? (
            <div className="card p-4">
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
                History
              </h2>
              <ol className="space-y-2 text-sm">
                {statusEvents.map((event) => (
                  <li key={event.id} className="flex justify-between gap-3">
                    <span>
                      {event.fromStatus
                        ? `${STATUS_LABELS[event.fromStatus]} → `
                        : ""}
                      <span className="font-medium">
                        {STATUS_LABELS[event.toStatus]}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {formatDateTime(event.changedAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="card p-4 text-sm">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              At a glance
            </h2>
            <dl className="space-y-1.5">
              <div className="flex justify-between">
                <dt className="text-muted">Garments</dt>
                <dd>{items.reduce((n, i) => n + i.quantity, 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total</dt>
                <dd>
                  <Money paise={totals.totalPaise} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Paid</dt>
                <dd>
                  <Money paise={totals.paidPaise} />
                </dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>Balance</dt>
                <dd className={totals.balancePaise > 0 ? "text-danger" : "text-good"}>
                  <Money paise={totals.balancePaise} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
