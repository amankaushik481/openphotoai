/** `.env` loading for CLI scripts (Next.js loads it itself; tsx scripts do not). */
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load `<cwd>/.env` into process.env if it exists. Variables already set in the real
 * environment win (Node's `process.loadEnvFile` never overrides them).
 * Returns the loaded file path, or null when there is no `.env`.
 */
export function loadDotEnv(cwd = process.cwd()): string | null {
  const file = path.join(cwd, ".env");
  if (!existsSync(file)) return null;
  process.loadEnvFile(file);
  return file;
}

/** Fallback used everywhere when DATABASE_URL is unset (mirrors src/db/index.ts). */
export const DEFAULT_DATABASE_URL = "pglite:./.data/pglite";

export function databaseUrlFromEnv(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}
