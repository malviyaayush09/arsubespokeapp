import Link from "next/link";
import { listTailors, tailorWorkload } from "@/lib/reports";
import { PageHeader } from "@/components/ui";
import { NewTailorForm, TailorRow } from "@/components/tailor-forms";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function TailorsPage() {
  await requireUnlocked();

  const tailors = listTailors(true);
  const { rows: workload, unassignedGarments } = tailorWorkload();
  const load = new Map(workload.map((r) => [r.tailorId, Number(r.garments)]));

  return (
    <>
      <PageHeader
        title="Tailors"
        subtitle="Assign garments to a karigar on the order screen, then see everyone's load here and in Reports."
        action={
          <Link href="/settings" className="btn-secondary btn-sm">
            Back to settings
          </Link>
        }
      />

      <div className="space-y-4">
        {tailors.length > 0 ? (
          <div className="card divide-y divide-line">
            {tailors.map((tailor) => (
              <TailorRow
                key={tailor.id}
                tailor={tailor}
                garments={load.get(tailor.id) ?? 0}
              />
            ))}
          </div>
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-muted">
            No tailors yet. Add them below and each garment on an order can be
            assigned to one.
          </p>
        )}

        {unassignedGarments > 0 ? (
          <p className="rounded-md border border-gold/30 bg-gold-soft px-4 py-2.5 text-sm text-gold">
            {unassignedGarments} garment
            {unassignedGarments === 1 ? " is" : "s are"} in progress with nobody
            assigned.
          </p>
        ) : null}

        <NewTailorForm />
      </div>

      <p className="mt-4 text-xs text-muted">
        Removing a tailor who has garments on record only marks them inactive —
        deleting the row would erase who made every garment they ever touched,
        which is history worth keeping. Inactive tailors stop appearing in the
        assignment dropdown.
      </p>
    </>
  );
}
