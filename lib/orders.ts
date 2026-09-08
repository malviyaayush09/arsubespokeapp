import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  garmentTypes,
  orderCharges,
  orderItemMeasurements,
  orderItems,
  orderStatusEvents,
  orders,
  payments,
  type OrderStatus,
} from "@/db/schema";

/* ── totals ───────────────────────────────────────────────────────────────
 *
 * Nothing here is stored. Every figure on every bill is recomputed from the
 * lines it is made of, so a total can never quietly disagree with its parts.
 * All arithmetic is integer paise. */

export type LineTotal = {
  stitchingRatePaise: number;
  fabricRatePaise: number;
  quantity: number;
  lineTotalPaise: number;
};

export function lineTotal(item: {
  stitchingRatePaise: number;
  fabricRatePaise: number;
  quantity: number;
}): number {
  return (item.stitchingRatePaise + item.fabricRatePaise) * item.quantity;
}

export type Totals = {
  subtotalPaise: number;
  chargesPaise: number;
  discountPaise: number;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
};

export function computeTotals(input: {
  items: { stitchingRatePaise: number; fabricRatePaise: number; quantity: number }[];
  charges: { amountPaise: number }[];
  discountPaise: number;
  payments: { amountPaise: number }[];
}): Totals {
  const subtotalPaise = input.items.reduce((sum, i) => sum + lineTotal(i), 0);
  const chargesPaise = input.charges.reduce((sum, c) => sum + c.amountPaise, 0);

  /* A discount can be keyed larger than the bill by a slip of the hand. Clamp
     it rather than printing a negative total and refunding by accident. */
  const discountPaise = Math.min(
    Math.max(input.discountPaise, 0),
    subtotalPaise + chargesPaise,
  );

  const totalPaise = subtotalPaise + chargesPaise - discountPaise;
  const paidPaise = input.payments.reduce((sum, p) => sum + p.amountPaise, 0);

  return {
    subtotalPaise,
    chargesPaise,
    discountPaise,
    totalPaise,
    paidPaise,
    /* Can go negative — that is an overpayment the shop owes back, and hiding
       it behind a Math.max would be the app lying about money. */
    balancePaise: totalPaise - paidPaise,
  };
}

/* ── order numbers ────────────────────────────────────────────────────── */

/**
 * '26-0147' — two-digit year, then a per-year sequence. Short enough to read
 * out over the phone. Derived from the highest existing number for the year
 * rather than a counter row, so it cannot drift out of step with reality.
 */
export function nextOrderNo(now = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const rows = db
    .select({ orderNo: orders.orderNo })
    .from(orders)
    .where(sql`${orders.orderNo} LIKE ${yy + "-%"}`)
    .all();

  let highest = 0;
  for (const row of rows) {
    const n = Number(row.orderNo.split("-")[1]);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `${yy}-${String(highest + 1).padStart(4, "0")}`;
}

/* ── reads ────────────────────────────────────────────────────────────── */

export function getOrderFull(orderId: number) {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return null;

  const client = db
    .select()
    .from(clients)
    .where(eq(clients.id, order.clientId))
    .get()!;

  const items = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.sortOrder), asc(orderItems.id))
    .all();

  const itemsWithMeasurements = items.map((item) => ({
    ...item,
    lineTotalPaise: lineTotal(item),
    measurements: db
      .select()
      .from(orderItemMeasurements)
      .where(eq(orderItemMeasurements.orderItemId, item.id))
      .orderBy(asc(orderItemMeasurements.sortOrder), asc(orderItemMeasurements.id))
      .all(),
  }));

  const charges = db
    .select()
    .from(orderCharges)
    .where(eq(orderCharges.orderId, orderId))
    .orderBy(asc(orderCharges.sortOrder), asc(orderCharges.id))
    .all();

  const paymentRows = db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(asc(payments.paidOn), asc(payments.id))
    .all();

  const statusEvents = db
    .select()
    .from(orderStatusEvents)
    .where(eq(orderStatusEvents.orderId, orderId))
    .orderBy(desc(orderStatusEvents.changedAt), desc(orderStatusEvents.id))
    .all();

  const totals = computeTotals({
    items,
    charges,
    discountPaise: order.discountPaise,
    payments: paymentRows,
  });

  return {
    order,
    client,
    items: itemsWithMeasurements,
    charges,
    payments: paymentRows,
    statusEvents,
    totals,
  };
}

export type OrderFull = NonNullable<ReturnType<typeof getOrderFull>>;

/** One row per order for lists and the dashboard, with money already summed. */
export function listOrders(options?: {
  status?: OrderStatus;
  clientId?: number;
  search?: string;
  limit?: number;
}) {
  const conditions = [];
  if (options?.status) conditions.push(eq(orders.status, options.status));
  if (options?.clientId) conditions.push(eq(orders.clientId, options.clientId));
  if (options?.search) {
    const q = `%${options.search.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${orders.orderNo}) LIKE ${q} OR lower(${clients.name}) LIKE ${q} OR ${clients.phone} LIKE ${q})`,
    );
  }

  const rows = db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      orderDate: orders.orderDate,
      promisedDate: orders.promisedDate,
      status: orders.status,
      discountPaise: orders.discountPaise,
      clientId: clients.id,
      clientName: clients.name,
      clientPhone: clients.phone,
      itemsSubtotal: sql<number>`COALESCE((
        SELECT SUM((oi.stitching_rate_paise + oi.fabric_rate_paise) * oi.quantity)
        FROM order_items oi WHERE oi.order_id = orders.id
      ), 0)`,
      chargesTotal: sql<number>`COALESCE((
        SELECT SUM(oc.amount_paise) FROM order_charges oc WHERE oc.order_id = orders.id
      ), 0)`,
      paidTotal: sql<number>`COALESCE((
        SELECT SUM(p.amount_paise) FROM payments p WHERE p.order_id = orders.id
      ), 0)`,
      garments: sql<string>`COALESCE((
        SELECT GROUP_CONCAT(label, ', ') FROM (
          SELECT CASE WHEN oi.quantity > 1
                      THEN oi.garment_label || ' x' || oi.quantity
                      ELSE oi.garment_label END AS label
          FROM order_items oi WHERE oi.order_id = orders.id
          ORDER BY oi.sort_order, oi.id
        )
      ), '')`,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.orderDate), desc(orders.id))
    .limit(options?.limit ?? 500)
    .all();

  return rows.map((row) => {
    const gross = row.itemsSubtotal + row.chargesTotal;
    const discountPaise = Math.min(Math.max(row.discountPaise, 0), gross);
    const totalPaise = gross - discountPaise;
    return {
      ...row,
      totalPaise,
      balancePaise: totalPaise - row.paidTotal,
    };
  });
}

export type OrderListRow = ReturnType<typeof listOrders>[number];

/** Anything not delivered or cancelled — the shop's actual workload. */
export function listOpenOrders() {
  return listOrders().filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled",
  );
}

export function statusCounts() {
  const rows = db
    .select({ status: orders.status, count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(ne(orders.status, "cancelled"))
    .groupBy(orders.status)
    .all();
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<
    Record<OrderStatus, number>
  >;
}

/* ── garment types ────────────────────────────────────────────────────── */

export function listGarmentTypes(includeInactive = false) {
  return db
    .select()
    .from(garmentTypes)
    .where(includeInactive ? undefined : eq(garmentTypes.isActive, true))
    .orderBy(asc(garmentTypes.sortOrder), asc(garmentTypes.name))
    .all();
}
