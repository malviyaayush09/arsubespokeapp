import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { listOrders } from "@/lib/orders";
import { listSetsForClient } from "@/lib/measurements";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { DueChip, Money, PageHeader, StatusChip } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUnlocked();

  const { id } = await params;
  const clientId = Number(id);
  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) notFound();

  const orders = listOrders({ clientId });
  const sets = listSetsForClient(clientId);
  const due = orders
    .filter((o) => o.balancePaise > 0 && o.status !== "cancelled")
    .reduce((sum, o) => sum + o.balancePaise, 0);

  /* Newest set per garment type — what a new order would actually pull in. */
  const latestByGarment = new Map<number, (typeof sets)[number]>();
  for (const set of sets) {
    if (!latestByGarment.has(set.garmentTypeId)) {
      latestByGarment.set(set.garmentTypeId, set);
    }
  }

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={
          <span className="tabular-nums">
            {client.phone}
            {client.altPhone ? ` · ${client.altPhone}` : ""}
          </span>
        }
        action={
          <>
            <Link href={`/clients/${client.id}/edit`} className="btn-secondary btn-sm">
              Edit
            </Link>
            <Link
              href={`/clients/${client.id}/measurements/new`}
              className="btn-secondary btn-sm"
            >
              Take measurements
            </Link>
            <Link href={`/orders/new?clientId=${client.id}`} className="btn-primary btn-sm">
              New order
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 text-sm lg:col-span-1">
          <h2 className="mb-3 font-serif text-lg">Contact</h2>
          <dl className="space-y-2">
            <Row label="Phone" value={client.phone} />
            {client.altPhone ? <Row label="Alternate" value={client.altPhone} /> : null}
            {client.email ? <Row label="Email" value={client.email} /> : null}
            {client.address ? (
              <div>
                <dt className="text-xs text-muted">Address</dt>
                <dd className="whitespace-pre-line">{client.address}</dd>
              </div>
            ) : null}
          </dl>

          {client.notes ? (
            <>
              <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                Notes
              </h3>
              <p className="whitespace-pre-line text-ink-2">{client.notes}</p>
            </>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
            <div>
              <div className="text-xs text-muted">Orders</div>
              <div className="font-serif text-xl">{orders.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Outstanding</div>
              <div
                className={`font-serif text-xl ${due > 0 ? "text-danger" : "text-good"}`}
              >
                {formatPaise(due)}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
                Measurements
              </h2>
              <Link
                href={`/clients/${client.id}/measurements/new`}
                className="text-sm text-gold hover:underline"
              >
                Take new
              </Link>
            </div>

            {sets.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-muted">
                No measurements recorded. An order can still be created — the
                cutting card will just start blank.
              </p>
            ) : (
              <div className="card divide-y divide-line">
                {[...latestByGarment.values()].map((set) => {
                  const history = sets.filter(
                    (s) => s.garmentTypeId === set.garmentTypeId,
                  );
                  return (
                    <div
                      key={set.garmentTypeId}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                    >
                      <Link
                        href={`/clients/${client.id}/measurements/${set.id}`}
                        className="font-medium hover:text-gold"
                      >
                        {set.garmentName}
                      </Link>
                      <span className="text-sm text-muted">
                        last taken {formatDate(set.takenOn)}
                      </span>
                      {history.length > 1 ? (
                        <span className="chip bg-line/60 text-ink-2">
                          {history.length} sets
                        </span>
                      ) : null}
                      <div className="ml-auto flex gap-2">
                        {history.slice(1).map((old) => (
                          <Link
                            key={old.id}
                            href={`/clients/${client.id}/measurements/${old.id}`}
                            className="text-xs text-muted hover:text-gold"
                          >
                            {formatDate(old.takenOn)}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
              Order history
            </h2>
            {orders.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-muted">
                No orders yet.
              </p>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bone">
                      <th className="th">Order</th>
                      <th className="th">Garments</th>
                      <th className="th">Due</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Total</th>
                      <th className="th text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-bone">
                        <td className="td font-medium">
                          <Link href={`/orders/${order.id}`} className="hover:text-gold">
                            {order.orderNo}
                          </Link>
                          <div className="text-xs text-muted">
                            {formatDate(order.orderDate)}
                          </div>
                        </td>
                        <td className="td text-ink-2">{order.garments || "—"}</td>
                        <td className="td">
                          <DueChip
                            promisedDate={order.promisedDate}
                            status={order.status}
                          />
                        </td>
                        <td className="td">
                          <StatusChip status={order.status} />
                        </td>
                        <td className="td text-right">
                          <Money paise={order.totalPaise} />
                        </td>
                        <td className="td text-right">
                          <Money
                            paise={order.balancePaise}
                            className={
                              order.balancePaise > 0 ? "font-medium text-danger" : "text-muted"
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
