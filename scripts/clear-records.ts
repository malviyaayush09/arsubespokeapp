/* Delete the day-to-day records and keep the shop's setup.
 *
 *   npm run db:clear          -- shows what would go, changes nothing
 *   npm run db:clear -- --yes -- actually does it
 *
 * Written for one moment: the tailor has been trying the app out, the made-up
 * clients and practice orders need to go, and the real work is about to start.
 * It must not take the setup with them. What he spent time on - the garments
 * he stitches, what he measures for each, his rates, the shop's name and
 * address and terms, the PIN - all stays. Only clients, orders, payments and
 * measurements go.
 *
 * Refuses to do anything without --yes, because the safe reading of a typed
 * command is always "show me first".
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDbPath } from "./db-path";

/* Deleted, newest-dependent first. Order matters even with cascades on: this
   runs the same way whether or not foreign keys are enforced. */
const RECORDS = [
  "payments",
  "order_charges",
  "order_item_measurements",
  "order_status_events",
  "order_items",
  "orders",
  "measurement_values",
  "measurement_sets",
  "clients",
] as const;

/* Kept, and listed out loud so the output can be checked rather than trusted. */
const SETUP = [
  "garment_types",
  "garment_type_groups",
  "measurement_fields",
  "tailors",
  "settings",
  "schema_migrations",
] as const;

const go = process.argv.slice(2).includes("--yes");

/* Resolved inside main(), not at module scope: resolution can fail with a
   sentence worth reading, and a throw out here prints a stack trace over it.
   See scripts/db-path.ts for why it is resolved at all - typed by hand in the
   app folder, the old guess pointed at a path that did not exist, SQLite
   obligingly created an empty database there, and this script then reported
   "no such table: payments" about a file nobody had ever used. */
function backupDirFor(dbPath: string) {
  return (
    process.env.ARSU_BACKUP_DIR ??
    path.join(path.dirname(dbPath), "..", "backups")
  );
}

function countsOf(db: Database.Database, tables: readonly string[]) {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get() as
      | { c: number }
      | undefined;
    out[t] = row?.c ?? 0;
  }
  return out;
}

function show(title: string, counts: Record<string, number>) {
  console.log(`\n  ${title}`);
  for (const [table, n] of Object.entries(counts)) {
    console.log(`    ${String(n).padStart(6)}  ${table}`);
  }
}

async function main() {
  const dbPath = resolveDbPath();
  const backupDir = backupDirFor(dbPath);

  /* fileMustExist, so a wrong path is an error rather than a new database. */
  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma("foreign_keys = ON");

  /* Name every table the delete needs before touching anything. A database
     from an older install can be missing one, and finding that out halfway
     through is how you get a half-cleared shop. */
  const present = new Set(
    (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all() as { name: string }[]
    ).map((r) => r.name),
  );
  const missing = [...RECORDS, ...SETUP].filter((t) => !present.has(t));
  if (missing.length > 0) {
    db.close();
    throw new Error(
      `${dbPath}\nis missing these tables: ${missing.join(", ")}.\n` +
        `That is not a database this version can clear - run ` +
        `scripts\\update.ps1 so the migrations are applied first.`,
    );
  }

  const before = countsOf(db, RECORDS);
  const keep = countsOf(db, SETUP);
  const total = Object.values(before).reduce((a, b) => a + b, 0);

  console.log(`\nDatabase: ${dbPath}`);
  show("To be deleted", before);
  show("To be kept", keep);

  if (total === 0) {
    console.log("\nThere are no records to delete. Nothing to do.\n");
    db.close();
    return;
  }

  if (!go) {
    console.log(
      `\n  ${total} rows would be deleted. Nothing has been changed.` +
        `\n  To go ahead:  npm run db:clear -- --yes\n`,
    );
    db.close();
    return;
  }

  /* A backup BEFORE, every time, with no way to opt out. The whole point of
     this script is that it is run on a day when somebody is nervous.
     SQLite's backup API rather than a file copy - with WAL on, arsu.db by
     itself is missing whatever is still sitting in arsu.db-wal. */
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const target = path.resolve(backupDir, `before-clear-${stamp}.db`);
  await db.backup(target);

  const check = new Database(target, { readonly: true });
  const integrity = (
    check.pragma("integrity_check") as { integrity_check: string }[]
  )[0].integrity_check;
  const saved = check.prepare("SELECT COUNT(*) c FROM orders").get() as {
    c: number;
  };
  check.close();
  if (integrity !== "ok") {
    throw new Error(`the backup failed its integrity check: ${integrity}`);
  }
  console.log(`\n  Backed up to ${target} (${saved.c} orders, integrity ok)`);

  db.transaction(() => {
    for (const t of RECORDS) db.prepare(`DELETE FROM "${t}"`).run();
    /* Start numbering from 1 again, so the first real order is order 1 and
       not order 7 because of a week of practice. */
    db.prepare(
      `DELETE FROM sqlite_sequence WHERE name IN (${RECORDS.map(() => "?").join(", ")})`,
    ).run(...RECORDS);
  })();

  const after = countsOf(db, RECORDS);
  const keptAfter = countsOf(db, SETUP);
  const left = Object.values(after).reduce((a, b) => a + b, 0);

  const ok = (db.pragma("integrity_check") as { integrity_check: string }[])[0]
    .integrity_check;
  const orphans = db.pragma("foreign_key_check") as unknown[];

  db.close();

  /* VACUUM on its own connection: it cannot run inside a transaction, and
     this is the one moment the file is mostly empty space. */
  const vac = new Database(dbPath);
  vac.exec("VACUUM");
  vac.close();

  show("Deleted - now", after);
  show("Kept - still there", keptAfter);
  console.log(
    `\n  ${total} rows deleted, ${left} left.` +
      `\n  integrity_check: ${ok}, foreign_key_check: ${orphans.length === 0 ? "clean" : "PROBLEMS"}`,
  );

  if (left !== 0 || ok !== "ok" || orphans.length !== 0) {
    throw new Error("the database is not in the state it should be - restore the backup");
  }

  console.log("\n  Done. The shop's setup is untouched.\n");
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  console.error("Nothing was half-done: the delete runs as one transaction.\n");
  process.exit(1);
});
