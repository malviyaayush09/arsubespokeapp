import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  orderItems,
  orderStatusEvents,
  orders,
  payments,
  tailors,
  type PaymentMethod,
} from "@/db/schema";
import { listOrders, type OrderListRow } from "@/lib/orders";

/* These reports are built by pulling the orders and summing in JavaScript
   rather than in one clever query. A tailoring shop writes a few hundred
   orders a year, so the whole table fits in memory many times over, and the
   arithmetic then reuses computeTotals() — which means a report can never
   disagree with the bill it is reporting on. That guarantee is worth more here
   than a faster query. */

/* ── day book ─────────────────────────────────────────────────────────── */

export type DayBookRow = {
  id: number;
  paidOn: string;
  amountPaise: number;
  method: PaymentMethod;
  note: string | null;
  orderId: number;
  orderNo: string;
  clientId: number;
  clientName: string;
};

export function dayBook(from: string, to: string) {
  const rows = db
    .select({
      id: payments.id,
      paidOn: payments.paidOn,
      amountPaise: payments.amountPaise,
      method: payments.method,
      note: payments.note,
      orderId: orders.id,
      orderNo: orders.orderNo,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .where(and(gte(payments.paidOn, from), lte(payments.paidOn, to)))
    .orderBy(desc(payments.paidOn), desc(payments.id))
    .all();

  const byMethod = new Map<PaymentMethod, number>();
  let total = 0;
  for (const row of rows) {
    total += row.amountPaise;
    byMethod.set(row.method, (byMethod.get(row.method) ?? 0) + row.amountPaise);
  }

  const byDay = new Map<string, number>();
  for (const row of rows) {
    byDay.set(row.paidOn, (byDay.get(row.paidOn) ?? 0) + row.amountPaise);
  }

  return {
    rows,
    total,
    count: rows.length,
    byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    byDay: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])),
  };
}

/* ── ready but not collected ──────────────────────────────────────────── */

export type UncollectedRow = OrderListRow & {
  readySince: string | null;
  daysWaiting: number | null;
};

/**
 * Garments finished and still in the shop. The wait is measured from the
 * status event that set them Ready, not from the promised date — a garment
 * finished early and left uncollected for a month is the thing that actually
 * occupies a shelf.
 */
export function uncollected(): UncollectedRow[] {
  const ready = listOrders({ status: "ready" });
  if (ready.length === 0) return [];

  const events = db
    .select({
      orderId: orderStatusEvents.orderId,
      changedAt: orderStatusEvents.changedAt,
    })
    .from(orderStatusEvents)
    .where(eq(orderStatusEvents.toStatus, "ready"))
    .orderBy(desc(orderStatusEvents.changedAt))
    .all();

  /* Latest "became ready" per order — an order can go back to Stitching and
     forward to Ready again, and it is the most recent one that counts. */
  const readyAt = new Map<number, Date>();
  for (const event of events) {
    if (!readyAt.has(event.orderId)) readyAt.set(event.orderId, event.changedAt);
  }

  const now = Date.now();
  return ready
    .map((order) => {
      const at = readyAt.get(order.id) ?? null;
      return {
        ...order,
        readySince: at ? at.toISOString().slice(0, 10) : null,
        daysWaiting: at
          ? Math.floor((now - at.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };
    })
    .sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1));
}

/* ── monthly report ──────────────────────────────────────────────────── */

export type MonthlyReport = ReturnType<typeof monthlyReport>;

export function monthlyReport(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const all = listOrders();
  const live = all.filter((o) => o.status !== "cancelled");

  const placed = live.filter((o) => o.orderDate >= from && o.orderDate <= to);
  const billedPaise = placed.reduce((sum, o) => sum + o.totalPaise, 0);

  const book = dayBook(from, to);

  /* Outstanding is deliberately "as of now" across every order, not just this
     month's. A debt from March is still a debt in September, and a report that
     hid it would be the wrong number to act on. */
  const outstandingPaise = live
    .filter((o) => o.balancePaise > 0)
    .reduce((sum, o) => sum + o.balancePaise, 0);

  const garmentRows = db
    .select({
      label: orderItems.garmentLabel,
      quantity: sql<number>`SUM(${orderItems.quantity})`,
      lines: sql<number>`COUNT(*)`,
      valuePaise: sql<number>`SUM((${orderItems.stitchingRatePaise} + ${orderItems.fabricRatePaise}) * ${orderItems.quantity})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        gte(orders.orderDate, from),
        lte(orders.orderDate, to),
        sql`${orders.status} != 'cancelled'`,
      ),
    )
    .groupBy(orderItems.garmentLabel)
    .orderBy(desc(sql`SUM(${orderItems.quantity})`))
    .all();

  const byClient = new Map<number, { name: string; billed: number; orders: number }>();
  for (const order of placed) {
    const current = byClient.get(order.clientId) ?? {
      name: order.clientName,
      billed: 0,
      orders: 0,
    };
    current.billed += order.totalPaise;
    current.orders += 1;
    byClient.set(order.clientId, current);
  }

  const topClients = [...byClient.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.billed - a.billed)
    .slice(0, 8);

  const delivered = placed.filter((o) => o.status === "delivered").length;

  return {
    from,
    to,
    orderCount: placed.length,
    billedPaise,
    collectedPaise: book.total,
    collectedByMethod: book.byMethod,
    outstandingPaise,
    averageOrderPaise: placed.length
      ? Math.round(billedPaise / placed.length)
      : 0,
    garments: garmentRows,
    garmentCount: garmentRows.reduce((sum, g) => sum + Number(g.quantity), 0),
    topClients,
    delivered,
  };
}

/* ── workload per tailor ─────────────────────────────────────────────── */

/**
 * What is on each karigar's bench right now. Counts only garments on orders
 * that have not been delivered or cancelled — a finished order is not workload.
 */
export function tailorWorkload() {
  const rows = db
    .select({
      tailorId: tailors.id,
      name: tailors.name,
      isActive: tailors.isActive,
      garments: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
      lines: sql<number>`COUNT(${orderItems.id})`,
    })
    .from(tailors)
    .leftJoin(orderItems, eq(orderItems.tailorId, tailors.id))
    .leftJoin(
      orders,
      and(
        eq(orderItems.orderId, orders.id),
        sql`${orders.status} NOT IN ('delivered','cancelled')`,
      ),
    )
    .groupBy(tailors.id)
    .orderBy(asc(tailors.sortOrder), asc(tailors.name))
    .all();

  const unassigned = db
    .select({
      garments: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        sql`${orderItems.tailorId} IS NULL`,
        sql`${orders.status} NOT IN ('delivered','cancelled')`,
      ),
    )
    .get();

  return { rows, unassignedGarments: Number(unassigned?.garments ?? 0) };
}

export function listTailors(includeInactive = false) {
  return db
    .select()
    .from(tailors)
    .where(includeInactive ? undefined : eq(tailors.isActive, true))
    .orderBy(asc(tailors.sortOrder), asc(tailors.name))
    .all();
}
