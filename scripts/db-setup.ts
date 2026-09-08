/* The one database command. Safe to run on a brand-new laptop and on a shop
 * database with two years of orders in it — it works out which it is.
 *
 *   Fresh (no tables)  -> create the schema with drizzle-kit, seed, stamp
 *   Existing           -> BACK UP, then apply only the pending migrations
 *
 * Run by scripts/setup.ps1 on install and by scripts/update.ps1 on every
 * update, so there is exactly one code path that ever touches the shop's data.
 *
 * Exit codes matter: the updater treats a non-zero exit as "do not swap in the
 * new version" and rolls the code back.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS, type MigrationDb } from "../db/migrations";

const DB_PATH = path.resolve(
  process.env.ARSU_DB_PATH ?? path.join(process.cwd(), "data", "arsu.db"),
);

function log(message: string) {
  console.log(`[db] ${message}`);
}

function open(): MigrationDb {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return db;
}

function isFresh(db: MigrationDb): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='clients'")
    .get();
  return row === undefined;
}

function ensureLedger(db: MigrationDb) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      applied_at  INTEGER NOT NULL
    )
  `);
}

function appliedIds(db: MigrationDb): Set<string> {
  const rows = db.prepare("SELECT id FROM schema_migrations").all() as {
    id: string;
  }[];
  return new Set(rows.map((r) => r.id));
}

function stamp(db: MigrationDb, id: string) {
  db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  ).run(id, Date.now());
}

/**
 * A consistent copy before any schema change, using SQLite's own backup API.
 *
 * Not a file copy: with WAL on, arsu.db by itself is missing whatever is still
 * in arsu.db-wal. A plain `cp` during this project produced a backup with zero
 * orders in it, which is exactly the kind of "backup" that is discovered to be
 * empty on the day it is needed.
 */
async function backupBeforeMigrating(): Promise<string> {
  const dir = path.join(path.dirname(DB_PATH), "..", "backups");
  fs.mkdirSync(dir, { recursive: true });

  const stampName = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const target = path.join(dir, `pre-update-${stampName}.db`);

  const source = new Database(DB_PATH, { readonly: true });
  try {
    await source.backup(target);
  } finally {
    source.close();
  }

  const mb = (fs.statSync(target).size / (1024 * 1024)).toFixed(2);
  log(`backed up to ${target} (${mb} MB)`);
  return target;
}

async function main() {
  log(`database: ${DB_PATH}`);

  let db = open();
  const fresh = isFresh(db);

  if (fresh) {
    log("no tables found — treating this as a fresh install");
    db.close();

    /* drizzle-kit push is fine here and only here: on an empty database there
       is nothing to rebuild and no foreign key to trip over. */
    log("creating schema…");
    execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["drizzle-kit", "push", "--force"],
      { stdio: "inherit", env: { ...process.env, ARSU_DB_PATH: DB_PATH } },
    );

    db = open();
    ensureLedger(db);

    /* Everything the migrations would add already exists, because push built
       the schema from the current model. Record them as done so they are not
       attempted again. */
    for (const migration of MIGRATIONS) stamp(db, migration.id);
    log(`stamped ${MIGRATIONS.length} migration(s) as already present`);
    db.close();

    log("seeding garment types and the letterhead…");
    execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", "db/seed.ts"],
      { stdio: "inherit", env: { ...process.env, ARSU_DB_PATH: DB_PATH } },
    );

    log("fresh install ready");
    return;
  }

  /* ── existing shop database ─────────────────────────────────────────── */

  ensureLedger(db);
  const done = appliedIds(db);
  const pending = MIGRATIONS.filter((m) => !done.has(m.id));

  if (pending.length === 0) {
    log("schema is up to date, nothing to do");
    db.close();
    return;
  }

  log(`${pending.length} migration(s) pending: ${pending.map((m) => m.id).join(", ")}`);
  db.close();

  await backupBeforeMigrating();

  db = open();
  for (const migration of pending) {
    log(`applying ${migration.id} — ${migration.description}`);
    /* One transaction per migration: a failure leaves the database exactly as
       it was, and the ledger does not record it, so the next run retries. */
    const apply = db.transaction(() => {
      migration.run(db);
      stamp(db, migration.id);
    });
    apply();
  }

  const integrity = (db.pragma("integrity_check") as { integrity_check: string }[])[0]
    .integrity_check;
  const fkProblems = db.pragma("foreign_key_check") as unknown[];

  log(`integrity_check: ${integrity}`);
  log(`foreign_key_check: ${fkProblems.length} problem(s)`);
  db.close();

  if (integrity !== "ok" || fkProblems.length > 0) {
    throw new Error(
      "database failed its checks after migrating — restore the pre-update backup",
    );
  }

  log("migrations applied");
}

main().catch((error) => {
  console.error("[db] FAILED:", error instanceof Error ? error.message : error);
  console.error("[db] the database was not left half-changed; each migration ran in a transaction.");
  process.exit(1);
});
