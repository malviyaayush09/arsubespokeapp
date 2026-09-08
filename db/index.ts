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

export const DB_PATH = path.resolve(
  process.env.ARSU_DB_PATH ?? path.join(process.cwd(), "data", "arsu.db"),
);

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);

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
