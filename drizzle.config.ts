import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: process.env.ARSU_DB_PATH ?? "./data/arsu.db" },
} satisfies Config;
