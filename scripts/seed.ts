/** `pnpm db:seed` — validate packs and create/promote the SEED_ADMIN_EMAIL admin user. Idempotent. */
import { runCli, seedCommand } from "./lib/commands";
import { log } from "./lib/log";

await runCli(async () => {
  log.step("Seeding");
  return seedCommand();
});
