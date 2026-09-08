import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  garmentTypes,
  measurementFields,
  measurementSets,
  measurementValues,
  orderItems,
  orders,
  payments,
  tailors,
} from "@/db/schema";
import { listOrders } from "@/lib/orders";
import { toCsv } from "@/lib/csv";
import { isUnlocked } from "@/lib/security";

/* Export every table a person would want in Excel. Amounts are written in
 * RUPEES with two decimals, not paise — a spreadsheet is for reading, and
 * nobody wants to divide a column by 100 to see what a shirt cost. */

const rupees = (paise: number) => (paise / 100).toFixed(2);

export const dynamic = "force-dynamic";

type Kind = "clients" | "orders" | "order-items" | "payments" | "measurements";

const KINDS: Kind[] = [
  "clients",
  "orders",
  "order-items",
  "payments",
  "measurements",
];

function build(kind: Kind): (string | number | null)[][] {
  if (kind === "clients") {
    const rows = db.select().from(clients).orderBy(asc(clients.name)).all();
    return [
      ["Name", "Phone", "Alternate phone", "Address", "Email", "Notes"],
      ...rows.map((c) => [c.name, c.phone, c.altPhone, c.address, c.email, c.notes]),
    ];
  }

  if (kind === "orders") {
    const rows = listOrders();
    return [
      [
        "Order no",
        "Order date",
        "Promised date",
        "Client",
        "Phone",
        "Garments",
        "Status",
        "Total",
        "Paid",
        "Balance",
      ],
      ...rows.map((o) => [
        o.orderNo,
        o.orderDate,
        o.promisedDate,
        o.clientName,
        o.clientPhone,
        o.garments,
        o.status,
        rupees(o.totalPaise),
        rupees(o.paidTotal),
        rupees(o.balancePaise),
      ]),
    ];
  }

  if (kind === "order-items") {
    const rows = db
      .select({
        orderNo: orders.orderNo,
        orderDate: orders.orderDate,
        clientName: clients.name,
        garment: orderItems.garmentLabel,
        quantity: orderItems.quantity,
        stitching: orderItems.stitchingRatePaise,
        fabric: orderItems.fabricRatePaise,
        fabricSource: orderItems.fabricSource,
        fabricNotes: orderItems.fabricNotes,
        itemNotes: orderItems.itemNotes,
        tailor: tailors.name,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .leftJoin(tailors, eq(orderItems.tailorId, tailors.id))
      .orderBy(desc(orders.orderDate), asc(orderItems.sortOrder))
      .all();

    return [
      [
        "Order no",
        "Order date",
        "Client",
        "Garment",
        "Qty",
        "Stitching",
        "Fabric",
        "Fabric from",
        "Fabric notes",
        "Garment notes",
        "Tailor",
        "Line total",
      ],
      ...rows.map((r) => [
        r.orderNo,
        r.orderDate,
        r.clientName,
        r.garment,
        r.quantity,
        rupees(r.stitching),
        rupees(r.fabric),
        r.fabricSource,
        r.fabricNotes,
        r.itemNotes,
        r.tailor,
        rupees((r.stitching + r.fabric) * r.quantity),
      ]),
    ];
  }

  if (kind === "payments") {
    const rows = db
      .select({
        paidOn: payments.paidOn,
        orderNo: orders.orderNo,
        clientName: clients.name,
        amount: payments.amountPaise,
        method: payments.method,
        note: payments.note,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .orderBy(desc(payments.paidOn), desc(payments.id))
      .all();

    return [
      ["Date", "Order no", "Client", "Amount", "Method", "Note"],
      ...rows.map((p) => [
        p.paidOn,
        p.orderNo,
        p.clientName,
        rupees(p.amount),
        p.method,
        p.note,
      ]),
    ];
  }

  // measurements — one row per recorded value, which is the shape that
  // pivots cleanly in Excel.
  const rows = db
    .select({
      clientName: clients.name,
      phone: clients.phone,
      garment: garmentTypes.name,
      takenOn: measurementSets.takenOn,
      field: measurementFields.label,
      unit: measurementFields.unit,
      value: measurementValues.valueText,
      notes: measurementSets.notes,
    })
    .from(measurementValues)
    .innerJoin(measurementSets, eq(measurementValues.setId, measurementSets.id))
    .innerJoin(clients, eq(measurementSets.clientId, clients.id))
    .innerJoin(garmentTypes, eq(measurementSets.garmentTypeId, garmentTypes.id))
    .innerJoin(
      measurementFields,
      eq(measurementValues.fieldId, measurementFields.id),
    )
    .orderBy(asc(clients.name), desc(measurementSets.takenOn))
    .all();

  return [
    ["Client", "Phone", "Garment", "Date measured", "Field", "Unit", "Value", "Set notes"],
    ...rows.map((m) => [
      m.clientName,
      m.phone,
      m.garment,
      m.takenOn,
      m.field,
      m.unit,
      m.value,
      m.notes,
    ]),
  ];
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  /* The export is the whole client list in one file. If the shop PIN is on and
     this device has not been unlocked, it does not get to download that by
     guessing a URL. */
  if (!(await isUnlocked())) {
    return new Response("Locked. Unlock the app first.", { status: 403 });
  }

  const { kind } = await context.params;
  if (!KINDS.includes(kind as Kind)) {
    return new Response("Unknown export", { status: 404 });
  }

  const csv = toCsv(build(kind as Kind));
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="arsu-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
