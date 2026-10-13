import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { garmentTypes } from "@/db/schema";
import { getGroupsFor, getOwnFieldsFor } from "@/lib/measurements";
import { PageHeader } from "@/components/ui";
import { FieldsEditor, GarmentTypeForm } from "@/components/garment-forms";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function GarmentTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUnlocked();

  const { id } = await params;
  const garmentTypeId = Number(id);

  const garment = db
    .select()
    .from(garmentTypes)
    .where(eq(garmentTypes.id, garmentTypeId))
    .get();
  if (!garment) notFound();

  /* OWN fields only. The shared ones belong to the measurement group and are
     edited on the group's own screen - showing them here would invite someone
     to rename Chest for Shirts and wonder why Kurtas changed too. */
  const fields = getOwnFieldsFor(garmentTypeId);
  const groups = getGroupsFor(garmentTypeId);

  return (
    <>
      <PageHeader
        title={garment.name}
        subtitle={
          groups.length > 0
            ? `Measured as ${groups.map((g) => g.name).join(" + ")}` +
              (fields.length > 0
                ? `, plus ${fields.length} field${fields.length === 1 ? "" : "s"} of its own below`
                : " — nothing extra of its own")
            : `${fields.length} field${fields.length === 1 ? "" : "s"} · these are the inputs that appear when measuring this garment`
        }
        action={
          <Link href="/settings/garments" className="btn-secondary btn-sm">
            All garment types
          </Link>
        }
      />

      <div className="space-y-4">
        <GarmentTypeForm garment={garment} />
        <FieldsEditor garmentTypeId={garmentTypeId} fields={fields} />
      </div>

      <p className="mt-4 text-xs text-muted">
        Renaming a field is safe: orders already placed keep their own copy of
        the label, unit and value they were cut to. The internal code cannot be
        changed, because it is what links a client&rsquo;s saved measurements to
        this field.
      </p>
    </>
  );
}
