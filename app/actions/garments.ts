"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  GARMENT_CATEGORIES,
  FIELD_TYPES,
  garmentTypes,
  measurementFields,
  orderItems,
  type FieldType,
  type GarmentCategory,
} from "@/db/schema";
import { parseRupeesToPaise } from "@/lib/money";

export type ActionState = { error?: string };
const ok: ActionState = {};

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "garment"
  );
}

/** Appends -2, -3 … until the slug is free. */
function uniqueSlug(base: string, ignoreId?: number) {
  let slug = base;
  let n = 1;
  for (;;) {
    const clash = db
      .select({ id: garmentTypes.id })
      .from(garmentTypes)
      .where(eq(garmentTypes.slug, slug))
      .get();
    if (!clash || clash.id === ignoreId) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function createGarmentType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  if (!name) return { error: "Give the garment a name" };

  const count = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(garmentTypes)
    .get();

  const row = db
    .insert(garmentTypes)
    .values({
      name,
      slug: uniqueSlug(slugify(name)),
      category: (GARMENT_CATEGORIES as readonly string[]).includes(category)
        ? (category as GarmentCategory)
        : "other",
      sortOrder: (count?.n ?? 0) * 10,
    })
    .returning({ id: garmentTypes.id })
    .get();

  revalidatePath("/settings/garments");
  redirect(`/settings/garments/${row.id}`);
}

export async function updateGarmentType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return { error: "Unknown garment type" };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  if (!name) return { error: "Give the garment a name" };

  const stitchingRaw = String(formData.get("defaultStitching") ?? "").trim();
  const fabricRaw = String(formData.get("defaultFabric") ?? "").trim();
  const stitching = stitchingRaw === "" ? 0 : parseRupeesToPaise(stitchingRaw);
  const fabric = fabricRaw === "" ? 0 : parseRupeesToPaise(fabricRaw);

  if (stitching === null) return { error: "Default stitching must be a number" };
  if (fabric === null) return { error: "Default fabric must be a number" };

  db.update(garmentTypes)
    .set({
      name,
      category: (GARMENT_CATEGORIES as readonly string[]).includes(category)
        ? (category as GarmentCategory)
        : "other",
      isActive: formData.get("isActive") === "on",
      /* Only new order lines pick these up. Orders already written keep the
         rate they were written at. */
      defaultStitchingPaise: Math.max(0, stitching),
      defaultFabricPaise: Math.max(0, fabric),
    })
    .where(eq(garmentTypes.id, id))
    .run();

  revalidatePath("/settings/garments");
  revalidatePath(`/settings/garments/${id}`);
  return ok;
}

/**
 * Retiring vs deleting. A garment type that has ever been ordered is only ever
 * deactivated — deleting it would blank the garment on those order items. If it
 * has never been used, it is genuinely removed.
 */
export async function deleteGarmentType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return { error: "Unknown garment type" };

  const used = db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.garmentTypeId, id))
    .limit(1)
    .get();

  if (used) {
    db.update(garmentTypes)
      .set({ isActive: false })
      .where(eq(garmentTypes.id, id))
      .run();
    revalidatePath("/settings/garments");
    return {
      error:
        "This garment has been ordered before, so it was hidden instead of deleted. Past orders keep their own copy.",
    };
  }

  db.delete(garmentTypes).where(eq(garmentTypes.id, id)).run();
  revalidatePath("/settings/garments");
  redirect("/settings/garments");
}

/* ── fields ───────────────────────────────────────────────────────────── */

export async function addField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const garmentTypeId = Number(formData.get("garmentTypeId"));
  const label = String(formData.get("label") ?? "").trim();
  if (!Number.isFinite(garmentTypeId)) return { error: "Unknown garment type" };
  if (!label) return { error: "Give the field a name" };

  const fieldType = String(formData.get("fieldType") ?? "number");
  const choicesRaw = String(formData.get("choices") ?? "").trim();
  const choices = choicesRaw
    ? choicesRaw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  if (fieldType === "choice" && choices.length === 0) {
    return { error: "A choice field needs some options, comma separated" };
  }

  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  let code = base || "field";
  let n = 1;
  while (
    db
      .select({ id: measurementFields.id })
      .from(measurementFields)
      .where(
        and(
          eq(measurementFields.garmentTypeId, garmentTypeId),
          eq(measurementFields.code, code),
        ),
      )
      .get()
  ) {
    n += 1;
    code = `${base}_${n}`;
  }

  const existing = db
    .select({ id: measurementFields.id })
    .from(measurementFields)
    .where(eq(measurementFields.garmentTypeId, garmentTypeId))
    .all();

  db.insert(measurementFields)
    .values({
      garmentTypeId,
      label,
      code,
      hint: String(formData.get("hint") ?? "").trim() || null,
      unit: fieldType === "choice" ? "" : String(formData.get("unit") ?? "in").trim(),
      fieldType: (FIELD_TYPES as readonly string[]).includes(fieldType)
        ? (fieldType as FieldType)
        : "number",
      choices: choices.length ? JSON.stringify(choices) : null,
      groupName: fieldType === "choice" ? "Style" : "Measurements",
      sortOrder: existing.length * 10,
    })
    .run();

  revalidatePath(`/settings/garments/${garmentTypeId}`);
  return ok;
}

