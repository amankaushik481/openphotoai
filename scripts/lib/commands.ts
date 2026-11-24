/**
 * The CLI steps shared by `check-env`, `db:migrate`, `db:seed` and `setup`.
 * Each prints friendly output and returns false (or throws) on failure.
 */
import { closeDb } from "@/db";
import { getEnv, type Env } from "@/lib/env";
import { inspectEnv } from "./check-env";
import { describeDatabase, parseDatabaseUrl } from "./database";
import { databaseUrlFromEnv, loadDotEnv } from "./env";
import { color, errorMessage, formatTable, log } from "./log";
import { runMigrations } from "./migrate";
import { seedAdminUser, validatePacks } from "./seed";

export async function checkEnvCommand(): Promise<boolean> {
  let env: Env;
  try {
    env = getEnv();
  } catch (err) {
    log.error(errorMessage(err));
    return false;
  }
  const report = inspectEnv(env);
  log.info(`Mode: ${color.bold(report.mode)}`);
  console.log(
    formatTable([["Area", "Active", "Details"], ...report.rows.map((r) => [r.area, r.value, r.detail])])
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
  );
  for (const warning of report.warnings) log.warn(warning);
  log.ok("Environment is valid.");
  return true;
}

export async function migrateCommand(): Promise<boolean> {
  const url = databaseUrlFromEnv();
  const target = parseDatabaseUrl(url);
  log.info(`Database: ${describeDatabase(target)}`);
  if (target.kind === "pglite" && target.memory) log.warn("pglite:memory is discarded when this process exits.");
  const result = await runMigrations({ databaseUrl: url });
  log.ok(
    result.applied > 0
      ? `Applied ${result.applied} migration(s); ${result.total} total.`
      : `Already up to date (${result.total} migration(s)).`,
  );
  return true;
}

export async function seedCommand(): Promise<boolean> {
  const packs = await validatePacks();
  if (packs.status === "ok") log.ok(`${packs.packs} pack(s) valid (${packs.prompts} prompts).`);
  else log.warn(`Pack validation skipped: ${packs.reason}`);

  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  if (!email) {
    log.info(color.dim("SEED_ADMIN_EMAIL is not set: no admin user created."));
  } else {
    const admin = await seedAdminUser(email, process.env.SEED_ADMIN_NAME?.trim() || undefined);
    log.ok(`${admin.created ? "Created" : "Updated"} admin user ${admin.email} (${admin.id}).`);
  }
  return true;
}

/**
 * Run a CLI entry point: load `.env`, run, report errors, close the database and set the
 * exit code (non-zero on failure).
 */
export async function runCli(main: (ctx: { envFile: string | null }) => Promise<boolean>): Promise<void> {
  let ok = false;
  try {
    ok = await main({ envFile: loadDotEnv() });
  } catch (err) {
    log.error(errorMessage(err));
    if (process.env.DEBUG) console.error(err);
  } finally {
    await closeDb().catch(() => undefined);
  }
  process.exitCode = ok ? 0 : 1;
}
