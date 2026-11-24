import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    env: {
      NODE_ENV: "test",
      MOCK_PROVIDERS: "true",
      DATABASE_URL: "pglite:memory",
      MOCK_JOB_DELAY_MS: "0",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      LOCAL_STORAGE_DIR: "./.data/test-storage",
      CRON_SECRET: "test-cron-secret",
    },
  },
  resolve: {
    alias: {
      // `server-only` throws outside the react-server condition; make it a no-op in tests.
      "server-only": path.resolve(__dirname, "tests/helpers/empty.ts"),
    },
  },
});
