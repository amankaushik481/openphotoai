/**
 * `pnpm run setup` (alias `pnpm bootstrap`) — one command from clone to running app:
 * check env → migrate → seed. Safe to re-run.
 */
import { getEnv } from "@/lib/env";
import { checkEnvCommand, migrateCommand, runCli, seedCommand } from "./lib/commands";
import { color, log } from "./lib/log";

await runCli(async ({ envFile }) => {
  console.log(color.bold("OpenShoot setup"));
  log.info(
    color.dim(envFile ? `Loaded ${envFile}` : "No .env file found: using defaults (copy .env.example to .env to customize)."),
  );

  log.step("1/3 Checking environment");
  if (!(await checkEnvCommand())) {
    log.info("Fix the variables above (see .env.example), then run `pnpm run setup` again.");
    return false;
  }

  log.step("2/3 Migrating database");
  await migrateCommand();

  log.step("3/3 Seeding");
  await seedCommand();

  const env = getEnv();
  log.step("Setup complete");
  log.info(`Start the app:  ${color.bold("pnpm dev")}  →  ${env.NEXT_PUBLIC_APP_URL}`);
  if (env.emailProvider === "mock") log.info(`Sign in with any email; magic links appear at ${env.NEXT_PUBLIC_APP_URL}/dev/emails`);
  if (!process.env.SEED_ADMIN_EMAIL) log.info("Tip: set SEED_ADMIN_EMAIL and re-run to create an admin account.");
  return true;
});
