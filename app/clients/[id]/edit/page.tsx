import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUnlocked();

  const { id } = await params;
  const client = db.select().from(clients).where(eq(clients.id, Number(id))).get();
  if (!client) notFound();

  return (
    <>
      <PageHeader title={`Edit ${client.name}`} />
      <ClientForm client={client} />
    </>
  );
}