export async function updateField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  const garmentTypeId = Number(formData.get("garmentTypeId"));
  const label = String(formData.get("label") ?? "").trim();
  if (!Number.isFinite(id)) return { error: "Unknown field" };
  if (!label) return { error: "Give the field a name" };

  const fieldType = String(formData.get("fieldType") ?? "number");
  const choicesRaw = String(formData.get("choices") ?? "").trim();
  const choices = choicesRaw
    ? choicesRaw.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  if (fieldType === "choice" && choices.length === 0) {
    return { error: "A choice field needs some options, comma separated" };
  }

  /* The code is intentionally not editable. Order snapshots carry their own
     copy of the label, so renaming here is free — but the code is the join
     back to a client's saved measurements, and changing it would orphan them.
     Everything else about a field can be changed at any time, including
     switching a measurement into a choice list and back. */
  db.update(measurementFields)
    .set({
      label,
      hint: String(formData.get("hint") ?? "").trim() || null,
      /* A choice has no unit — "Vent: Single in" is nonsense. */
      unit: fieldType === "choice" ? "" : String(formData.get("unit") ?? "").trim(),
      fieldType: (FIELD_TYPES as readonly string[]).includes(fieldType)
        ? (fieldType as FieldType)
        : "number",
      choices: choices.length ? JSON.stringify(choices) : null,
    })
    .where(eq(measurementFields.id, id))
    .run();

  revalidatePath(`/settings/garments/${garmentTypeId}`);
  return ok;
}

/**
 * Move a field one place up or down.
 *
 * Swaps sortOrder with its neighbour rather than making Arsu type numbers into
 * a box. The order of fields on screen is the order they get measured in, and
 * that order is muscle memory — it should be arranged by pointing at it.
 */
export async function moveField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  const garmentTypeId = Number(formData.get("garmentTypeId"));
  const direction = String(formData.get("direction"));
  if (!Number.isFinite(id) || !Number.isFinite(garmentTypeId)) {
    return { error: "Unknown field" };
  }

  const fields = db
    .select()
    .from(measurementFields)
    .where(eq(measurementFields.garmentTypeId, garmentTypeId))
    .orderBy(asc(measurementFields.sortOrder), asc(measurementFields.id))
    .all();

  const index = fields.findIndex((f) => f.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= fields.length) return ok;

  /* Rewrite the whole run as 0,10,20… first. Seeded and hand-added fields can
     share a sortOrder, and swapping two equal values would do nothing. */
  db.transaction((tx) => {
    const reordered = [...fields];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reordered.forEach((field, position) => {
      tx.update(measurementFields)
        .set({ sortOrder: position * 10 })
        .where(eq(measurementFields.id, field.id))
        .run();
    });
  });

  revalidatePath(`/settings/garments/${garmentTypeId}`);
  return ok;
}

/**
 * Copy a garment type and all its fields.
 *
 * Most garments are a variation on one already configured — a Bandhgala is a
 * Sherwani with a different length and no flare. Copying and editing takes a
 * minute; typing thirteen fields again does not.
 */
export async function duplicateGarmentType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return { error: "Unknown garment type" };

  const source = db
    .select()
    .from(garmentTypes)
    .where(eq(garmentTypes.id, id))
    .get();
  if (!source) return { error: "Unknown garment type" };

  const fields = db
    .select()
    .from(measurementFields)
    .where(eq(measurementFields.garmentTypeId, id))
    .orderBy(asc(measurementFields.sortOrder), asc(measurementFields.id))
    .all();

  const newId = db.transaction((tx) => {
    const copy = tx
      .insert(garmentTypes)
      .values({
        name: `${source.name} (copy)`,
        slug: uniqueSlug(slugify(`${source.name}-copy`)),
        category: source.category,
        sortOrder: source.sortOrder + 1,
      })
      .returning({ id: garmentTypes.id })
      .get();

    if (fields.length > 0) {
      tx.insert(measurementFields)
        .values(
          fields.map((field) => ({
            garmentTypeId: copy.id,
            label: field.label,
            code: field.code,
            hint: field.hint,
            unit: field.unit,
            fieldType: field.fieldType,
            choices: field.choices,
            isRequired: field.isRequired,
            groupName: field.groupName,
            sortOrder: field.sortOrder,
          })),
        )
        .run();
    }

    return copy.id;
  });

  revalidatePath("/settings/garments");
  redirect(`/settings/garments/${newId}`);
}

export async function deleteField(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  const garmentTypeId = Number(formData.get("garmentTypeId"));
  if (!Number.isFinite(id)) return { error: "Unknown field" };

  /* Order snapshots survive this: order_item_measurements.field_id is ON
     DELETE SET NULL and keeps its own label, unit and value. */
  db.delete(measurementFields).where(eq(measurementFields.id, id)).run();

  revalidatePath(`/settings/garments/${garmentTypeId}`);
  return ok;
}
