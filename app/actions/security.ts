"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  UNLOCK_COOKIE,
  UNLOCK_COOKIE_OPTIONS,
  expectedCookie,
  getStoredPinHash,
  hashPin,
  verifyPin,
} from "@/lib/security";

export type ActionState = { error?: string; message?: string };

const PIN_SETTING = "pin_hash";

function writePin(value: string) {
  const existing = db
    .select()
    .from(settings)
    .where(eq(settings.key, PIN_SETTING))
    .get();
  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.key, PIN_SETTING)).run();
  } else {
    db.insert(settings).values({ key: PIN_SETTING, value }).run();
  }
}

export async function unlock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pin = String(formData.get("pin") ?? "").trim();
  const stored = getStoredPinHash();

  if (!stored) return { message: "No PIN is set." };
  if (!pin) return { error: "Enter the PIN" };
  if (!verifyPin(pin, stored)) return { error: "That PIN is not right" };

  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, expectedCookie(stored), UNLOCK_COOKIE_OPTIONS);

  redirect("/");
}

export async function lockNow(): Promise<void> {
  const jar = await cookies();
  jar.delete(UNLOCK_COOKIE);
  redirect("/");
}

export async function setPin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pin = String(formData.get("pin") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "").trim();
  const current = String(formData.get("current") ?? "").trim();
  const stored = getStoredPinHash();

  /* Changing an existing PIN requires the old one. Otherwise anyone already
     looking at an unlocked tablet could lock the owner out of it. */
  if (stored && !verifyPin(current, stored)) {
    return { error: "The current PIN is not right" };
  }

  if (!/^\d{4,8}$/.test(pin)) return { error: "Use 4 to 8 digits" };
  if (pin !== confirm) return { error: "The two PINs do not match" };

  const hash = hashPin(pin);
  writePin(hash);

  /* Re-issue this device's cookie against the new hash, so setting a PIN does
     not immediately lock out the person who just set it. Every OTHER device
     is logged out, which is the point. */
  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, expectedCookie(hash), UNLOCK_COOKIE_OPTIONS);

  revalidatePath("/", "layout");
  return { message: "PIN set. Other devices will be asked for it." };
}

export async function removePin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = String(formData.get("current") ?? "").trim();
  const stored = getStoredPinHash();

  if (!stored) return { message: "No PIN was set." };
  if (!verifyPin(current, stored)) return { error: "The current PIN is not right" };

  db.delete(settings).where(eq(settings.key, PIN_SETTING)).run();

  const jar = await cookies();
  jar.delete(UNLOCK_COOKIE);

  revalidatePath("/", "layout");
  return { message: "PIN removed. The app is now open to anyone on the network." };
}
