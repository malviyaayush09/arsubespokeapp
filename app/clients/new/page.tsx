import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/ui";
import { requireUnlocked } from "@/lib/security";

export default async function NewClientPage() {
  await requireUnlocked();

  return (
    <>
      <PageHeader title="New client" subtitle="Name and phone are enough to start." />
      <ClientForm />
    </>
  );
}
