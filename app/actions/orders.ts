"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  garmentTypes,
  measurementSets,
  measurementValues,
  orderCharges,
  orderItemMeasurements,
  orderItems,
  orderStatusEvents,
  orders,
  payments,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type OrderStatus,
} from "@/db/schema";
import { nextOrderNo } from "@/lib/orders";
import { getFieldsFor, getLatestSet } from "@/lib/measurements";
import { parseMeasurement } from "@/lib/measure";
import { parseRupeesToPaise } from "@/lib/money";
import { today } from "@/lib/format";

export type ActionState = { error?: string };

const ok: ActionState = {};

function touch(orderId: number) {
  db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, orderId)).run();
  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

/**
 * Copies the client's latest measurements onto a brand-new order item.
 *
 * This is the snapshot rule from db/schema.ts made concrete: values are copied
 * along with their label and unit, never referenced. Fields with nothing saved
 * yet are still written as blank rows, so the cutting card shows every line the
 * garment needs and Arsu can see at a glance what is missing.
 */
function snapshotMeasurements(
  orderItemId: number,
  garmentTypeId: number,
  clientId: number,
) {
  const fields = getFieldsFor(garmentTypeId);
  if (fields.length === 0) return;

  const latest = getLatestSet(clientId, garmentTypeId);

  db.insert(orderItemMeasurements)
    .values(
      fields.map((field, index) => {
        const saved = latest?.values[field.id];
        return {
          orderItemId,
          fieldId: field.id,
          fieldCode: field.code,
          fieldLabel: field.label,
          unit: field.unit,
          valueText: saved?.valueText ?? "",
          valueNum: saved?.valueNum ?? null,
          sortOrder: field.sortOrder || index * 10,
        };
      }),
    )
    .run();
}

/* ── create ───────────────────────────────────────────────────────────── */

const CreateOrder = z.object({
  clientId: z.coerce.number().int().positive("Pick a client"),
  orderDate: z.string().min(1, "Order date is required"),
  promisedDate: z.string().optional(),
  internalNotes: z.string().trim().optional(),
});

