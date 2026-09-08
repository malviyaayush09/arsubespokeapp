"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients } from "@/db/schema";

export type ActionState = { error?: string };

const ClientInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(1, "Phone is required"),
  altPhone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  email: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function read(formData: FormData) {
  return ClientInput.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    altPhone: formData.get("altPhone") ?? "",
    address: formData.get("address") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

const blankToNull = (value?: string) => (value && value !== "" ? value : null);

export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = read(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  const row = db
    .insert(clients)
    .values({
      name: parsed.data.name,
      phone: parsed.data.phone,
      altPhone: blankToNull(parsed.data.altPhone),
      address: blankToNull(parsed.data.address),
      email: blankToNull(parsed.data.email),
      notes: blankToNull(parsed.data.notes),
    })
    .returning({ id: clients.id })
    .get();

  revalidatePath("/clients");
  redirect(`/clients/${row.id}`);
}

export async function updateClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return { error: "Unknown client" };

  const parsed = read(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  db.update(clients)
    .set({
      name: parsed.data.name,
      phone: parsed.data.phone,
      altPhone: blankToNull(parsed.data.altPhone),
      address: blankToNull(parsed.data.address),
      email: blankToNull(parsed.data.email),
      notes: blankToNull(parsed.data.notes),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, id))
    .run();

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

/** Warn-on-duplicate rather than block: families share a number. */
export async function findByPhone(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.length < 4) return [];
  return db
    .select({ id: clients.id, name: clients.name, phone: clients.phone })
    .from(clients)
    .where(sql`${clients.phone} LIKE ${"%" + trimmed + "%"}`)
    .limit(5)
    .all();
}
