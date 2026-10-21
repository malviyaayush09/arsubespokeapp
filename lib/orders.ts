import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  clients,
  garmentTypes,
  orderCharges,
  measurementFields,
  orderItemMeasurements,
  orderItems,
  orderStatusEvents,
  orders,
  payments,
  type OrderStatus,
} from "@/db/schema";

/* garmentTypes under a second name: a measurement field's owner is itself a
   garment type (the "Upper body" template), and the same table is already
   joined elsewhere in these queries as the garment being ordered. */
const measurementOwner = alias(garmentTypes, "measurement_owner");

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

/* The names are the ones printed on his own bill, so that a figure on screen
   and a figure on paper are obviously the same figure:

     Total        the stitching lines added up
     Fabric       one cloth amount for the whole job
     Grand Total  what the client owes
     Advance      what they have paid
     Balance      what is left
*/
export type Totals = {
  /** His "Total": the stitching lines. */
  stitchingPaise: number;
  /** His "Fabric": one amount for the job. */
  fabricPaise: number;
  chargesPaise: number;
  discountPaise: number;
  /** His "Grand Total". */
  totalPaise: number;
  /** His "Advance". */
  paidPaise: number;
  balancePaise: number;
};

export function computeTotals(input: {
  items: { stitchingRatePaise: number; fabricRatePaise: number; quantity: number }[];
  charges: { amountPaise: number }[];
  /** One cloth amount for the whole job, as on his sheet. */
  fabricPaise?: number;
  discountPaise: number;
  payments: { amountPaise: number }[];
}): Totals {
  const stitchingPaise = input.items.reduce((sum, i) => sum + lineTotal(i), 0);
  const fabricPaise = Math.max(input.fabricPaise ?? 0, 0);
  const chargesPaise = input.charges.reduce((sum, c) => sum + c.amountPaise, 0);

  const beforeDiscount = stitchingPaise + fabricPaise + chargesPaise;

  /* A discount can be keyed larger than the bill by a slip of the hand. Clamp
     it rather than printing a negative total and refunding by accident. */
  const discountPaise = Math.min(Math.max(input.discountPaise, 0), beforeDiscount);

  const totalPaise = beforeDiscount - discountPaise;
  const paidPaise = input.payments.reduce((sum, p) => sum + p.amountPaise, 0);

  return {
    stitchingPaise,
    fabricPaise,
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

/**
 * Is this order number already used by another order?
 *
 * `orders.order_no` carries a unique index, so the database would refuse a
 * duplicate regardless — but it refuses by throwing, and a raw SQLite
 * constraint error is not something to put in front of a tailor. Checking
 * first lets the form say plainly which number is taken.
 *
 * `exceptId` is the order being renamed, so saving a number back onto itself
 * is not reported as a clash.
 */
export function orderNoTaken(orderNo: string, exceptId?: number): boolean {
  const row = db
    .select({ id: orders.id })
    .from(orders)
    .where(
      exceptId === undefined
        ? eq(orders.orderNo, orderNo)
        : and(eq(orders.orderNo, orderNo), ne(orders.id, exceptId)),
    )
    .get();
  return row !== undefined;
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

  /* The snapshot owns the VALUE, the label and the unit - that is rule 1, and
     it is why a past order still shows what was actually cut.

     It does not own how to DRAW the input. Whether something is a dropdown,
     and which options that dropdown offers, is presentation and belongs to
     the field as it stands today: if Arsu adds a third pocket option this
     year, the order he is editing right now should offer it. So the live
     definition is joined on for rendering only, and a field since deleted
     simply falls back to a text box, its recorded value untouched. */
  const itemsWithMeasurements = items.map((item) => ({
    ...item,
    lineTotalPaise: lineTotal(item),
    measurements: db
      .select({
        id: orderItemMeasurements.id,
        orderItemId: orderItemMeasurements.orderItemId,
        fieldId: orderItemMeasurements.fieldId,
        fieldCode: orderItemMeasurements.fieldCode,
        fieldLabel: orderItemMeasurements.fieldLabel,
        unit: orderItemMeasurements.unit,
        valueText: orderItemMeasurements.valueText,
        valueNum: orderItemMeasurements.valueNum,
        sortOrder: orderItemMeasurements.sortOrder,
        fieldType: measurementFields.fieldType,
        choices: measurementFields.choices,
        groupName: measurementFields.groupName,
        /* Which half of the body this number belongs to - "Upper body",
           "Lower body" - taken from the template that owns the field rather
           than from the up_/lo_ prefix on its code, so renaming a group in
           Shop setup renames the heading on the printed sheet with it. Null
           for a field since deleted, exactly like groupName above. */
        ownerName: measurementOwner.name,
      })
      .from(orderItemMeasurements)
      .leftJoin(
        measurementFields,
        eq(measurementFields.id, orderItemMeasurements.fieldId),
      )
      .leftJoin(
        measurementOwner,
        eq(measurementOwner.id, measurementFields.garmentTypeId),
      )
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
    fabricPaise: order.fabricPaise,
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
      fabricPaise: orders.fabricPaise,
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
    /* Must match computeTotals() exactly, including the order-level fabric
       amount. A list that quietly disagrees with the bill it links to is how
       a shop stops trusting the app. */
    const gross = row.itemsSubtotal + row.fabricPaise + row.chargesTotal;
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

/**
 * The garments that can actually be ordered.
 *
 * Measurement groups are stored as garment types (see db/schema.ts), so they
 * must be excluded here or "Upper body" turns up in the order picker as
 * something a client can buy.
 */
export function listGarmentTypes(includeInactive = false) {
  return db
    .select()
    .from(garmentTypes)
    .where(
      includeInactive
        ? eq(garmentTypes.isTemplate, false)
        : and(eq(garmentTypes.isActive, true), eq(garmentTypes.isTemplate, false)),
    )
    .orderBy(asc(garmentTypes.sortOrder), asc(garmentTypes.name))
    .all();
}

/** The measurement groups: "Upper body", "Lower body". Never orderable. */
export function listMeasurementGroups() {
  return db
    .select()
    .from(garmentTypes)
    .where(eq(garmentTypes.isTemplate, true))
    .orderBy(asc(garmentTypes.sortOrder), asc(garmentTypes.name))
    .all();
}
