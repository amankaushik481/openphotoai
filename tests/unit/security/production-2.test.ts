/**
 * Second security pass (docs/reviews/security-2.md), production configuration findings.
 *   S2-1  an all-mock production deployment's public dev mailbox never shows mail to admins
 *         (it used to hand anyone an admin's magic link: GET /api/dev/emails/latest?to=<admin>)
 *   S2-8  production refuses the published MinIO credentials on an S3 endpoint others can reach
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as latestEmailGet } from "@/app/api/dev/emails/latest/route";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { getEnv, resetEnvCache } from "@/lib/env";
import { getDevEmail, getLatestDevEmail, isDevMailboxEnabled, listDevEmails } from "@/server/email/dev-mailbox";
import { createTestDb, createTestUser } from "../../helpers/db";

vi.mock("@/server/auth/session", async () => (await import("../../helpers/session")).sessionMock);

const STRONG = "k3Jx9-Qw7_ZpL2mN8vB4cR6tY1uH5sD0aF7gE3iO";

function stub(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  resetEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

beforeEach(async () => {
  await createTestDb();
});

async function mail(to: string, template = "magic_link") {
  const [row] = await db
    .insert(emailOutbox)
    .values({ to, subject: "Your sign-in link", template, html: `<a href="http://localhost:3000/verify?token=t-${to}">Sign in</a>`, status: "mocked" })
    .returning();
  return row!;
}

const latest = (to: string) =>
  latestEmailGet(new NextRequest(`http://localhost:3000/api/dev/emails/latest?to=${encodeURIComponent(to)}&template=magic_link`), {
    params: Promise.resolve({}),
  });

describe("S2-1: the public dev mailbox withholds admins' mail in production", () => {
  const prodAllMock = { NODE_ENV: "production", BETTER_AUTH_SECRET: STRONG, MOCK_PROVIDERS: "true", ADMIN_EMAILS: "boss@example.com" };

  it("hides mail to ADMIN_EMAILS and to users with the admin role; other mail stays visible", async () => {
    await createTestUser({ email: "promoted@example.com", role: "admin" });
    const toBoss = await mail("Boss@Example.com");
    const toPromoted = await mail("promoted@example.com", "deletion_confirm_request");
    const toAlice = await mail("alice@example.com");
    stub(prodAllMock);
    expect(isDevMailboxEnabled()).toBe(true);

    expect((await latest("boss@example.com")).status).toBe(404);
    expect((await latest("PROMOTED@example.com")).status).toBe(404);
    expect(await getLatestDevEmail({ to: "promoted@example.com" })).toBeNull();
    expect(await getDevEmail(toBoss.id)).toBeNull();
    expect(await getDevEmail(toPromoted.id)).toBeNull();
    expect((await listDevEmails()).map((e) => e.id)).toEqual([toAlice.id]);

    const alice = await latest("alice@example.com");
    expect(alice.status).toBe(200);
    expect((await alice.json()).links[0]).toContain("token=t-alice@example.com");
  });

  it("keeps showing everything outside production (local dev, e2e) [S2-1]", async () => {
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
    resetEnvCache();
    const toBoss = await mail("boss@example.com");
    expect((await latest("boss@example.com")).status).toBe(200);
    expect((await getDevEmail(toBoss.id))?.id).toBe(toBoss.id);
  });
});

describe("S2-8: published MinIO credentials on a reachable S3 endpoint", () => {
  const s3 = (endpoint: string | undefined, secret: string, user = "openshoot") => () => {
    stub({
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: STRONG,
      MOCK_PROVIDERS: "true",
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "openshoot",
      S3_ACCESS_KEY_ID: user,
      S3_SECRET_ACCESS_KEY: secret,
      S3_ENDPOINT: endpoint,
    });
    return getEnv();
  };

  it.each([
    ["a public MinIO hostname", "https://minio.example.com"],
    ["a LAN address", "http://192.168.1.20:9000"],
    ["AWS (no endpoint)", undefined],
  ])("refuses the docker-compose default secret on %s", (_label, endpoint) => {
    expect(s3(endpoint, "openshoot-dev-secret")).toThrow(/S3_SECRET_ACCESS_KEY.*published default/);
    expect(s3(endpoint, "minioadmin", "minioadmin")).toThrow(/S3_SECRET_ACCESS_KEY.*published default/);
  });

  it("allows the defaults on the loopback / Docker-network endpoint compose uses, and real secrets anywhere", () => {
    expect(s3("http://localhost:9000", "openshoot-dev-secret")).not.toThrow();
    expect(s3("http://127.0.0.1:9000", "openshoot-dev-secret")).not.toThrow();
    expect(s3("http://minio:9000", "openshoot-dev-secret")).not.toThrow();
    expect(s3("https://minio.example.com", STRONG)).not.toThrow();
  });

  it("only applies in production", () => {
    stub({
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "openshoot",
      S3_SECRET_ACCESS_KEY: "openshoot-dev-secret",
      S3_ENDPOINT: "https://minio.example.com",
    });
    expect(() => getEnv()).not.toThrow();
  });
});
