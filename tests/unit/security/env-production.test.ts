/**
 * SEC-1 (weak/published BETTER_AUTH_SECRET in production) and SEC-2 / PAY-4 (real AI mixed with mock
 * payments + email in production), plus TRUSTED_PROXY_HOPS defaults (SEC-4).
 * Ported from the review probes mixed-mock.probe.ts and forge-session.probe.ts.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv, resetEnvCache, weakAuthSecretReason } from "@/lib/env";
import { isPlaceholderSecret, persistedSecret, resolveAuthSecret } from "../../../docker/auth-secret.mjs";

const STRONG = "k3Jx9-Qw7_ZpL2mN8vB4cR6tY1uH5sD0aF7gE3iO";
const COMPOSE_SECRET = "INSECURE-docker-compose-dev-secret-set-BETTER_AUTH_SECRET";
const DEV_SECRET = "dev-insecure-secret-change-me-dev-insecure-secret";

/** Parse env from scratch with only these variables on top of the test defaults. */
function envWith(vars: Record<string, string | undefined>) {
  for (const key of ["AI_PROVIDER", "PAYMENT_PROVIDER", "EMAIL_PROVIDER", "FAL_KEY", "RESEND_API_KEY", "VERCEL", "TRUSTED_PROXY_HOPS"]) {
    vi.stubEnv(key, undefined);
  }
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v === "" ? undefined : v);
  resetEnvCache();
  return getEnv();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

const prod = (vars: Record<string, string | undefined>) => () =>
  envWith({ NODE_ENV: "production", BETTER_AUTH_SECRET: STRONG, ...vars });

describe("SEC-1: BETTER_AUTH_SECRET in production", () => {
  it.each([
    ["the docker-compose fallback", COMPOSE_SECRET],
    ["the dev fallback", DEV_SECRET],
    ["a 1-char secret", "x"],
    ["a 31-char secret", "a".repeat(10) + "bcdefghijklmnopqrstu"],
    ["a placeholder", "please-change-me-to-something-long-and-random"],
    ["a repeated character", "z".repeat(48)],
  ])("refuses %s", (_label, secret) => {
    expect(prod({ MOCK_PROVIDERS: "true", BETTER_AUTH_SECRET: secret })).toThrow(/BETTER_AUTH_SECRET is unsafe for production/);
  });

  it("refuses a missing secret", () => {
    expect(prod({ MOCK_PROVIDERS: "true", BETTER_AUTH_SECRET: "" })).toThrow(/BETTER_AUTH_SECRET is unsafe/);
  });

  it("accepts a long random secret, and any secret outside production", () => {
    expect(prod({ MOCK_PROVIDERS: "true" })().authSecret).toBe(STRONG);
    expect(envWith({ NODE_ENV: "development", BETTER_AUTH_SECRET: "x" }).authSecret).toBe("x");
  });

  it("skips the check during `next build` (no runtime secrets there)", () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(prod({ MOCK_PROVIDERS: "true", BETTER_AUTH_SECRET: "" })().isProd).toBe(true);
  });

  it("explains why a secret is weak", () => {
    expect(weakAuthSecretReason(undefined)).toBe("it is not set");
    expect(weakAuthSecretReason(COMPOSE_SECRET)).toMatch(/placeholder/);
    expect(weakAuthSecretReason("short")).toMatch(/shorter than 32/);
    expect(weakAuthSecretReason(STRONG)).toBeNull();
  });
});

describe("SEC-1: Docker entrypoint secret (docker/auth-secret.mjs)", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("treats exactly the unset and published placeholder values as replaceable (same rules as env.ts)", () => {
    for (const value of ["", undefined, COMPOSE_SECRET, DEV_SECRET, "change-me-change-me-change-me-change-me", "x".repeat(40)]) {
      expect(isPlaceholderSecret(value)).toBe(true);
      expect(weakAuthSecretReason(value || undefined)).not.toBeNull();
    }
    // A real value is kept, and a short non-placeholder is NOT silently replaced (env.ts then refuses it).
    expect(isPlaceholderSecret(STRONG)).toBe(false);
    expect(isPlaceholderSecret("short-but-chosen")).toBe(false);
  });

  it("generates a random secret once, persists it (mode 600) and reuses it", () => {
    dir = mkdtempSync(path.join(tmpdir(), "auth-secret-"));
    const file = path.join(dir, "data", ".auth-secret");
    const first = resolveAuthSecret({ AUTH_SECRET_FILE: file });
    expect(first.source).toBe("generated");
    expect(weakAuthSecretReason(first.secret)).toBeNull();
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8").trim()).toBe(first.secret);

    // Web and worker (and restarts) share it; a published placeholder is replaced by it too.
    expect(resolveAuthSecret({ AUTH_SECRET_FILE: file }).secret).toBe(first.secret);
    expect(resolveAuthSecret({ AUTH_SECRET_FILE: file, BETTER_AUTH_SECRET: COMPOSE_SECRET })).toMatchObject({
      secret: first.secret,
      source: "file",
      replacedPlaceholder: true,
    });
    // An operator-provided secret always wins.
    expect(resolveAuthSecret({ AUTH_SECRET_FILE: file, BETTER_AUTH_SECRET: STRONG })).toEqual({ secret: STRONG, source: "env" });
  });

  it("never uses a corrupt saved secret, and fails loudly when it can't save one", () => {
    dir = mkdtempSync(path.join(tmpdir(), "auth-secret-"));
    const file = path.join(dir, ".auth-secret");
    writeFileSync(file, "too-short\n");
    expect(() => persistedSecret(file)).toThrow(/delete it to generate a new one/);
    // Parent "directory" is a regular file: nothing can be written there (also as root).
    expect(() => persistedSecret(path.join(file, ".auth-secret"))).toThrow();
  });
});

