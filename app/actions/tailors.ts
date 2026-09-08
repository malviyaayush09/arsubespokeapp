"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, tailors } from "@/db/schema";

export type ActionState = { error?: string; message?: string };
const ok: ActionState = {};

export async function createTailor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the tailor a name" };

  const count = db.select({ n: sql<number>`COUNT(*)` }).from(tailors).get();

  db.insert(tailors)
    .values({
      name,
      phone: String(formData.get("phone") ?? "").trim() || null,
      sortOrder: (count?.n ?? 0) * 10,
    })
    .run();

  revalidatePath("/settings/tailors");
  revalidatePath("/workload");
  return ok;
}

export async function updateTailor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!Number.isFinite(id)) return { error: "Unknown tailor" };
  if (!name) return { error: "Give the tailor a name" };

  db.update(tailors)
    .set({
      name,
      phone: String(formData.get("phone") ?? "").trim() || null,
      isActive: formData.get("isActive") === "on",
    })
    .where(eq(tailors.id, id))
    .run();

  revalidatePath("/settings/tailors");
  revalidatePath("/workload");
  return ok;
}

/**
 * A tailor who has been assigned work is deactivated rather than deleted, the
 * same way a garment type is. `order_items.tailor_id` is ON DELETE SET NULL,
 * so a real delete would quietly erase who made every garment they ever
 * touched — which is exactly the history worth keeping.
 */
export async function deleteTailor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return { error: "Unknown tailor" };

  const assigned = db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.tailorId, id))
    .limit(1)
    .get();

  if (assigned) {
    db.update(tailors).set({ isActive: false }).where(eq(tailors.id, id)).run();
    revalidatePath("/settings/tailors");
    revalidatePath("/workload");
    return {
      error:
        "This tailor has garments on record, so they were marked inactive instead of deleted. Past orders keep their name.",
    };
  }

  db.delete(tailors).where(eq(tailors.id, id)).run();
  revalidatePath("/settings/tailors");
  revalidatePath("/workload");
  return ok;
}
