/* Take one backup, now, and exit non-zero if it did not work.
 *
 *   npx tsx scripts/backup-now.ts [label]
 *
 * Used by scripts/update.ps1 before it changes anything, and available by hand
 * whenever you want a copy before doing something risky.
 *
 * Uses SQLite's online backup API rather than copying the file. With WAL on,
 * arsu.db by itself is missing whatever is still in arsu.db-wal — a plain
 * copy during this project produced a backup containing zero orders.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const label = (process.argv[2] ?? "manual").replace(/[^a-z0-9-]/gi, "");

const dbPath = path.resolve(
  process.env.ARSU_DB_PATH ?? path.join(process.cwd(), "data", "arsu.db"),
);

/* Sibling of the data folder, so it survives the app folder being replaced. */
const dir =
  process.env.ARSU_BACKUP_DIR ??
  path.join(path.dirname(dbPath), "..", "backups");

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.log(`[backup] no database at ${dbPath} yet — nothing to back up`);
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const target = path.resolve(dir, `${label}-${stamp}.db`);

  const source = new Database(dbPath, { readonly: true });
  try {
    await source.backup(target);
  } finally {
    source.close();
  }

  /* Prove it is readable and complete before calling it a backup. An unchecked
     backup is just a file. */
  const check = new Database(target, { readonly: true });
  const integrity = (check.pragma("integrity_check") as { integrity_check: string }[])[0]
    .integrity_check;
  const orders = check.prepare("SELECT COUNT(*) c FROM orders").get() as { c: number };
  const clients = check.prepare("SELECT COUNT(*) c FROM clients").get() as { c: number };
  check.close();

  if (integrity !== "ok") throw new Error(`backup failed its integrity check: ${integrity}`);

  const mb = (fs.statSync(target).size / (1024 * 1024)).toFixed(2);
  console.log(
    `[backup] ${target} (${mb} MB) — ${clients.c} clients, ${orders.c} orders, integrity ok`,
  );
}

main().catch((error) => {
  console.error("[backup] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
