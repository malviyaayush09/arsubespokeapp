import Link from "next/link";
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/db/schema";
import { listOrders } from "@/lib/orders";
import { formatDate } from "@/lib/format";
import { DueChip, EmptyState, Money, PageHeader, StatusChip } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireUnlocked();

  const { status, q } = await searchParams;
  const query = (q ?? "").trim();
  const active = ORDER_STATUSES.includes(status as OrderStatus)
    ? (status as OrderStatus)
    : undefined;

  const rows = listOrders({ status: active, search: query || undefined });
  const outstanding = rows
    .filter((r) => r.balancePaise > 0 && r.status !== "cancelled")
    .reduce((sum, r) => sum + r.balancePaise, 0);

  const tab = (href: string, label: string, on: boolean) => (
    <Link
      key={label}
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        on ? "bg-ink text-bone" : "border border-line bg-white hover:bg-bone"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={
          <>
            {rows.length} {rows.length === 1 ? "order" : "orders"}
            {outstanding > 0 ? (
              <>
                {" · "}
                <span className="text-danger">
                  <Money paise={outstanding} /> outstanding
                </span>
              </>
            ) : null}
          </>
        }
        action={
          <Link href="/orders/new" className="btn-primary btn-sm">
            New order
          </Link>
        }
      />

      <form className="mb-3 flex gap-2" action="/orders">
        {active ? <input type="hidden" name="status" value={active} /> : null}
        <input
          className="field"
          name="q"
          defaultValue={query}
          placeholder="Search order number, client name or phone…"
          autoComplete="off"
        />
        <button className="btn-secondary" type="submit">
          Search
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {tab(query ? `/orders?q=${encodeURIComponent(query)}` : "/orders", "All", !active)}
        {ORDER_STATUSES.map((s) =>
          tab(
            `/orders?status=${s}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
            STATUS_LABELS[s],
            active === s,
          ),
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing here"
          hint={
            query || active
              ? "Try clearing the filter or the search."
              : "Create the first order to get started."
          }
          href="/orders/new"
          cta="New order"
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bone">
                <th className="th">Order</th>
                <th className="th">Client</th>
                <th className="th">Garments</th>
                <th className="th">Due</th>
                <th className="th">Status</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Balance</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-bone">
                  <td className="td font-medium">
                    <Link href={`/orders/${row.id}`} className="hover:text-gold">
                      {row.orderNo}
                    </Link>
                    <div className="text-xs text-muted">{formatDate(row.orderDate)}</div>
                  </td>
                  <td className="td">
                    <Link href={`/clients/${row.clientId}`} className="hover:text-gold">
                      {row.clientName}
                    </Link>
                    <div className="text-xs text-muted tabular-nums">{row.clientPhone}</div>
                  </td>
                  <td className="td text-ink-2">{row.garments || "—"}</td>
                  <td className="td">
                    <DueChip promisedDate={row.promisedDate} status={row.status} />
                  </td>
                  <td className="td">
                    <StatusChip status={row.status} />
                  </td>
                  <td className="td text-right">
                    <Money paise={row.totalPaise} />
                  </td>
                  <td className="td text-right">
                    <Money
                      paise={row.balancePaise}
                      className={
                        row.balancePaise > 0 ? "font-medium text-danger" : "text-muted"
                      }
                    />
                  </td>
                  <td className="td whitespace-nowrap text-right">
                    <Link
                      href={`/orders/${row.id}/print/all`}
                      className="text-xs text-gold hover:underline"
                    >
                      Print
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
