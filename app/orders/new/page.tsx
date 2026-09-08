import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { CATEGORY_LABELS, clients } from "@/db/schema";
import { listGarmentTypes } from "@/lib/orders";
import { listMeasuredGarments } from "@/lib/measurements";
import { formatDate, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ClientPicker } from "@/components/client-picker";
import { NewOrderForm } from "@/components/new-order-form";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireUnlocked();

  const { clientId } = await searchParams;

  /* Step one: who is it for. Choosing the client first is what lets the next
     screen show, per garment, whether measurements already exist. */
  if (!clientId) {
    const rows = db
      .select({
        id: clients.id,
        name: clients.name,
        phone: clients.phone,
        orderCount: sql<number>`COALESCE((
          SELECT COUNT(*) FROM orders o WHERE o.client_id = clients.id
        ), 0)`,
      })
      .from(clients)
      .orderBy(desc(clients.updatedAt))
      .all();

    return (
      <>
        <PageHeader
          title="New order"
          subtitle="Who is it for?"
          action={
            <Link href="/clients/new" className="btn-secondary btn-sm">
              New client
            </Link>
          }
        />
        {rows.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="font-medium">No clients yet</p>
            <p className="mt-1 text-sm text-muted">
              An order needs someone to belong to.
            </p>
            <Link href="/clients/new" className="btn-primary mt-4">
              Add the first client
            </Link>
          </div>
        ) : (
          <ClientPicker clients={rows} hrefBase="/orders/new?clientId=" />
        )}
      </>
    );
  }

  const id = Number(clientId);
  const client = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!client) notFound();

  const measured = new Map(
    listMeasuredGarments(id).map((m) => [m.garmentTypeId, m.takenOn]),
  );

  const garments = listGarmentTypes().map((type) => ({
    id: type.id,
    name: type.name,
    category: type.category,
    categoryLabel: CATEGORY_LABELS[type.category],
    measuredOn: measured.has(type.id) ? formatDate(measured.get(type.id)!) : null,
  }));

  return (
    <>
      <PageHeader
        title="New order"
        subtitle={
          <>
            For{" "}
            <Link href={`/clients/${client.id}`} className="text-gold hover:underline">
              {client.name}
            </Link>{" "}
            · {client.phone} ·{" "}
            <Link href="/orders/new" className="text-gold hover:underline">
              change
            </Link>
          </>
        }
      />
      <NewOrderForm
        clientId={client.id}
        clientName={client.name}
        garments={garments}
        today={today()}
      />
    </>
  );
}
