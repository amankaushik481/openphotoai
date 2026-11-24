/** `pnpm db:migrate` — apply drizzle/ migrations to DATABASE_URL (Postgres or PGlite). */
import { migrateCommand, runCli } from "./lib/commands";
import { log } from "./lib/log";

await runCli(async () => {
  log.step("Migrating database");
  return migrateCommand();
});
