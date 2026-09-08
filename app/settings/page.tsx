import Link from "next/link";
import { DB_PATH } from "@/db";
import { getSettingsMap } from "@/lib/settings";
import { listGarmentTypes } from "@/lib/orders";
import { listTailors } from "@/lib/reports";
import { isPinEnabled } from "@/lib/security";
import {
  autoBackupEnabled,
  backupDir,
  daysSinceBackup,
  keepCount,
  lastBackupAt,
  listBackups,
} from "@/lib/backup";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BackupPanel, ShopSettingsForm } from "@/components/settings-forms";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

const EXPORTS = [
  { kind: "clients", label: "Clients" },
  { kind: "orders", label: "Orders (one row each)" },
  { kind: "order-items", label: "Garments (one row each)" },
  { kind: "payments", label: "Payments" },
  { kind: "measurements", label: "Measurements" },
];

export default async function SettingsPage() {
  await requireUnlocked();

  const values = getSettingsMap();
  const garments = listGarmentTypes(true);
  const tailors = listTailors(true);
  const last = lastBackupAt();

  return (
    <>
      <PageHeader title="Settings" />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          href="/settings/garments"
          title="Garment types"
          detail={`${garments.length} configured`}
        />
        <Card
          href="/settings/tailors"
          title="Tailors"
          detail={
            tailors.length
              ? `${tailors.length} on the books`
              : "None added yet"
          }
        />
        <Card
          href="/settings/security"
          title="Shop PIN"
          detail={isPinEnabled() ? "On" : "Off — anyone can open the app"}
          warn={!isPinEnabled()}
        />
        <Card
          href="/settings/import"
          title="Import from Excel"
          detail="Bring the old spreadsheet across"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            Letterhead
          </h2>
          <ShopSettingsForm values={values} />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            Data
          </h2>
          <BackupPanel
            dir={backupDir()}
            auto={autoBackupEnabled()}
            keep={keepCount()}
            lastBackup={last ? formatDateTime(last) : null}
            daysSince={daysSinceBackup()}
            recent={listBackups()
              .slice(0, 5)
              .map((file) => ({
                name: file.name,
                bytes: file.bytes,
                modified: file.modified.toISOString(),
              }))}
          />
          <p className="mt-2 text-xs break-all text-muted">Database: {DB_PATH}</p>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            Export to Excel
          </h2>
          <div className="card p-5">
            <p className="text-sm text-muted">
              Downloads a CSV that opens straight in Excel. Amounts are in
              rupees, not paise, so nothing needs converting.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXPORTS.map((item) => (
                <a
                  key={item.kind}
                  href={`/api/export/${item.kind}`}
                  className="btn-secondary btn-sm"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              These are a copy for reading and for an accountant — they are not
              a backup. A CSV cannot be loaded back into the app; the{" "}
              <strong>.db</strong> file from Backup is the one that restores.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function Card({
  href,
  title,
  detail,
  warn,
}: {
  href: string;
  title: string;
  detail: string;
  warn?: boolean;
}) {
  return (
    <Link href={href} className="card block p-4 transition hover:border-gold">
      <div className="font-medium">{title}</div>
      <div className={`mt-0.5 text-sm ${warn ? "text-danger" : "text-muted"}`}>
        {detail}
      </div>
    </Link>
  );
}