export async function createOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = CreateOrder.safeParse({
    clientId: formData.get("clientId"),
    orderDate: formData.get("orderDate") || today(),
    promisedDate: formData.get("promisedDate") ?? "",
    internalNotes: formData.get("internalNotes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  const garmentIds = formData
    .getAll("garmentTypeIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (garmentIds.length === 0) {
    return { error: "Pick at least one garment" };
  }

  const { clientId, orderDate, promisedDate, internalNotes } = parsed.data;

  /* One transaction: an order that exists without its garments, or garments
     without their cutting card, is worse than no order at all. */
  const orderId = db.transaction((tx) => {
    const order = tx
      .insert(orders)
      .values({
        orderNo: nextOrderNo(),
        clientId,
        orderDate,
        promisedDate: promisedDate && promisedDate !== "" ? promisedDate : null,
        internalNotes: internalNotes && internalNotes !== "" ? internalNotes : null,
        status: "placed",
      })
      .returning({ id: orders.id })
      .get();

    garmentIds.forEach((garmentTypeId, index) => {
      const garment = tx
        .select()
        .from(garmentTypes)
        .where(eq(garmentTypes.id, garmentTypeId))
        .get();
      if (!garment) return;

      const item = tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          garmentTypeId: garment.id,
          garmentLabel: garment.name,
          quantity: 1,
          sortOrder: index * 10,
          /* House rates, copied not referenced. Raising the shirt rate next
             year must never reprice a bill already given to a client. */
          stitchingRatePaise: garment.defaultStitchingPaise,
          fabricRatePaise: garment.defaultFabricPaise,
        })
        .returning({ id: orderItems.id })
        .get();

      snapshotMeasurements(item.id, garment.id, clientId);
    });

    tx.insert(orderStatusEvents)
      .values({ orderId: order.id, fromStatus: null, toStatus: "placed" })
      .run();

    return order.id;
  });

  revalidatePath("/");
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

/**
 * Repeat an order — "another two shirts, same as last time".
 *
 * The measurements are copied from THAT ORDER'S cutting card, not from the
 * client's current profile. This is deliberate: if the last shirt was adjusted
 * at the trial, those adjustments live on the order and are the whole reason
 * it fitted. Pulling the profile instead would quietly undo them.
 *
 * Extras, discount and payments are not copied — those belonged to that
 * occasion, not to the garment.
 */
export async function repeatOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sourceId = Number(formData.get("orderId"));
  if (!Number.isFinite(sourceId)) return { error: "Unknown order" };

  const source = db.select().from(orders).where(eq(orders.id, sourceId)).get();
  if (!source) return { error: "Unknown order" };

  const sourceItems = db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, sourceId))
    .orderBy(asc(orderItems.sortOrder), asc(orderItems.id))
    .all();

  if (sourceItems.length === 0) {
    return { error: "That order has no garments to repeat" };
  }

  const newId = db.transaction((tx) => {
    const created = tx
      .insert(orders)
      .values({
        orderNo: nextOrderNo(),
        clientId: source.clientId,
        orderDate: today(),
        /* Left blank on purpose — a delivery date is a promise, and it should
           be made again rather than inherited from a finished job. */
        promisedDate: null,
        status: "placed",
        internalNotes: `Repeat of order ${source.orderNo}`,
      })
      .returning({ id: orders.id })
      .get();

    for (const item of sourceItems) {
      const copy = tx
        .insert(orderItems)
        .values({
          orderId: created.id,
          garmentTypeId: item.garmentTypeId,
          garmentLabel: item.garmentLabel,
          quantity: item.quantity,
          fabricSource: item.fabricSource,
          fabricNotes: item.fabricNotes,
          itemNotes: item.itemNotes,
          stitchingRatePaise: item.stitchingRatePaise,
          fabricRatePaise: item.fabricRatePaise,
          sortOrder: item.sortOrder,
          /* Not carried over: who makes this one is decided now. */
          tailorId: null,
        })
        .returning({ id: orderItems.id })
        .get();

      const measurements = tx
        .select()
        .from(orderItemMeasurements)
        .where(eq(orderItemMeasurements.orderItemId, item.id))
        .orderBy(asc(orderItemMeasurements.sortOrder), asc(orderItemMeasurements.id))
        .all();

      if (measurements.length > 0) {
        tx.insert(orderItemMeasurements)
          .values(
            measurements.map((m) => ({
              orderItemId: copy.id,
              fieldId: m.fieldId,
              fieldCode: m.fieldCode,
              fieldLabel: m.fieldLabel,
              unit: m.unit,
              valueText: m.valueText,
              valueNum: m.valueNum,
              sortOrder: m.sortOrder,
            })),
          )
          .run();
      }
    }

    tx.insert(orderStatusEvents)
      .values({
        orderId: created.id,
        fromStatus: null,
        toStatus: "placed",
        note: `Repeat of ${source.orderNo}`,
      })
      .run();

    return created.id;
  });

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath(`/clients/${source.clientId}`);
  redirect(`/orders/${newId}`);
}

/* ── status ───────────────────────────────────────────────────────────── */

