/* Work out which file is actually the shop's database.
 *
 * The installed layout puts the data OUTSIDE the app folder, so that an
 * update can replace the whole of `app` without going near it:
 *
 *   C:\ArsuAtelier\app\      <- replaced on every update
 *   C:\ArsuAtelier\data\     <- the shop. Never touched.
 *
 * The app and the .ps1 scripts pass that location in ARSU_DB_PATH. A command
 * typed by hand in the app folder does not, and the old fallback -
 * `<cwd>/data/arsu.db` - then pointed at a path that did not exist. SQLite
 * creates a database when you open a missing file, so instead of an error the
 * caller got a brand-new empty one and reported "no such table: payments",
 * having quietly littered an empty arsu.db into the app folder.
 *
 * So: look in both places, and choose the one that actually holds the shop's
 * tables rather than the one that merely exists.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** A database with this table in it is the real thing, not an empty stub. */
const MARKER_TABLE = "clients";

function hasShopTables(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const row = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(MARKER_TABLE);
    db.close();
    return row !== undefined;
  } catch {
    return false;
  }
}

export function candidates(): string[] {
  const here = process.cwd();
  return [
    path.resolve(here, "data", "arsu.db"),
    /* The installed layout: data is a sibling of the app folder. */
    path.resolve(here, "..", "data", "arsu.db"),
  ];
}

/**
 * The shop's database.
 *
 * `mustExist` is for anything that reads or changes records - it refuses to
 * invent an empty database, and says where it looked. Leave it off only for
 * first-time setup, which is allowed to create one.
 */
export function resolveDbPath({ mustExist = true } = {}): string {
  const fromEnv = process.env.ARSU_DB_PATH;
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (mustExist && !hasShopTables(resolved)) {
      throw new Error(
        `ARSU_DB_PATH points at ${resolved}, which is not a set-up Arsu ` +
          `database. Check the path, or run npm run db:setup to create it.`,
      );
    }
    return resolved;
  }

  const tried = candidates();
  const real = tried.find(hasShopTables);
  if (real) return real;

  if (!mustExist) return tried[0];

  const notes = tried
    .map((f) => `  ${f}  ${fs.existsSync(f) ? "(exists, but has no tables)" : "(not there)"}`)
    .join("\n");

  throw new Error(
    `Could not find the shop's database. Looked in:\n${notes}\n\n` +
      `On the shop laptop it lives at C:\\ArsuAtelier\\data\\arsu.db. Either ` +
      `run the command with that path:\n\n` +
      `  $env:ARSU_DB_PATH = "C:\\ArsuAtelier\\data\\arsu.db"\n\n` +
      `or run it from C:\\ArsuAtelier\\app, where the sibling data folder is ` +
      `found automatically.`,
  );
}
