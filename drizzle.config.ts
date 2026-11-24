import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "pglite:./.data/pglite";
const isPglite = url.startsWith("pglite:");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  ...(isPglite ? { driver: "pglite" as const } : {}),
  dbCredentials: { url: isPglite ? url.slice("pglite:".length) || "./.data/pglite" : url },
  strict: true,
  verbose: true,
});
