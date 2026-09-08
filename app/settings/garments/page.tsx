import Link from "next/link";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { garmentTypes } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { GarmentTypeList, NewGarmentTypeForm } from "@/components/garment-forms";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function GarmentTypesPage() {
  await requireUnlocked();

  const rows = db
    .select({
      id: garmentTypes.id,
      name: garmentTypes.name,
      slug: garmentTypes.slug,
      category: garmentTypes.category,
      isActive: garmentTypes.isActive,
      sortOrder: garmentTypes.sortOrder,
      defaultStitchingPaise: garmentTypes.defaultStitchingPaise,
      defaultFabricPaise: garmentTypes.defaultFabricPaise,
      fieldCount: sql<number>`COALESCE((
        SELECT COUNT(*) FROM measurement_fields f
        WHERE f.garment_type_id = garment_types.id
      ), 0)`,
    })
    .from(garmentTypes)
    .orderBy(asc(garmentTypes.sortOrder), asc(garmentTypes.name))
    .all();

  return (
    <>
      <PageHeader
        title="Garment types"
        subtitle="Each garment carries its own measurement fields. Nothing here needs a developer."
        action={
          <Link href="/settings" className="btn-secondary btn-sm">
            Back to settings
          </Link>
        }
      />

      <div className="space-y-4">
        <GarmentTypeList garments={rows} />
        <NewGarmentTypeForm />
      </div>
    </>
  );
}
