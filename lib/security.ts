import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/* A shared shop PIN. This is a lock on an unattended tablet, NOT user
 * authentication — there are no accounts, and everyone who knows the PIN is
 * the same person as far as the app is concerned. It exists because the
 * counter tablet otherwise shows every client's phone number and home address
 * to whoever picks it up, and this shop has clients whose addresses are worth
 * something to a stranger.
 *
 * Not built, and worth knowing it isn't: per-user logins, rate limiting on
 * guesses, or any protection against someone with access to the machine's
 * filesystem — the database sits next to the app, unencrypted.
 */

const PIN_SETTING = "pin_hash";
export const UNLOCK_COOKIE = "arsu_unlock";

/** scrypt with a random salt, stored as 'salt:hash'. */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, 32).toString("hex");
  /* Constant-time compare. Overkill for a 4-digit PIN on a shop LAN, but it
     costs one line and removes the question. */
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function getStoredPinHash(): string | null {
  const row = db.select().from(settings).where(eq(settings.key, PIN_SETTING)).get();
  const value = row?.value?.trim();
  return value ? value : null;
}

export function isPinEnabled(): boolean {
  return getStoredPinHash() !== null;
}

/**
 * The cookie carries a derivative of the stored hash, not the PIN. Changing
 * the PIN changes the hash, which invalidates every device that was unlocked
 * with the old one — which is the behaviour you want from a shared PIN.
 */
export function expectedCookie(storedHash: string): string {
  return crypto
    .createHash("sha256")
    .update(`${storedHash}|arsu-atelier`)
    .digest("hex");
}

export async function isUnlocked(): Promise<boolean> {
  const storedHash = getStoredPinHash();
  if (!storedHash) return true; // no PIN set: nothing to unlock

  const jar = await cookies();
  const value = jar.get(UNLOCK_COOKIE)?.value;
  return value === expectedCookie(storedHash);
}

/**
 * Call this as the FIRST line of every page that touches shop data.
 *
 * It has to be here, in the page, not in the layout. A layout that redirects
 * does not stop its children rendering: Next still executed the page, and the
 * 307 response carried the whole client list in its RSC payload — the unlock
 * screen appeared, and View Source showed every name, phone and balance behind
 * it. Throwing from inside the page aborts it before it queries anything, so
 * there is nothing to serialise.
 */
export async function requireUnlocked(): Promise<void> {
  if (!isPinEnabled()) return;
  if (await isUnlocked()) return;
  redirect("/unlock");
}

export const UNLOCK_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  /* Thirty days. A shop tablet should not ask for the PIN every morning; the
     point is that a stranger picking it up cold gets nothing. */
  maxAge: 60 * 60 * 24 * 30,
};
