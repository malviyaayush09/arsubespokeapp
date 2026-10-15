/* Deliberately no `import "server-only"`: that package throws the moment it is
   imported outside a React Server Component, which would take the seed script
   and drizzle-kit down with it. The node:fs and better-sqlite3 imports below
   already make this module impossible to pull into a client component. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/* Belt to the braces above. Importing this from a client component fails the
   build with a confusing "Can't resolve 'fs'" out of better-sqlite3's innards;
   this turns the same mistake into a sentence that says what is wrong. */
if (typeof window !== "undefined") {
  throw new Error(
    "db/index.ts was imported into the browser. Something in a \"use client\" " +
      "component is importing a module that reads the database — move the " +
      "query to a server component or a server action.",
  );
}

/* The turbopackIgnore comment stops the bundler trying to work out which file
 * this resolves to. It cannot: the path comes from an environment variable set
 * at runtime. So it gave up and traced the ENTIRE project folder instead -
 * 12,620 files on the shop laptop once an update left a second copy of
 * node_modules beside it - and the build ran out of heap and died halfway
 * through an update. The path is read at runtime by better-sqlite3 and never
 * bundled, so there was nothing here for the bundler to resolve anyway. */
export const DB_PATH = path.resolve(
  /* turbopackIgnore: true */
  process.env.ARSU_DB_PATH ?? path.join(process.cwd(), "data", "arsu.db"),
);

function open() {
  /* Do NOT create one. SQLite makes a database out of any missing filename it
   * is handed, and this module used to mkdir its way to the file as well - so
   * `npm run start` typed in the app folder, with no ARSU_DB_PATH set by the
   * launcher, silently built an empty database beside the code and served a
   * shop with no clients in it. The real one was two directories up,
   * untouched and invisible, and nothing said anything was wrong.
   *
   * It leaves a decoy behind too, which is how `npm run db:clear` came to
   * report "no such table: payments" about a file nobody had ever used. */
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `No database at ${DB_PATH}.\n` +
        `On the shop laptop it lives in C:\\ArsuAtelier\\data - start the app ` +
        `with the ARSU shortcut or scripts\\update.ps1, both of which set ` +
        `ARSU_DB_PATH. On a development machine: npm run db:setup`,
    );
  }

  const sqlite = new Database(DB_PATH, { fileMustExist: true });

  /* SQLite ships with foreign keys DISABLED. Every ON DELETE CASCADE in
     schema.ts is inert without this line — deleting a client would leave
     their orders and measurements behind as orphans pointing at nothing. */
  sqlite.pragma("foreign_keys = ON");

  /* WAL lets the tablet read while the counter machine writes. */
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  return drizzle(sqlite, { schema });
}

/* Next reloads modules on every edit in dev. Without a global handle that
   opens a new SQLite connection per reload until the process runs out. */
const globalForDb = globalThis as unknown as {
  arsuDb?: ReturnType<typeof open>;
};

export const db = globalForDb.arsuDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.arsuDb = db;

export { schema };
