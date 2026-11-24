/** Summarize the validated environment: which providers are active + deployment warnings. */
import type { Env } from "@/lib/env";
import { describeDatabase, parseDatabaseUrl } from "./database";

export interface EnvRow {
  area: string;
  value: string;
  detail: string;
}

export interface EnvReport {
  mode: Env["NODE_ENV"];
  rows: EnvRow[];
  warnings: string[];
}

const LOCALHOST_URL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/;

function databaseRow(url: string): EnvRow {
  try {
    const target = parseDatabaseUrl(url);
    return { area: "Database", value: target.kind === "pglite" ? "pglite" : "postgres", detail: describeDatabase(target) };
  } catch (err) {
    return { area: "Database", value: "invalid", detail: err instanceof Error ? err.message : String(err) };
  }
}

function aiDetail(env: Env): string {
  switch (env.aiProvider) {
    case "mock":
      return "placeholder outputs, no API key needed";
    case "fal":
      return "fal.ai (FAL_KEY set)";
    case "replicate":
      return `Replicate (owner ${env.REPLICATE_OWNER ?? "?"})`;
  }
}

export function inspectEnv(env: Env): EnvReport {
  const isPglite = env.DATABASE_URL.startsWith("pglite:");
  const stripeMode = env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test";
  const signIn = ["magic link", ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? ["Google"] : [])].join(" + ");

  const rows: EnvRow[] = [
    databaseRow(env.DATABASE_URL),
    { area: "AI provider", value: env.aiProvider, detail: aiDetail(env) },
    {
      area: "Payments",
      value: env.paymentProvider,
      detail: env.paymentProvider === "stripe" ? `Stripe (${stripeMode} key)` : "mock checkout, no real charges",
    },
    {
      area: "Email",
      value: env.emailProvider,
      detail: env.emailProvider === "resend" ? `Resend, from ${env.EMAIL_FROM}` : "not delivered; readable at /dev/emails",
    },
    {
      area: "Storage",
      value: env.STORAGE_DRIVER,
      detail:
        env.STORAGE_DRIVER === "s3"
          ? `bucket ${env.S3_BUCKET ?? "?"}${env.S3_ENDPOINT ? ` @ ${env.S3_ENDPOINT}` : ""}`
          : env.LOCAL_STORAGE_DIR,
    },
    { area: "Face detection", value: env.faceProvider, detail: env.faceProvider === "mock" ? "mock (dev only)" : "consent + likeness checks" },
    { area: "Moderation", value: env.moderationProvider, detail: env.moderationProvider === "mock" ? "mock (dev only)" : "text + image checks" },
    {
      area: "Webhooks",
      value: env.webhooksEnabled ? "enabled" : "disabled",
      detail: env.webhooksEnabled ? `${env.webhookBase}/api/webhooks/…` : "local URL: job status is polled instead",
    },
    { area: "Sign-in", value: signIn, detail: env.BETTER_AUTH_SECRET ? "BETTER_AUTH_SECRET set" : "dev secret (insecure)" },
    { area: "Cron", value: env.CRON_SECRET ? "protected" : "no secret", detail: "/api/cron/* (or `pnpm worker`)" },
    { area: "Demo mode", value: env.DEMO_MODE ? "on" : "off", detail: env.DEMO_MODE ? "/api/demo/login enabled" : "" },
  ];

  const warnings: string[] = [];
  if (env.isProd) {
    if (isPglite) warnings.push("Using PGlite in production: data stays on one local disk and cannot scale. Use Postgres.");
    if (env.aiProvider === "mock") warnings.push("Mock AI provider in production: generated photos are placeholders.");
    if (env.paymentProvider === "mock") warnings.push("Mock payments in production: anyone can add credits for free.");
    if (env.emailProvider === "mock") warnings.push("Mock email in production: magic links and receipts are never delivered.");
    if (env.STORAGE_DRIVER === "local") warnings.push("Local file storage in production: files are lost on ephemeral/serverless disks. Use S3.");
    if (LOCALHOST_URL.test(env.NEXT_PUBLIC_APP_URL)) warnings.push("NEXT_PUBLIC_APP_URL points to localhost in production.");
    if (env.paymentProvider === "stripe" && stripeMode === "test") warnings.push("Stripe test key in production.");
    if (env.DEMO_MODE) warnings.push("DEMO_MODE is on in production.");
  } else if (!env.BETTER_AUTH_SECRET) {
    warnings.push("BETTER_AUTH_SECRET is not set: sessions use an insecure development secret.");
  }
  if (!env.CRON_SECRET) warnings.push("CRON_SECRET is not set: set it to call /api/cron/* (required for Vercel cron).");
  if (!env.webhooksEnabled && env.aiProvider !== "mock") {
    warnings.push("Webhooks are disabled (local URL): set WEBHOOK_BASE_URL to a public URL for instant job updates.");
  }

  return { mode: env.NODE_ENV, rows, warnings };
}
