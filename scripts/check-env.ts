/** `pnpm check-env` — validate the environment and show which providers are active. Exit 1 if invalid. */
import { checkEnvCommand, runCli } from "./lib/commands";
import { color, log } from "./lib/log";

await runCli(async ({ envFile }) => {
  log.step("Checking environment");
  log.info(color.dim(envFile ? `Loaded ${envFile}` : "No .env file: using the process environment and defaults."));
  return checkEnvCommand();
});
