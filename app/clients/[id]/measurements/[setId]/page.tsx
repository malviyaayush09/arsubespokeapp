import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import {
  getFieldsFor,
  getSetWithValues,
  listSetsForClient,
  parseChoices,
} from "@/lib/measurements";
import { describeDelta } from "@/lib/measure";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { MeasurementForm } from "@/components/measurement-form";
import { DeleteSetButton } from "./delete-button";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function MeasurementSetPage({
  params,
}: {
  params: Promise<{ id: string; setId: string }>;
}) {
  await requireUnlocked();

  const { id, setId } = await params;
  const clientId = Number(id);

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  const record = getSetWithValues(Number(setId));
  if (!client || !record || record.set.clientId !== clientId) notFound();

  const fields = getFieldsFor(record.set.garmentTypeId).map((field) => ({
    ...field,
    choiceList: parseChoices(field),
  }));

  const values = Object.fromEntries(
    Object.entries(record.values).map(([fieldId, v]) => [Number(fieldId), v.valueText]),
  );

  /* The set taken immediately before this one, same garment type — used to
     show what actually changed between visits. */
  const history = listSetsForClient(clientId).filter(
    (s) => s.garmentTypeId === record.set.garmentTypeId,
  );
  const index = history.findIndex((s) => s.id === record.set.id);
  const older = index >= 0 && index < history.length - 1 ? history[index + 1] : null;
  const previous = older ? getSetWithValues(older.id) : null;

  const changes = previous
    ? fields
        .map((field) => {
          const before = previous.values[field.id]?.valueNum;
          const after = record.values[field.id]?.valueNum;
          if (before === undefined || after === undefined) return null;
          if (before === null || after === null) return null;
          const delta = describeDelta(before, after);
          return delta ? { label: field.label, delta, unit: field.unit } : null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
    : [];

  return (
    <>
      <PageHeader
        title={`${record.garmentName} — ${formatDate(record.set.takenOn)}`}
        subtitle={`${client.name} · editing corrects this record in place; use “Take measurements” to record a new visit.`}
        action={<DeleteSetButton clientId={clientId} setId={record.set.id} />}
      />

      {previous && changes.length > 0 ? (
        <div className="card mb-4 p-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Changed since {formatDate(previous.set.takenOn)}
          </h2>
          <div className="flex flex-wrap gap-2">
            {changes.map((change) => (
              <span key={change.label} className="chip bg-gold-soft text-gold">
                {change.label} {change.delta}
                {change.unit ? ` ${change.unit}` : ""}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <MeasurementForm
        clientId={clientId}
        garmentTypeId={record.set.garmentTypeId}
        garmentName={record.garmentName}
        fields={fields}
        setId={record.set.id}
        takenOn={record.set.takenOn}
        notes={record.set.notes}
        values={values}
      />
    </>
  );
}
