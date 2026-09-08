import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { DB_PATH, db } from "@/db";
import { settings } from "@/db/schema";

export const BACKUP_DIR_KEY = "backup_dir";
export const BACKUP_LAST_KEY = "backup_last_at";
export const BACKUP_AUTO_KEY = "backup_auto";
export const BACKUP_KEEP_KEY = "backup_keep";

const DAY_MS = 1000 * 60 * 60 * 24;

function readSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function writeSetting(key: string, value: string) {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.key, key)).run();
  } else {
    db.insert(settings).values({ key, value }).run();
  }
}

export function defaultBackupDir() {
  return path.join(process.cwd(), "backups");
}

export function backupDir() {
  return readSetting(BACKUP_DIR_KEY)?.trim() || defaultBackupDir();
}

export function autoBackupEnabled() {
  /* Default ON. A backup nobody remembers to take is the failure this feature
     exists to prevent, so it should not need switching on first. */
  return (readSetting(BACKUP_AUTO_KEY) ?? "1") !== "0";
}

export function keepCount() {
  const n = Number(readSetting(BACKUP_KEEP_KEY) ?? "30");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

export function lastBackupAt(): Date | null {
  const raw = readSetting(BACKUP_LAST_KEY);
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function daysSinceBackup(): number | null {
  const last = lastBackupAt();
  if (!last) return null;
  return Math.floor((Date.now() - last.getTime()) / DAY_MS);
}

export type BackupResult = { file: string; bytes: number };

/**
 * Writes a consistent copy of the whole database.
 *
 * Uses SQLite's online backup API rather than copying the file. With WAL
 * enabled, arsu.db on its own is not the current state — recent writes live in
 * arsu.db-wal — so a plain file copy can hand back a database missing the last
 * hour of orders. This works correctly even mid-write.
 */
export async function runBackup(dir = backupDir()): Promise<BackupResult> {
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const file = path.join(dir, `arsu-${stamp}.db`);

  const source = new Database(DB_PATH, { readonly: true });
  try {
    await source.backup(file);
  } finally {
    source.close();
  }

  writeSetting(BACKUP_LAST_KEY, String(Date.now()));
  pruneOldBackups(dir);

  return { file, bytes: fs.statSync(file).size };
}

/**
 * Keeps the newest N and deletes the rest, so a daily backup does not fill the
 * shop's disk over a few years. Only files this app names are considered —
 * nothing else in the folder is touched.
 */
export function pruneOldBackups(dir = backupDir(), keep = keepCount()) {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const mine = entries
    .filter((name) => /^arsu-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.db$/.test(name))
    .map((name) => ({ name, full: path.join(dir, name) }))
    .sort((a, b) => b.name.localeCompare(a.name));

  const removed: string[] = [];
  for (const entry of mine.slice(keep)) {
    try {
      fs.unlinkSync(entry.full);
      removed.push(entry.name);
    } catch {
      /* A file held open by a sync client is not worth failing a backup over. */
    }
  }
  return removed;
}

export function listBackups(dir = backupDir()) {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /^arsu-.*\.db$/.test(name))
      .map((name) => {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        return { name, bytes: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());
  } catch {
    return [];
  }
}

/** Runs a backup only if automatic backups are on and one is due. */
export async function maybeAutoBackup(): Promise<BackupResult | null> {
  if (!autoBackupEnabled()) return null;

  const last = lastBackupAt();
  if (last && Date.now() - last.getTime() < DAY_MS) return null;

  return runBackup();
}
