import Link from "next/link";
import { listGarmentTypes } from "@/lib/orders";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "@/components/import-form";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireUnlocked();

  const garments = listGarmentTypes().map((g) => ({ id: g.id, name: g.name }));

  return (
    <>
      <PageHeader
        title="Import from the old spreadsheet"
        subtitle="Bring existing clients — and optionally their measurements — across from Excel."
        action={
          <Link href="/settings" className="btn-secondary btn-sm">
            Back to settings
          </Link>
        }
      />

      <ImportForm garments={garments} />

      <div className="card mt-6 p-5 text-sm">
        <h2 className="mb-2 font-serif text-lg">Before you run it</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>
            <strong>Take a backup first</strong> (Settings → Data → Back up now).
            There is no undo on an import.
          </li>
          <li>
            One row per client. If the spreadsheet has a row per <em>order</em>,
            the same client will import several times — remove duplicates in
            Excel first, or import and merge by hand afterwards.
          </li>
          <li>
            Measurements import as one dated set per client, recorded as today
            with the note &ldquo;Imported from spreadsheet&rdquo;. If the sheet
            has a date the measurements were taken, that is not read — the
            column mapping only covers client details.
          </li>
          <li>
            Orders, bills and payment history are <strong>not</strong> imported.
            Their shape varies too much between spreadsheets to guess at, and a
            wrong balance is worse than no balance.
          </li>
        </ul>
      </div>
    </>
  );
}