describe("SEC-2 / PAY-4: no real/mock mixing in production", () => {
  it("refuses real AI with MOCK_PROVIDERS=true (the .env.example default): payments + email would be mock", () => {
    const run = prod({ MOCK_PROVIDERS: "true", AI_PROVIDER: "fal", FAL_KEY: "fal-real-key", RESEND_API_KEY: "re_real_key" });
    expect(run).toThrow(/AI_PROVIDER=fal in production requires real payments and email/);
    expect(run).toThrow(/PAYMENT_PROVIDER \(use stripe\) and EMAIL_PROVIDER/);
  });

  it("refuses real AI + real payments with mock email (the dev mailbox would publish sign-in links)", () => {
    const run = prod({
      MOCK_PROVIDERS: "false",
      AI_PROVIDER: "fal",
      FAL_KEY: "k",
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_1",
      STRIPE_WEBHOOK_SECRET: "whsec_1",
      EMAIL_PROVIDER: "mock",
    });
    expect(run).toThrow(/EMAIL_PROVIDER \(use resend/);
  });

  it("allows an all-real production config: no banner, no mailbox, no mock checkout", () => {
    const e = prod({
      MOCK_PROVIDERS: "false",
      AI_PROVIDER: "fal",
      FAL_KEY: "k",
      STRIPE_SECRET_KEY: "sk_test_1",
      STRIPE_WEBHOOK_SECRET: "whsec_1",
      RESEND_API_KEY: "re_1",
    })();
    expect([e.aiProvider, e.paymentProvider, e.emailProvider]).toEqual(["fal", "stripe", "resend"]);
    expect(e).toMatchObject({ demoBanner: false, devMailboxEnabled: false, mockCheckoutEnabled: false, mockedProviders: [] });
  });

  it("allows an all-mock production demo (zero-key Docker) with banner, mailbox and mock checkout", () => {
    const e = prod({ MOCK_PROVIDERS: "true" })();
    expect(e).toMatchObject({
      demoBanner: true,
      mockedProviders: ["ai", "payments", "email"],
      devMailboxEnabled: true,
      mockCheckoutEnabled: true,
    });
  });

  it("keeps the mailbox off in production unless AI, payments and email are ALL mock", () => {
    const e = prod({
      MOCK_PROVIDERS: "false",
      AI_PROVIDER: "mock",
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_1",
      STRIPE_WEBHOOK_SECRET: "whsec_1",
      EMAIL_PROVIDER: "mock",
    })();
    expect(e).toMatchObject({ emailProvider: "mock", devMailboxEnabled: false, mockCheckoutEnabled: false, demoBanner: true });
    expect(e.mockedProviders).toEqual(["ai", "email"]);
  });

  it("still allows mixing outside production (e.g. trying fal locally with mock payments)", () => {
    const e = envWith({ NODE_ENV: "development", MOCK_PROVIDERS: "true", AI_PROVIDER: "fal", FAL_KEY: "k" });
    expect(e).toMatchObject({ aiProvider: "fal", paymentProvider: "mock", devMailboxEnabled: true, mockCheckoutEnabled: true, demoBanner: false });
  });
});

describe("SEC-4: TRUSTED_PROXY_HOPS", () => {
  it("defaults to 1 on Vercel and 0 elsewhere; explicit values win", () => {
    expect(envWith({}).trustedProxyHops).toBe(0);
    expect(envWith({ VERCEL: "1" }).trustedProxyHops).toBe(1);
    expect(envWith({ VERCEL: "1", TRUSTED_PROXY_HOPS: "0" }).trustedProxyHops).toBe(0);
    expect(envWith({ TRUSTED_PROXY_HOPS: "2" }).trustedProxyHops).toBe(2);
  });

  it.each(["-1", "abc", "1.5", "99"])("rejects %s", (value) => {
    expect(() => envWith({ TRUSTED_PROXY_HOPS: value })).toThrow(/TRUSTED_PROXY_HOPS/);
  });
});
