import Link from "next/link";
import { uncollected } from "@/lib/reports";
import { getShop } from "@/lib/settings";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { EmptyState, Money, PageHeader } from "@/components/ui";
import { WaButton } from "@/components/wa-button";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function UncollectedPage() {
  await requireUnlocked();

  const rows = uncollected();
  const shop = getShop();

  const valuePaise = rows.reduce((sum, row) => sum + row.totalPaise, 0);
  const owedPaise = rows.reduce(
    (sum, row) => sum + Math.max(0, row.balancePaise),
    0,
  );
  const garments = rows.length;
  const stale = rows.filter((r) => (r.daysWaiting ?? 0) >= 7).length;

  return (
    <>
      <PageHeader
        title="Ready, not collected"
        subtitle="Finished garments still in the shop. Oldest first."
        action={
          <Link href="/orders?status=ready" className="btn-secondary btn-sm">
            All ready orders
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          hint="Every finished garment has gone out. This page fills up when orders reach Ready and sit there."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-xs font-medium tracking-wide text-muted uppercase">
                Orders waiting
              </div>
              <div className="mt-1 font-serif text-3xl">{garments}</div>
              {stale > 0 ? (
                <div className="mt-1 text-xs text-danger">
                  {stale} over a week old
                </div>
              ) : null}
            </div>
            <div className="card p-4">
              <div className="text-xs font-medium tracking-wide text-muted uppercase">
                Value on the shelf
              </div>
              <div className="mt-1 font-serif text-3xl">
                {formatPaise(valuePaise)}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs font-medium tracking-wide text-muted uppercase">
                Still to collect
              </div>
              <div
                className={`mt-1 font-serif text-3xl ${owedPaise > 0 ? "text-danger" : "text-good"}`}
              >
                {formatPaise(owedPaise)}
              </div>
            </div>
          </div>

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bone">
                  <th className="th">Waiting</th>
                  <th className="th">Order</th>
                  <th className="th">Client</th>
                  <th className="th">Garments</th>
                  <th className="th text-right">Balance</th>
                  <th className="th">Remind</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const days = row.daysWaiting;
                  const context = {
                    clientName: row.clientName,
                    orderNo: row.orderNo,
                    shopName: shop.name,
                    balance:
                      row.balancePaise > 0 ? formatPaise(row.balancePaise) : undefined,
                  };

                  return (
                    <tr key={row.id} className="hover:bg-bone">
                      <td className="td">
                        <span
                          className={
                            days !== null && days >= 14
                              ? "font-semibold text-danger"
                              : days !== null && days >= 7
                                ? "font-medium text-gold"
                                : "text-ink-2"
                          }
                        >
                          {days === null
                            ? "—"
                            : days === 0
                              ? "Today"
                              : `${days} day${days === 1 ? "" : "s"}`}
                        </span>
                        {row.readySince ? (
                          <div className="text-xs text-muted">
                            since {formatDate(row.readySince)}
                          </div>
                        ) : null}
                      </td>
                      <td className="td font-medium">
                        <Link href={`/orders/${row.id}`} className="hover:text-gold">
                          {row.orderNo}
                        </Link>
                      </td>
                      <td className="td">
                        <Link
                          href={`/clients/${row.clientId}`}
                          className="hover:text-gold"
                        >
                          {row.clientName}
                        </Link>
                        <div className="text-xs text-muted tabular-nums">
                          {row.clientPhone}
                        </div>
                      </td>
                      <td className="td text-ink-2">{row.garments || "—"}</td>
                      <td className="td text-right">
                        <Money
                          paise={row.balancePaise}
                          className={
                            row.balancePaise > 0
                              ? "font-medium text-danger"
                              : "text-muted"
                          }
                        />
                      </td>
                      <td className="td">
                        <WaButton
                          phone={row.clientPhone}
                          template="ready"
                          context={context}
                          label="WhatsApp"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
