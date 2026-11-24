/**
 * Playwright end-to-end tests: `pnpm test:e2e`.
 *
 * Runs against a production build (`pnpm build && pnpm start`) on port 3100 with mock providers,
 * local-disk storage and a real Postgres database (E2E_DATABASE_URL). The global setup recreates
 * that database and applies the migrations, so point it at a throwaway database whose name contains
 * "e2e" or "test". Locally: `docker compose up -d db` does NOT publish Postgres; run e.g.
 *   docker run -d --name openshoot-e2e-db -p 5432:5432 -e POSTGRES_USER=openshoot \
 *     -e POSTGRES_PASSWORD=openshoot -e POSTGRES_DB=openshoot_e2e postgres:16-alpine
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

const databaseUrl = process.env.E2E_DATABASE_URL || "postgres://openshoot:openshoot@localhost:5432/openshoot_e2e";
const storageDir = process.env.E2E_STORAGE_DIR || "./.data/e2e-storage";
// Shared with tests/e2e/global-setup.ts (same process) through the environment.
process.env.E2E_DATABASE_URL = databaseUrl;
process.env.E2E_STORAGE_DIR = storageDir;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["github"], ["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    // Traces are off by default (also forced by `pnpm test:e2e`); enable with `--trace on`.
    trace: "off",
    screenshot: "only-on-failure",
    // Long journeys raise the test timeout; single actions should still fail fast.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Consent selfies use the camera: grant it and feed a fake video stream.
        permissions: ["camera"],
        launchOptions: {
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    // Wait for the port only: the global setup migrates the database after the server is up.
    port: PORT,
    reuseExistingServer: !isCI,
    timeout: 10 * 60_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      MOCK_PROVIDERS: "true",
      MOCK_JOB_DELAY_MS: "300",
      DATABASE_URL: databaseUrl,
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_DIR: storageDir,
      NEXT_PUBLIC_APP_URL: baseURL,
      BETTER_AUTH_SECRET: "e2e-test-secret-e2e-test-secret-e2e-test-secret",
      CRON_SECRET: "e2e-cron-secret",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
