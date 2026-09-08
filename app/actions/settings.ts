"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SETTING_KEYS } from "@/lib/settings-fields";
import {
  BACKUP_AUTO_KEY,
  BACKUP_DIR_KEY,
  BACKUP_KEEP_KEY,
  runBackup,
  writeSetting,
} from "@/lib/backup";

export type ActionState = { error?: string; message?: string };

export async function updateSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  for (const key of SETTING_KEYS) {
    const value = String(formData.get(key) ?? "");
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      db.update(settings).set({ value }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value }).run();
    }
  }

  revalidatePath("/settings");
  revalidatePath("/orders", "layout");
  return { message: "Saved." };
}

export async function backupNow(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const requested = String(formData.get("destination") ?? "").trim();

  try {
    if (requested) writeSetting(BACKUP_DIR_KEY, requested);
    const result = await runBackup(requested || undefined);
    const mb = (result.bytes / (1024 * 1024)).toFixed(2);
    revalidatePath("/settings");
    revalidatePath("/");
    return { message: `Backed up to ${result.file} (${mb} MB).` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: `Backup failed: ${reason}` };
  }
}

export async function updateBackupSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const dir = String(formData.get("destination") ?? "").trim();
  const auto = formData.get("auto") === "on";
  const keepRaw = String(formData.get("keep") ?? "").trim();
  const keep = Number(keepRaw);

  if (keepRaw !== "" && (!Number.isFinite(keep) || keep < 1)) {
    return { error: "Copies to keep must be a number of at least 1" };
  }

  if (dir) writeSetting(BACKUP_DIR_KEY, dir);
  writeSetting(BACKUP_AUTO_KEY, auto ? "1" : "0");
  if (keepRaw !== "") writeSetting(BACKUP_KEEP_KEY, String(Math.floor(keep)));

  revalidatePath("/settings");
  revalidatePath("/");
  return { message: "Backup settings saved." };
}