export async function setOrderStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = Number(formData.get("orderId"));
  const next = String(formData.get("status") ?? "");

  if (!Number.isFinite(orderId)) return { error: "Unknown order" };
  if (!ORDER_STATUSES.includes(next as OrderStatus)) {
    return { error: "Unknown status" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return { error: "Unknown order" };
  if (order.status === next) return ok;

  db.transaction((tx) => {
    tx.update(orders)
      .set({ status: next as OrderStatus, updatedAt: new Date() })
      .where(eq(orders.id, orderId))
      .run();
    tx.insert(orderStatusEvents)
      .values({
        orderId,
        fromStatus: order.status,
        toStatus: next as OrderStatus,
        note: (formData.get("note") as string) || null,
      })
      .run();
  });

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return ok;
}

/* ── order meta ───────────────────────────────────────────────────────── */

export async function updateOrderMeta(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(orderId)) return { error: "Unknown order" };

  const orderDate = String(formData.get("orderDate") ?? "").trim();
  const promisedDate = String(formData.get("promisedDate") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();

  if (!orderDate) return { error: "Order date is required" };

  db.update(orders)
    .set({
      orderDate,
      promisedDate: promisedDate || null,
      internalNotes: internalNotes || null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .run();

  touch(orderId);
  return ok;
}

/* ── items ────────────────────────────────────────────────────────────── */

export async function addOrderItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = Number(formData.get("orderId"));
  const garmentTypeId = Number(formData.get("garmentTypeId"));
  if (!Number.isFinite(orderId) || !Number.isFinite(garmentTypeId)) {
    return { error: "Pick a garment" };
  }

  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  const garment = db
    .select()
    .from(garmentTypes)
    .where(eq(garmentTypes.id, garmentTypeId))
    .get();
  if (!order || !garment) return { error: "Pick a garment" };

  const existing = db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .all();

  db.transaction(() => {
    const item = db
      .insert(orderItems)
      .values({
        orderId,
        garmentTypeId: garment.id,
        garmentLabel: garment.name,
        quantity: 1,
        sortOrder: existing.length * 10,
        stitchingRatePaise: garment.defaultStitchingPaise,
        fabricRatePaise: garment.defaultFabricPaise,
      })
      .returning({ id: orderItems.id })
      .get();
    snapshotMeasurements(item.id, garment.id, order.clientId);
  });

  touch(orderId);
  return ok;
}

export async function updateOrderItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const itemId = Number(formData.get("itemId"));
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(itemId) || !Number.isFinite(orderId)) {
    return { error: "Unknown item" };
  }

  const quantity = Math.max(1, Number(formData.get("quantity")) || 1);
  const stitching = parseRupeesToPaise(String(formData.get("stitchingRate") ?? ""));
  const fabric = parseRupeesToPaise(String(formData.get("fabricRate") ?? ""));

  if (stitching === null && String(formData.get("stitchingRate") ?? "").trim() !== "") {
    return { error: "Stitching charge must be a number" };
  }
  if (fabric === null && String(formData.get("fabricRate") ?? "").trim() !== "") {
    return { error: "Fabric cost must be a number" };
  }

  const fabricSource = String(formData.get("fabricSource") ?? "client");

  const tailorRaw = String(formData.get("tailorId") ?? "").trim();
  const tailorId = tailorRaw === "" ? null : Number(tailorRaw);
  if (tailorId !== null && !Number.isFinite(tailorId)) {
    return { error: "Unknown tailor" };
  }

  db.update(orderItems)
    .set({
      quantity,
      stitchingRatePaise: Math.max(0, stitching ?? 0),
      fabricRatePaise: Math.max(0, fabric ?? 0),
      fabricSource: fabricSource === "shop" ? "shop" : "client",
      tailorId,
      fabricNotes: String(formData.get("fabricNotes") ?? "").trim() || null,
      itemNotes: String(formData.get("itemNotes") ?? "").trim() || null,
    })
    .where(eq(orderItems.id, itemId))
    .run();

  /* Measurement inputs arrive as m_<measurementRowId>. Each row is its own
     frozen snapshot line, so this edits the card for THIS garment only and
     never reaches back into the client's saved profile. */
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("m_")) continue;
    const rowId = Number(key.slice(2));
    if (!Number.isFinite(rowId)) continue;
    const { text, num } = parseMeasurement(String(raw));
    db.update(orderItemMeasurements)
      .set({ valueText: text, valueNum: num })
      .where(eq(orderItemMeasurements.id, rowId))
      .run();
  }

  touch(orderId);
  return ok;
}

export async function removeOrderItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const itemId = Number(formData.get("itemId"));
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(itemId) || !Number.isFinite(orderId)) {
    return { error: "Unknown item" };
  }
  db.delete(orderItems).where(eq(orderItems.id, itemId)).run();
  touch(orderId);
  return ok;
}

