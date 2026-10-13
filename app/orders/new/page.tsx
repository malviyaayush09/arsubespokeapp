import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { CATEGORY_LABELS, clients, measurementSets } from "@/db/schema";
import {
  listGarmentTypes,
  listMeasurementGroups,
  nextOrderNo,
} from "@/lib/orders";
import {
  getGroupsFor,
  getOwnMeasurementFields,
  parseChoices,
} from "@/lib/measurements";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { NewOrderForm } from "@/components/new-order-form";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

/* ONE SCREEN, top to bottom, in the order the conversation happens.
 *
 * It used to take four: Clients -> New client -> (which lands on his page) ->
 * Take measurements -> New order. That sequence is the database showing
 * through: a client record has to exist before an order can point at it. It
 * is not how a counter works. Someone walks in and wants two shirts; on paper
 * that is one sheet, filled from the top.
 *
 * So the client is chosen or created here, the measurements are taken here if
 * they have never been taken, and a new client feels no different from a
 * returning one.
 */
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireUnlocked();

  /* Still honoured, so "New order" from a client's own page arrives with him
     already chosen. It is simply no longer the only way in. */
  const { clientId } = await searchParams;
  const preselected = Number(clientId) || null;

  const people = db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      orderCount: sql<number>`COALESCE((
        SELECT COUNT(*) FROM orders o WHERE o.client_id = clients.id
      ), 0)`,
    })
    .from(clients)
    .orderBy(desc(clients.updatedAt))
    .all();

  const groups = listMeasurementGroups().map((group) => ({
    id: group.id,
    name: group.name,
    fields: getOwnMeasurementFields(group.id).map((field) => ({
      id: field.id,
      label: field.label,
      unit: field.unit,
      hint: field.hint,
      fieldType: field.fieldType,
      choiceList: parseChoices(field),
    })),
  }));

  const garments = listGarmentTypes().map((type) => ({
    id: type.id,
    name: type.name,
    category: type.category,
    categoryLabel: CATEGORY_LABELS[type.category],
    /* Which halves of the body this garment needs. The form uses it to work
       out, from whatever is ticked, which measurements are missing. */
    groupIds: getGroupsFor(type.id).map((g) => g.id),
  }));

  /* Who has been measured, for which half, and when. Two groups and one row
     per session, so this stays a small query however many clients there are -
     and having it up front means ticking a garment can reveal the missing
     measurements immediately, with no round trip to the server. */
  const measuredRows = db
    .select({
      clientId: measurementSets.clientId,
      groupId: measurementSets.garmentTypeId,
      takenOn: sql<string>`MAX(${measurementSets.takenOn})`,
    })
    .from(measurementSets)
    .groupBy(measurementSets.clientId, measurementSets.garmentTypeId)
    .all();

  const measured: Record<number, Record<number, string>> = {};
  for (const row of measuredRows) {
    (measured[row.clientId] ??= {})[row.groupId] = row.takenOn;
  }

  const preselectedExists =
    preselected !== null &&
    (people.some((p) => p.id === preselected) ||
      db.select().from(clients).where(eq(clients.id, preselected)).get() !==
        undefined);

  return (
    <>
      <PageHeader
        title="New order"
        subtitle="Who it is for, what they want, and the measurements — on one screen."
      />
      <NewOrderForm
        people={people}
        preselectedClientId={preselectedExists ? preselected : null}
        garments={garments}
        groups={groups}
        measured={measured}
        today={today()}
        suggestedOrderNo={nextOrderNo()}
      />
    </>
  );
}
