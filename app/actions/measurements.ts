"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { measurementSets, measurementValues } from "@/db/schema";
import { getFieldsFor } from "@/lib/measurements";
import { parseMeasurement } from "@/lib/measure";
import { today } from "@/lib/format";

export type ActionState = { error?: string };

/**
 * Saves a measurement set. With no setId this creates a NEW dated set rather
 * than replacing the last one — that is what makes the history a history. An
 * explicit setId edits in place, which exists for fixing a typo, not for
 * re-measuring.
 */
export async function saveMeasurementSet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const clientId = Number(formData.get("clientId"));
  const garmentTypeId = Number(formData.get("garmentTypeId"));
  const setIdRaw = formData.get("setId");
  const setId = setIdRaw ? Number(setIdRaw) : null;

  if (!Number.isFinite(clientId) || !Number.isFinite(garmentTypeId)) {
    return { error: "Pick a garment type" };
  }

  const takenOn = String(formData.get("takenOn") ?? "").trim() || today();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const fields = getFieldsFor(garmentTypeId);

  const entered = fields
    .map((field) => {
      const raw = formData.get(`m_${field.id}`);
      if (raw === null) return null;
      const { text, num } = parseMeasurement(String(raw));
      if (text === "") return null;
      return { fieldId: field.id, valueText: text, valueNum: num };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (entered.length === 0) {
    return { error: "Enter at least one measurement" };
  }

  const savedId = db.transaction((tx) => {
    let id = setId;

    if (id) {
      tx.update(measurementSets)
        .set({ takenOn, notes })
        .where(eq(measurementSets.id, id))
        .run();
      /* Replace wholesale: a field cleared on the form must disappear from the
         set, not linger from the previous save. */
      tx.delete(measurementValues).where(eq(measurementValues.setId, id)).run();
    } else {
      const created = tx
        .insert(measurementSets)
        .values({ clientId, garmentTypeId, takenOn, notes })
        .returning({ id: measurementSets.id })
        .get();
      id = created.id;
    }

    tx.insert(measurementValues)
      .values(entered.map((row) => ({ ...row, setId: id! })))
      .run();

    return id;
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/measurements/${savedId}`);
  redirect(`/clients/${clientId}`);
}

export async function deleteMeasurementSet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const setId = Number(formData.get("setId"));
  const clientId = Number(formData.get("clientId"));
  if (!Number.isFinite(setId) || !Number.isFinite(clientId)) {
    return { error: "Unknown measurement set" };
  }

  /* Orders that used these numbers keep their own frozen copy, so deleting a
     set here can never change what a past garment was cut to. */
  db.delete(measurementSets).where(eq(measurementSets.id, setId)).run();

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}
