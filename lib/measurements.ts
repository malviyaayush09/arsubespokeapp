import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  garmentTypeGroups,
  garmentTypes,
  measurementFields,
  measurementSets,
  measurementValues,
  type MeasurementField,
} from "@/db/schema";

/**
 * Style is not measurement.
 *
 * Chest is a fact about the client: 40 inches, for every shirt he ever
 * orders. "One pocket" is a decision about one garment on one day. So fields
 * marked Style are asked on the ORDER, where they are chosen per job, printed
 * on the cutting copy and carried forward by Repeat order - and they are kept
 * out of the measuring form, where they would be stored against the person
 * and silently reused for the next job.
 */
export const STYLE_GROUP = "Style";

export function isStyleField(field: MeasurementField): boolean {
  return field.groupName === STYLE_GROUP;
}

/** The fields a garment owns outright, ignoring anything it inherits. */
export function getOwnFieldsFor(garmentTypeId: number): MeasurementField[] {
  return db
    .select()
    .from(measurementFields)
    .where(eq(measurementFields.garmentTypeId, garmentTypeId))
    .orderBy(asc(measurementFields.sortOrder), asc(measurementFields.id))
    .all();
}

/** What a measuring session asks for: own fields, minus the style ones. */
export function getOwnMeasurementFields(
  garmentTypeId: number,
): MeasurementField[] {
  return getOwnFieldsFor(garmentTypeId).filter((f) => !isStyleField(f));
}

/** The groups a garment draws from, in the order they get measured. */
export function getGroupsFor(
  garmentTypeId: number,
): { id: number; name: string }[] {
  return db
    .select({ id: garmentTypes.id, name: garmentTypes.name })
    .from(garmentTypeGroups)
    .innerJoin(garmentTypes, eq(garmentTypes.id, garmentTypeGroups.groupId))
    .where(eq(garmentTypeGroups.garmentTypeId, garmentTypeId))
    .orderBy(asc(garmentTypeGroups.sortOrder), asc(garmentTypes.id))
    .all();
}

/**
 * Every field on a garment's measuring form: the fields of each group it
 * belongs to, in group order, then anything it owns outright.
 *
 * A Shirt is the eleven upper-body fields. A Tuxedo Suit is those eleven plus
 * the eight lower-body ones, because a suit is coat and trousers. A Kurta is
 * the eleven plus its own extra length.
 *
 * A garment linked to no group behaves exactly as before - its own fields and
 * nothing else - which is what every garment looked like before groups
 * existed, and what a shop that has not been migrated still looks like.
 */
export function getFieldsFor(garmentTypeId: number): MeasurementField[] {
  const groupIds = getGroupsFor(garmentTypeId).map((g) => g.id);

  const inherited =
    groupIds.length === 0
      ? []
      : db
          .select()
          .from(measurementFields)
          .where(inArray(measurementFields.garmentTypeId, groupIds))
          .orderBy(
            asc(measurementFields.sortOrder),
            asc(measurementFields.id),
          )
          .all();

  /* Grouped explicitly rather than trusting the SQL order, so a suit reads
     upper body then lower the way his sheet is laid out. */
  const ordered = groupIds.flatMap((id) =>
    inherited.filter((f) => f.garmentTypeId === id),
  );

  return [...ordered, ...getOwnFieldsFor(garmentTypeId)];
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
export type MeasurementTarget = {
  id: number;
  name: string;
  /** A shared group rather than one garment. */
  isGroup: boolean;
  /** How many fields get filled in. */
  fieldCount: number;
  /** Which garments this measuring session serves. Empty for a garment's own extras. */
  servesNames: string[];
};

/**
 * What there is to measure, which is NOT the same as what can be ordered.
 *
 * Arsu measures an upper body and a lower body, so those are the two things
 * offered. A garment appears here only when it has fields of its own on top of
 * its group's - a Kurta's extra length - and a garment belonging to no group
 * appears with its own fields, which is how all of them behaved before groups
 * existed.
 */
export function listMeasurementTargets(): MeasurementTarget[] {
  const all = db
    .select()
    .from(garmentTypes)
    .where(eq(garmentTypes.isActive, true))
    .orderBy(asc(garmentTypes.sortOrder), asc(garmentTypes.name))
    .all();

  const links = db
    .select({
      garmentTypeId: garmentTypeGroups.garmentTypeId,
      groupId: garmentTypeGroups.groupId,
    })
    .from(garmentTypeGroups)
    .all();

  const nameById = new Map(all.map((t) => [t.id, t.name]));
  const targets: MeasurementTarget[] = [];

  for (const row of all) {
    /* Style fields do not make something worth measuring - they are asked on
       the order, not at the measuring table. */
    const own = getOwnMeasurementFields(row.id).length;

    if (row.isTemplate) {
      targets.push({
        id: row.id,
        name: row.name,
        isGroup: true,
        fieldCount: own,
        servesNames: links
          .filter((l) => l.groupId === row.id)
          .map((l) => nameById.get(l.garmentTypeId))
          .filter((n): n is string => Boolean(n)),
      });
      continue;
    }

    /* A garment with groups and nothing of its own has nothing to measure
       here - it is covered entirely by its groups. */
    const hasGroups = links.some((l) => l.garmentTypeId === row.id);
    if (own === 0 || (hasGroups && own === 0)) continue;

    targets.push({
      id: row.id,
      name: hasGroups ? `${row.name} — extras` : row.name,
      isGroup: false,
      fieldCount: own,
      servesNames: [],
    });
  }

  return targets;
}

/**
 * Every measurement a garment needs for this client, keyed by field id.
 *
 * THIS is what makes one measuring session serve eight garments. A client's
 * upper body is measured once, against the "Upper body" group; a Shirt, a
 * Kurta and a Sherwani then all read that same set. A suit reads both halves.
 * Anything a garment owns outright is read from its own set and layered on
 * top, so a Kurta's extra length lives with the Kurta.
 *
 * A garment with no groups falls back to its own set alone, which is how
 * every garment behaved before groups existed.
 */
export function getMergedValues(
  clientId: number,
  garmentTypeId: number,
): Record<number, { valueText: string; valueNum: number | null }> {
  const merged: Record<number, { valueText: string; valueNum: number | null }> =
    {};

  /* Groups first, then the garment's own, so a field a garment defines for
     itself wins over an inherited one of the same id - which cannot happen
     today, but costs nothing to get right. */
  for (const group of getGroupsFor(garmentTypeId)) {
    const set = getLatestSet(clientId, group.id);
    if (set) Object.assign(merged, set.values);
  }

  const own = getLatestSet(clientId, garmentTypeId);
  if (own) Object.assign(merged, own.values);

  return merged;
}

/**
 * When was this garment last measured for this client? The oldest of the
 * dates it depends on, because a suit measured up top in March and below in
 * July is only as current as March.
 *
 * Returns null when any part of it has never been measured - the order form
 * shows that in red rather than quietly writing blanks onto a cutting card.
 */
export function lastMeasuredOn(
  clientId: number,
  garmentTypeId: number,
): string | null {
  const sources = getGroupsFor(garmentTypeId).map((g) => g.id);
  if (getOwnMeasurementFields(garmentTypeId).length > 0) {
    sources.push(garmentTypeId);
  }
  if (sources.length === 0) return null;

  let oldest: string | null = null;
  for (const id of sources) {
    const set = getLatestSet(clientId, id);
    if (!set) return null;
    if (oldest === null || set.set.takenOn < oldest) oldest = set.set.takenOn;
  }
  return oldest;
}

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
