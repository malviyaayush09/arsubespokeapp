import Link from "next/link";
import { isPinEnabled } from "@/lib/security";
import { PageHeader } from "@/components/ui";
import { PinForm } from "@/components/security-forms";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requireUnlocked();

  const enabled = isPinEnabled();

  return (
    <>
      <PageHeader
        title="Shop PIN"
        subtitle={
          enabled
            ? "On. Every device is asked for the PIN once, then stays unlocked for 30 days."
            : "Off. Anyone who can open the app can read every client record."
        }
        action={
          <Link href="/settings" className="btn-secondary btn-sm">
            Back to settings
          </Link>
        }
      />

      <PinForm enabled={enabled} />

      <div className="card mt-6 p-5 text-sm">
        <h2 className="mb-2 font-serif text-lg">What this does and does not do</h2>
        <p className="text-ink-2">
          This is a lock on an unattended tablet, not user accounts. There is
          one PIN for the whole shop, and everyone who knows it is the same
          person as far as the app is concerned — nothing records who did what.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>
            It <strong>does</strong> stop someone picking up the counter tablet
            and reading client names, phone numbers and addresses.
          </li>
          <li>
            It <strong>does</strong> cover the printed copies and the CSV
            exports, which is where the whole client list would otherwise leak.
          </li>
          <li>
            It does <strong>not</strong> protect the database file. Anyone with
            access to this machine&rsquo;s disk can open{" "}
            <code className="text-xs">data/arsu.db</code> directly — it is not
            encrypted.
          </li>
          <li>
            It does <strong>not</strong> limit how many times a PIN can be
            guessed, so use four digits that are not the shop&rsquo;s street
            number.
          </li>
        </ul>
        <p className="mt-3 text-muted">
          If the PIN is ever forgotten, it can be cleared by deleting the{" "}
          <code className="text-xs">pin_hash</code> row from the{" "}
          <code className="text-xs">settings</code> table in the database file.
        </p>
      </div>
    </>
  );
}
