import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  garmentTypes,
  measurementFields,
  measurementSets,
  measurementValues,
  type MeasurementField,
} from "@/db/schema";

export function getFieldsFor(garmentTypeId: number): MeasurementField[] {
  return db
    .select()
    .from(measurementFields)
    .where(eq(measurementFields.garmentTypeId, garmentTypeId))
    .orderBy(asc(measurementFields.sortOrder), asc(measurementFields.id))
    .all();
}

export function parseChoices(field: MeasurementField): string[] {
  if (!field.choices) return [];
  try {
    const parsed = JSON.parse(field.choices);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    /* A hand-edited choices column should degrade to a plain text box, not
       take the measurement form down with it. */
    return [];
  }
}

export type SetWithValues = {
  set: typeof measurementSets.$inferSelect;
  garmentName: string;
  /** Keyed by field id. */
  values: Record<number, { valueText: string; valueNum: number | null }>;
};

export function getSetWithValues(setId: number): SetWithValues | null {
  const row = db
    .select({ set: measurementSets, garmentName: garmentTypes.name })
    .from(measurementSets)
    .innerJoin(garmentTypes, eq(measurementSets.garmentTypeId, garmentTypes.id))
    .where(eq(measurementSets.id, setId))
    .get();
  if (!row) return null;

  const values = db
    .select()
    .from(measurementValues)
    .where(eq(measurementValues.setId, setId))
    .all();

  return {
    set: row.set,
    garmentName: row.garmentName,
    values: Object.fromEntries(
      values.map((v) => [v.fieldId, { valueText: v.valueText, valueNum: v.valueNum }]),
    ),
  };
}

/**
 * The client's most recent measurements for a garment type. Latest `takenOn`
 * wins, with id as the tie-break for two sets taken the same day.
 */
export function getLatestSet(
  clientId: number,
  garmentTypeId: number,
): SetWithValues | null {
  const set = db
    .select()
    .from(measurementSets)
    .where(
      and(
        eq(measurementSets.clientId, clientId),
        eq(measurementSets.garmentTypeId, garmentTypeId),
      ),
    )
    .orderBy(desc(measurementSets.takenOn), desc(measurementSets.id))
    .limit(1)
    .get();

  return set ? getSetWithValues(set.id) : null;
}

/** Every set this client has, newest first — the measurement history view. */
export function listSetsForClient(clientId: number) {
  return db
    .select({
      id: measurementSets.id,
      takenOn: measurementSets.takenOn,
      notes: measurementSets.notes,
      garmentTypeId: measurementSets.garmentTypeId,
      garmentName: garmentTypes.name,
    })
    .from(measurementSets)
    .innerJoin(garmentTypes, eq(measurementSets.garmentTypeId, garmentTypes.id))
    .where(eq(measurementSets.clientId, clientId))
    .orderBy(desc(measurementSets.takenOn), desc(measurementSets.id))
    .all();
}

/** Garment types this client has ever been measured for, newest set first. */
export function listMeasuredGarments(clientId: number) {
  const sets = listSetsForClient(clientId);
  const seen = new Map<number, { garmentTypeId: number; garmentName: string; takenOn: string; setId: number }>();
  for (const set of sets) {
    if (seen.has(set.garmentTypeId)) continue;
    seen.set(set.garmentTypeId, {
      garmentTypeId: set.garmentTypeId,
      garmentName: set.garmentName,
      takenOn: set.takenOn,
      setId: set.id,
    });
  }
  return [...seen.values()];
}