/**
 * Copy this garment's measurements back onto the client's profile as a new
 * dated set. Used when Arsu adjusts numbers at the table and wants the next
 * order to start from them. Creates a new set; it never overwrites an old one.
 */
export async function saveItemMeasurementsToClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const itemId = Number(formData.get("itemId"));
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(itemId) || !Number.isFinite(orderId)) {
    return { error: "Unknown item" };
  }

  const item = db.select().from(orderItems).where(eq(orderItems.id, itemId)).get();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!item || !order || !item.garmentTypeId) {
    return { error: "This garment type was removed, so it cannot be saved back" };
  }

  const rows = db
    .select()
    .from(orderItemMeasurements)
    .where(eq(orderItemMeasurements.orderItemId, itemId))
    .all()
    .filter((row) => row.fieldId !== null && row.valueText.trim() !== "");

  if (rows.length === 0) return { error: "Nothing to save — fill in some measurements first" };

  db.transaction((tx) => {
    const set = tx
      .insert(measurementSets)
      .values({
        clientId: order.clientId,
        garmentTypeId: item.garmentTypeId!,
        takenOn: today(),
        notes: `From order ${order.orderNo}`,
      })
      .returning({ id: measurementSets.id })
      .get();

    tx.insert(measurementValues)
      .values(
        rows.map((row) => ({
          setId: set.id,
          fieldId: row.fieldId!,
          valueText: row.valueText,
          valueNum: row.valueNum,
        })),
      )
      .run();
  });

  revalidatePath(`/clients/${order.clientId}`);
  touch(orderId);
  return ok;
}

/* ── billing ──────────────────────────────────────────────────────────── */

export async function updateDiscount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(orderId)) return { error: "Unknown order" };

  const raw = String(formData.get("discount") ?? "").trim();
  const paise = raw === "" ? 0 : parseRupeesToPaise(raw);
  if (paise === null) return { error: "Discount must be a number" };

  db.update(orders)
    .set({ discountPaise: Math.max(0, paise), updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .run();

  touch(orderId);
  return ok;
}

export async function addCharge(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(orderId)) return { error: "Unknown order" };

  const label = String(formData.get("label") ?? "").trim();
  const paise = parseRupeesToPaise(String(formData.get("amount") ?? ""));
  if (!label) return { error: "Give the charge a name" };
  if (paise === null) return { error: "Amount must be a number" };

  const existing = db
    .select({ id: orderCharges.id })
    .from(orderCharges)
    .where(eq(orderCharges.orderId, orderId))
    .all();

  db.insert(orderCharges)
    .values({ orderId, label, amountPaise: paise, sortOrder: existing.length * 10 })
    .run();

  touch(orderId);
  return ok;
}

export async function removeCharge(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const chargeId = Number(formData.get("chargeId"));
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(chargeId) || !Number.isFinite(orderId)) {
    return { error: "Unknown charge" };
  }
  db.delete(orderCharges).where(eq(orderCharges.id, chargeId)).run();
  touch(orderId);
  return ok;
}

export async function addPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(orderId)) return { error: "Unknown order" };

  const paise = parseRupeesToPaise(String(formData.get("amount") ?? ""));
  if (paise === null || paise === 0) return { error: "Enter an amount" };

  const method = String(formData.get("method") ?? "cash");
  const paidOn = String(formData.get("paidOn") ?? "").trim() || today();

  db.insert(payments)
    .values({
      orderId,
      amountPaise: paise,
      paidOn,
      method: (PAYMENT_METHODS as readonly string[]).includes(method)
        ? (method as (typeof PAYMENT_METHODS)[number])
        : "cash",
      note: String(formData.get("note") ?? "").trim() || null,
    })
    .run();

  touch(orderId);
  return ok;
}

export async function removePayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const paymentId = Number(formData.get("paymentId"));
  const orderId = Number(formData.get("orderId"));
  if (!Number.isFinite(paymentId) || !Number.isFinite(orderId)) {
    return { error: "Unknown payment" };
  }
  db.delete(payments).where(eq(payments.id, paymentId)).run();
  touch(orderId);
  return ok;
}
