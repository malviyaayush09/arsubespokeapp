import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { CATEGORY_LABELS, clients, garmentTypes } from "@/db/schema";
import { getFieldsFor, getLatestSet, parseChoices } from "@/lib/measurements";
import { listGarmentTypes } from "@/lib/orders";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { MeasurementForm } from "@/components/measurement-form";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function NewMeasurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ garmentTypeId?: string }>;
}) {
  await requireUnlocked();

  const { id } = await params;
  const { garmentTypeId } = await searchParams;

  const clientId = Number(id);
  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) notFound();

  /* No garment chosen yet: pick one first, then the right fields render
     server-side. Keeps the form honest — the inputs on screen are always
     exactly the fields configured for that garment. */
  if (!garmentTypeId) {
    const types = listGarmentTypes();
    const grouped = Object.entries(
      types.reduce<Record<string, typeof types>>((acc, type) => {
        (acc[type.category] ??= []).push(type);
        return acc;
      }, {}),
    );

    return (
      <>
        <PageHeader
          title="Take measurements"
          subtitle={`For ${client.name} — pick the garment first.`}
        />
        <div className="space-y-5">
          {grouped.map(([category, list]) => (
            <div key={category}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((type) => (
                  <Link
                    key={type.id}
                    href={`/clients/${clientId}/measurements/new?garmentTypeId=${type.id}`}
                    className="card px-4 py-3 font-medium transition hover:border-gold"
                  >
                    {type.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const typeId = Number(garmentTypeId);
  const garment = db
    .select()
    .from(garmentTypes)
    .where(eq(garmentTypes.id, typeId))
    .get();
  if (!garment) notFound();

  const fields = getFieldsFor(typeId).map((field) => ({
    ...field,
    choiceList: parseChoices(field),
  }));

  /* Prefill from the last time this client was measured for this garment. Most
     visits change two or three numbers, not fifteen. */
  const previous = getLatestSet(clientId, typeId);
  const values = previous
    ? Object.fromEntries(
        Object.entries(previous.values).map(([fieldId, v]) => [
          Number(fieldId),
          v.valueText,
        ]),
      )
    : undefined;

  return (
    <>
      <PageHeader
        title="Take measurements"
        subtitle={
          previous
            ? `${client.name} — prefilled from ${previous.set.takenOn}. Change what has changed.`
            : `${client.name} — first time for this garment.`
        }
      />
      <MeasurementForm
        clientId={clientId}
        garmentTypeId={typeId}
        garmentName={garment.name}
        fields={fields}
        takenOn={today()}
        values={values}
      />
    </>
  );
}
