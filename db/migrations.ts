import type BetterSqlite3 from "better-sqlite3";

/* Schema changes for a database that already has a shop's work in it.
 *
 * `drizzle-kit push` cannot be used for this. To add a column it rebuilds the
 * whole table, and rebuilding `orders` or `order_items` fails outright on the
 * foreign keys `order_item_measurements` holds into them — we hit exactly that
 * ("FOREIGN KEY constraint failed") adding the tailor column. On a laptop in a
 * shop, halfway through an unattended update, that is the worst possible place
 * to discover it.
 *
 * So every schema change is written by hand here, using ALTER TABLE, which
 * touches nothing but the one table.
 *
 * Two rules for anything added below:
 *
 *   1. IDEMPOTENT. Check before you act. A migration may meet a database that
 *      already has the change (this one did, applied by hand during
 *      development), and it must then do nothing rather than fail.
 *   2. ADDITIVE. Add columns and tables. Do not drop or rename anything a
 *      previous version still reads, because a rollback puts that older code
 *      back in front of this same database.
 */

export type MigrationDb = BetterSqlite3.Database;

export type Migration = {
  /** Sortable and permanent. Never renumber a released one. */
  id: string;
  description: string;
  run: (db: MigrationDb) => void;
};

export function hasTable(db: MigrationDb, table: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return row !== undefined;
}

export function hasColumn(db: MigrationDb, table: string, column: string): boolean {
  if (!hasTable(db, table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_garment_default_rates",
    description: "House stitching and fabric rates per garment type",
    run: (db) => {
      if (!hasColumn(db, "garment_types", "default_stitching_paise")) {
        db.exec(
          "ALTER TABLE garment_types ADD COLUMN default_stitching_paise INTEGER NOT NULL DEFAULT 0",
        );
      }
      if (!hasColumn(db, "garment_types", "default_fabric_paise")) {
        db.exec(
          "ALTER TABLE garment_types ADD COLUMN default_fabric_paise INTEGER NOT NULL DEFAULT 0",
        );
      }
    },
  },
  {
    id: "0002_tailors",
    description: "Tailors, and which of them is making each garment",
    run: (db) => {
      if (!hasTable(db, "tailors")) {
        db.exec(`
          CREATE TABLE tailors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0
          )
        `);
        db.exec("CREATE INDEX tailors_active_idx ON tailors (is_active)");
      }
      if (!hasColumn(db, "order_items", "tailor_id")) {
        /* SQLite allows ADD COLUMN with REFERENCES as long as the default is
           NULL, which is what we want anyway: existing garments predate the
           idea of an assigned tailor. */
        db.exec(
          "ALTER TABLE order_items ADD COLUMN tailor_id INTEGER REFERENCES tailors(id) ON DELETE SET NULL",
        );
      }
    },
  },
];
