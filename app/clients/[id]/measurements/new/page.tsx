import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, garmentTypes } from "@/db/schema";
import {
  getLatestSet,
  getOwnMeasurementFields,
  listMeasurementTargets,
  parseChoices,
} from "@/lib/measurements";
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

  /* Nothing chosen yet. The choice is which HALF OF THE BODY, not which
     garment: measuring an upper body once serves the Shirt, the Kurta, the
     Coat and five others, exactly as on his sheet. */
  if (!garmentTypeId) {
    const targets = listMeasurementTargets();
    const groups = targets.filter((t) => t.isGroup);
    const extras = targets.filter((t) => !t.isGroup);

    return (
      <>
        <PageHeader title="Take measurements" subtitle={`For ${client.name}.`} />
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((target) => (
              <Link
                key={target.id}
                href={`/clients/${clientId}/measurements/new?garmentTypeId=${target.id}`}
                className="card p-5 transition hover:border-gold"
              >
                <div className="font-serif text-lg">{target.name}</div>
                <div className="mt-1 text-sm text-muted">
                  {target.fieldCount} measurement
                  {target.fieldCount === 1 ? "" : "s"}
                </div>
                {target.servesNames.length > 0 ? (
                  <div className="mt-2 text-xs text-muted">
                    Used for {target.servesNames.join(", ")}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>

          {extras.length > 0 ? (
            <div>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Extra, for one garment only
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {extras.map((target) => (
                  <Link
                    key={target.id}
                    href={`/clients/${clientId}/measurements/new?garmentTypeId=${target.id}`}
                    className="card px-4 py-3 text-sm font-medium transition hover:border-gold"
                  >
                    {target.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
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

  const fields = getOwnMeasurementFields(typeId).map((field) => ({
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
