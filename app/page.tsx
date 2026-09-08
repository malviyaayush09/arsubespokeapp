import Link from "next/link";
import { STATUS_FLOW, STATUS_LABELS } from "@/db/schema";
import { listOpenOrders, listOrders, statusCounts } from "@/lib/orders";
import { uncollected } from "@/lib/reports";
import { daysSinceBackup } from "@/lib/backup";
import { formatPaise } from "@/lib/money";
import { daysUntil, formatDate } from "@/lib/format";
import { DueChip, EmptyState, Money, StatusChip, Stat } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUnlocked();

  const open = listOpenOrders();
  const counts = statusCounts();
  const all = listOrders({ limit: 8 });

  const overdue = open.filter((o) => {
    const days = daysUntil(o.promisedDate);
    return days !== null && days < 0;
  });

  const dueSoon = open.filter((o) => {
    const days = daysUntil(o.promisedDate);
    return days !== null && days >= 0 && days <= 7;
  });

  /* Dues are counted across every order that still owes money, delivered ones
     included — a garment that went out unpaid is exactly the thing a shop
     loses track of. */
  const owing = listOrders().filter(
    (o) => o.balancePaise > 0 && o.status !== "cancelled",
  );
  const outstanding = owing.reduce((sum, o) => sum + o.balancePaise, 0);

  const upcoming = [...dueSoon].sort((a, b) =>
    (a.promisedDate ?? "").localeCompare(b.promisedDate ?? ""),
  );

  const waiting = uncollected();
  const oldestWaiting = waiting.length ? (waiting[0].daysWaiting ?? 0) : 0;

  /* Two days, not one: a shop closed on Sunday should not be nagged on Monday
     morning for something that was never at risk. */
  const backupDays = daysSinceBackup();
  const backupStale = backupDays === null || backupDays >= 2;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Today at the studio</h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(new Date().toISOString().slice(0, 10))}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/clients/new" className="btn-secondary btn-sm">
            New client
          </Link>
          <Link href="/orders/new" className="btn-primary btn-sm">
            New order
          </Link>
        </div>
      </div>

      {backupStale ? (
        <p className="mb-4 rounded-md border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {backupDays === null
            ? "No backup has ever been taken. The whole shop is one file on this machine."
            : `Last backup was ${backupDays} days ago.`}{" "}
          <Link href="/settings" className="underline">
            Back up now
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="In the workroom" value={String(open.length)} href="/orders" />
        <Stat
          label="Overdue"
          value={String(overdue.length)}
          tone={overdue.length ? "warn" : "plain"}
          href="/orders"
        />
        <Stat label="Due in 7 days" value={String(dueSoon.length)} href="/orders" />
        <Stat
          label="Awaiting collection"
          value={String(waiting.length)}
          tone={oldestWaiting >= 7 ? "warn" : "plain"}
          href="/orders/uncollected"
        />
        <Stat
          label="Outstanding dues"
          value={formatPaise(outstanding)}
          tone={outstanding > 0 ? "warn" : "good"}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
          Where the work is
        </h2>
        <div className="card flex flex-wrap divide-line">
          {STATUS_FLOW.filter((s) => s !== "delivered").map((status) => (
            <Link
              key={status}
              href={`/orders?status=${status}`}
              className="flex-1 border-r border-line px-4 py-3 last:border-r-0 hover:bg-bone"
            >
              <div className="text-xs text-muted">{STATUS_LABELS[status]}</div>
              <div className="font-serif text-xl">{counts[status] ?? 0}</div>
            </Link>
          ))}
        </div>
      </section>

      {overdue.length > 0 ? (
        <Section title="Overdue" tone="warn">
          <OrderTable rows={overdue} />
        </Section>
      ) : null}

      <Section title="Coming up">
        {upcoming.length ? (
          <OrderTable rows={upcoming} />
        ) : (
          <p className="card px-4 py-6 text-center text-sm text-muted">
            Nothing due in the next seven days.
          </p>
        )}
      </Section>

      <Section title="Latest orders" href="/orders" hrefLabel="All orders">
        {all.length ? (
          <OrderTable rows={all} showStatus />
        ) : (
          <EmptyState
            title="No orders yet"
            hint="Create the first one and it will show up here."
            href="/orders/new"
            cta="New order"
          />
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  children,
  href,
  hrefLabel,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  tone?: "warn";
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2
          className={`text-sm font-semibold tracking-wide uppercase ${
            tone === "warn" ? "text-danger" : "text-muted"
          }`}
        >
          {title}
        </h2>
        {href ? (
          <Link href={href} className="text-sm text-gold hover:underline">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function OrderTable({
  rows,
  showStatus = true,
}: {
  rows: ReturnType<typeof listOrders>;
  showStatus?: boolean;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-bone">
            <th className="th">Order</th>
            <th className="th">Client</th>
            <th className="th">Garments</th>
            <th className="th">Due</th>
            {showStatus ? <th className="th">Status</th> : null}
            <th className="th text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-bone">
              <td className="td font-medium">
                <Link href={`/orders/${row.id}`} className="hover:text-gold">
                  {row.orderNo}
                </Link>
              </td>
              <td className="td">
                <Link href={`/clients/${row.clientId}`} className="hover:text-gold">
                  {row.clientName}
                </Link>
                <div className="text-xs text-muted">{row.clientPhone}</div>
              </td>
              <td className="td text-ink-2">{row.garments || "—"}</td>
              <td className="td">
                <DueChip promisedDate={row.promisedDate} status={row.status} />
              </td>
              {showStatus ? (
                <td className="td">
                  <StatusChip status={row.status} />
                </td>
              ) : null}
              <td className="td text-right">
                <Money
                  paise={row.balancePaise}
                  className={row.balancePaise > 0 ? "font-medium text-danger" : "text-muted"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
