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
  {
    id: "0003_measurement_groups",
    description:
      "Shared measurement groups: garment types that inherit their fields",
    run: (db) => {
      /* See the long note on garmentTypes in db/schema.ts. Arsu measures by
         body half, not by garment: eleven numbers for the upper body serve
         eight garments, eight for the lower body serve four. A measurement
         group is a garment type carrying is_template, and every real garment
         inherits that group's fields.

         Purely additive. Existing rows get NULL and 0, which means "owns its
         own fields" - precisely how the app behaved before - so this cannot
         disturb a shop already using it, and older code restored by a
         rollback simply ignores both columns. */
      if (!hasColumn(db, "garment_types", "inherits_from_id")) {
        db.exec(
          "ALTER TABLE garment_types ADD COLUMN inherits_from_id INTEGER REFERENCES garment_types(id) ON DELETE SET NULL",
        );
      }
      if (!hasColumn(db, "garment_types", "is_template")) {
        db.exec(
          "ALTER TABLE garment_types ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0",
        );
      }
    },
  },
  {
    id: "0004_garment_type_groups",
    description: "Link table: which measurement groups a garment draws from",
    run: (db) => {
      /* Supersedes the inherits_from_id column that 0003 adds. A garment can
         belong to TWO groups - Tuxedo, 3pcs and 2pcs Suit are coat and
         trousers together, so they carry all nineteen numbers - and a single
         column cannot say that.

         0003 is left exactly as released rather than renumbered: a migration
         that has gone out must never change, or two databases can disagree
         about what "0003" meant. The column it adds is simply unused, which
         costs nothing. */
      if (!hasTable(db, "garment_type_groups")) {
        db.exec(`
          CREATE TABLE garment_type_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            garment_type_id INTEGER NOT NULL REFERENCES garment_types(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES garment_types(id) ON DELETE CASCADE,
            sort_order INTEGER NOT NULL DEFAULT 0
          )
        `);
        db.exec(
          "CREATE UNIQUE INDEX garment_type_groups_idx ON garment_type_groups (garment_type_id, group_id)",
        );
        db.exec(
          "CREATE INDEX garment_type_groups_group_idx ON garment_type_groups (group_id)",
        );
      }
    },
  },
  {
    id: "0005_his_bill",
    description: "GST number, trial date, and fabric as one amount per order",
    run: (db) => {
      /* Three things his own order sheet has and this app did not.
       *
       * FABRIC IS ONE AMOUNT. His bill reads stitching 3,600 plus Fabric
       * 9,400 equals 13,000 - a single cloth figure for the whole job, not a
       * rate per garment. The per-garment fabric column stays, because orders
       * already written used it and rule 2 of migrations is additive, but
       * nothing will ask him for it any more.
       *
       * TRIAL DATE is its own row on his sheet, separate from Delivery. A
       * trial is a second appointment, and an app that cannot record it sends
       * him back to paper for the one thing he must not forget.
       *
       * GST NUMBER sits under the client's contact details on his sheet,
       * blank for most people and needed for the ones who ask for a bill. */
      if (!hasColumn(db, "clients", "gst_no")) {
        db.exec("ALTER TABLE clients ADD COLUMN gst_no TEXT");
      }
      if (!hasColumn(db, "orders", "trial_date")) {
        db.exec("ALTER TABLE orders ADD COLUMN trial_date TEXT");
      }
      if (!hasColumn(db, "orders", "fabric_paise")) {
        db.exec(
          "ALTER TABLE orders ADD COLUMN fabric_paise INTEGER NOT NULL DEFAULT 0",
        );
      }
    },
  },
];
