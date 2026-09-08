import Link from "next/link";
import { PAYMENT_METHOD_LABELS } from "@/db/schema";
import { monthlyReport, tailorWorkload } from "@/lib/reports";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireUnlocked();

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const report = monthlyReport(year, month);
  const workload = tailorWorkload();

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const busiest = Math.max(1, ...report.garments.map((g) => Number(g.quantity)));

  return (
    <>
      <PageHeader
        title={`${MONTH_NAMES[month - 1]} ${year}`}
        subtitle={`${formatDate(report.from)} — ${formatDate(report.to)}`}
        action={
          <>
            <Link
              href={`/reports?year=${prev.y}&month=${prev.m}`}
              className="btn-secondary btn-sm"
            >
              ← {MONTH_NAMES[prev.m - 1].slice(0, 3)}
            </Link>
            <Link
              href={`/reports?year=${next.y}&month=${next.m}`}
              className="btn-secondary btn-sm"
            >
              {MONTH_NAMES[next.m - 1].slice(0, 3)} →
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Orders taken" value={String(report.orderCount)} />
        <Figure label="Billed" value={formatPaise(report.billedPaise)} />
        <Figure
          label="Collected"
          value={formatPaise(report.collectedPaise)}
          tone="good"
        />
        <Figure
          label="Outstanding (all time)"
          value={formatPaise(report.outstandingPaise)}
          tone={report.outstandingPaise > 0 ? "warn" : "good"}
        />
      </div>

      <p className="mt-2 text-xs text-muted">
        <strong>Billed</strong> is the value of orders taken this month.{" "}
        <strong>Collected</strong> is money that actually came in this month, on
        any order. They do not match, and should not — an advance in September
        can belong to an order from August. <strong>Outstanding</strong> is
        every unpaid balance as of today, not just this month&rsquo;s: a debt
        from March is still a debt.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            Garments made
          </h2>
          <div className="card p-4">
            {report.garments.length === 0 ? (
              <p className="text-sm text-muted">No garments this month.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  {report.garmentCount} garment
                  {report.garmentCount === 1 ? "" : "s"} across{" "}
                  {report.orderCount} order{report.orderCount === 1 ? "" : "s"}
                </p>
                <div className="space-y-1.5">
                  {report.garments.map((g) => (
                    <div key={g.label} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 truncate">{g.label}</span>
                      <span className="h-4 flex-1 rounded-sm bg-bone">
                        <span
                          className="block h-4 rounded-sm bg-gold/70"
                          style={{
                            width: `${Math.round((Number(g.quantity) / busiest) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right tabular-nums">
                        {g.quantity}
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums text-muted">
                        {formatPaise(Number(g.valuePaise ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <h2 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            Collected by method
          </h2>
          <div className="card p-4">
            {report.collectedByMethod.length === 0 ? (
              <p className="text-sm text-muted">Nothing collected this month.</p>
            ) : (
              <dl className="space-y-1 text-sm">
                {report.collectedByMethod.map(([method, amount]) => (
                  <div key={method} className="flex justify-between">
                    <dt>{PAYMENT_METHOD_LABELS[method]}</dt>
                    <dd className="tabular-nums">{formatPaise(amount)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Link href="/daybook" className="mt-3 inline-block text-sm text-gold hover:underline">
              Open the day book →
            </Link>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            Top clients this month
          </h2>
          <div className="card divide-y divide-line">
            {report.topClients.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">No orders this month.</p>
            ) : (
              report.topClients.map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bone"
                >
                  <span className="truncate font-medium">{client.name}</span>
                  <span className="text-xs text-muted">
                    {client.orders} order{client.orders === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {formatPaise(client.billed)}
                  </span>
                </Link>
              ))
            )}
          </div>

          <h2 className="mt-6 mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            On the bench now
          </h2>
          <div className="card divide-y divide-line">
            {workload.rows.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted">
                No tailors added yet.{" "}
                <Link href="/settings/tailors" className="text-gold hover:underline">
                  Add them
                </Link>{" "}
                to see who is making what.
              </div>
            ) : (
              workload.rows.map((row) => (
                <div
                  key={row.tailorId}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="font-medium">{row.name}</span>
                  {!row.isActive ? (
                    <span className="chip bg-danger-soft text-danger">Inactive</span>
                  ) : null}
                  <span className="ml-auto tabular-nums">
                    {Number(row.garments)} garment
                    {Number(row.garments) === 1 ? "" : "s"}
                  </span>
                </div>
              ))
            )}
            {workload.unassignedGarments > 0 ? (
              <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-muted">Unassigned</span>
                <span className="ml-auto font-medium tabular-nums text-danger">
                  {workload.unassignedGarments} garment
                  {workload.unassignedGarments === 1 ? "" : "s"}
                </span>
              </div>
            ) : null}
          </div>

          <div className="card mt-6 p-4">
            <div className="text-xs font-medium tracking-wide text-muted uppercase">
              Average order
            </div>
            <div className="mt-1 font-serif text-2xl">
              {formatPaise(report.averageOrderPaise)}
            </div>
            <p className="mt-1 text-xs text-muted">
              {report.delivered} of this month&rsquo;s {report.orderCount} order
              {report.orderCount === 1 ? "" : "s"} delivered so far.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn";
}) {
  const tones = { plain: "text-ink", good: "text-good", warn: "text-danger" };
  return (
    <div className="card p-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </div>
      <div className={`mt-1 font-serif text-2xl ${tones[tone]}`}>{value}</div>
    </div>
  );
}
