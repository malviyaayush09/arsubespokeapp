import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { formatPaise } from "@/lib/money";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUnlocked();

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  /* One query, with the per-client rollups as correlated subqueries. Name and
     phone are both searched, because at a counter a returning client is far
     more likely to give a number than to spell their name.

     NOTE the correlations are written as literal `clients.id`, NOT as
     ${'clients.id'}. When the outer query has no join, Drizzle renders an
     interpolated column as bare "id" — and inside `FROM orders o WHERE
     o.client_id = "id"` SQLite resolves "id" to o.id, so every row compared an
     order's client_id against its own primary key. No error, just wrong
     numbers on every client: this page showed all four clients with 1 order
     and the same amount owing. */
  const like = `%${query.toLowerCase()}%`;
  const rows = db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      orderCount: sql<number>`COALESCE((
        SELECT COUNT(*) FROM orders o WHERE o.client_id = clients.id
      ), 0)`,
      lastOrderDate: sql<string | null>`(
        SELECT MAX(o.order_date) FROM orders o WHERE o.client_id = clients.id
      )`,
      measurementCount: sql<number>`COALESCE((
        SELECT COUNT(*) FROM measurement_sets m WHERE m.client_id = clients.id
      ), 0)`,
      duePaise: sql<number>`COALESCE((
        SELECT SUM(bal) FROM (
          SELECT
            COALESCE((SELECT SUM((oi.stitching_rate_paise + oi.fabric_rate_paise) * oi.quantity)
                      FROM order_items oi WHERE oi.order_id = o.id), 0)
          + COALESCE((SELECT SUM(oc.amount_paise) FROM order_charges oc WHERE oc.order_id = o.id), 0)
          - MIN(o.discount_paise,
                COALESCE((SELECT SUM((oi.stitching_rate_paise + oi.fabric_rate_paise) * oi.quantity)
                          FROM order_items oi WHERE oi.order_id = o.id), 0)
              + COALESCE((SELECT SUM(oc.amount_paise) FROM order_charges oc WHERE oc.order_id = o.id), 0))
          - COALESCE((SELECT SUM(p.amount_paise) FROM payments p WHERE p.order_id = o.id), 0) AS bal
          FROM orders o
          WHERE o.client_id = clients.id AND o.status != 'cancelled'
        ) WHERE bal > 0
      ), 0)`,
    })
    .from(clients)
    .where(
      query
        ? sql`(lower(${clients.name}) LIKE ${like} OR ${clients.phone} LIKE ${like})`
        : undefined,
    )
    .orderBy(desc(clients.updatedAt))
    .limit(300)
    .all();

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} ${rows.length === 1 ? "client" : "clients"}${query ? ` matching “${query}”` : ""}`}
        action={
          <Link href="/clients/new" className="btn-primary btn-sm">
            New client
          </Link>
        }
      />

      <form className="mb-4 flex gap-2" action="/clients">
        <input
          className="field"
          name="q"
          defaultValue={query}
          placeholder="Search by name or phone…"
          autoComplete="off"
        />
        <button className="btn-secondary" type="submit">
          Search
        </button>
        {query ? (
          <Link href="/clients" className="btn-secondary">
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={query ? "No client matches that" : "No clients yet"}
          hint={
            query
              ? "Try just the last four digits of the phone number."
              : "Add the first client and their measurements will live here."
          }
          href="/clients/new"
          cta="Add client"
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bone">
                <th className="th">Name</th>
                <th className="th">Phone</th>
                <th className="th text-right">Orders</th>
                <th className="th text-right">Measurements</th>
                <th className="th">Last order</th>
                <th className="th text-right">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-bone">
                  <td className="td font-medium">
                    <Link href={`/clients/${row.id}`} className="hover:text-gold">
                      {row.name}
                    </Link>
                  </td>
                  <td className="td tabular-nums">{row.phone}</td>
                  <td className="td text-right tabular-nums">{row.orderCount}</td>
                  <td className="td text-right tabular-nums">{row.measurementCount}</td>
                  <td className="td text-ink-2">{row.lastOrderDate ?? "—"}</td>
                  <td className="td text-right">
                    {row.duePaise > 0 ? (
                      <span className="font-medium text-danger tabular-nums">
                        {formatPaise(row.duePaise)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
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
