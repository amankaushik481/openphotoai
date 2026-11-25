/**
 * Server-side environment, validated with Zod. CONTRACT FILE — every variable is
 * documented in .env.example. Import `env` from here instead of reading process.env.
 *
 * Parsing is lazy (first property access) so `next build` works without runtime secrets.
 *
 * SAFETY INVARIANT: when a real AI provider is configured, the face + moderation
 * providers can never be "mock". This is enforced here and cannot be overridden.
 *
 * PRODUCTION INVARIANTS (not overridable):
 *   • BETTER_AUTH_SECRET is ≥ 32 characters and not a published placeholder (it signs sessions).
 *   • No real/mock mixing: a real AI_PROVIDER requires real payments AND real email. Otherwise mock
 *     checkout would hand out free credits spent on the real AI account, and the public dev mailbox
 *     would expose live sign-in links. An all-mock production deployment (zero-key demo / Docker)
 *     is allowed; the UI then shows a "Demo mode" banner.
 */
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", "yes", "no", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["true", "1", "yes"].includes(v)));

const optionalStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const intWithDefault = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? Number.parseInt(v, 10) : def))
    .pipe(z.number().int());

const DEV_SECRET = "dev-insecure-secret-change-me-dev-insecure-secret";

/** Minimum BETTER_AUTH_SECRET length in production. */
export const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Secrets that were ever published (in this repo's docs, compose file or code) or are obvious
 * placeholders. Keep in sync with docker/auth-secret.mjs (a unit test checks both agree).
 */
const KNOWN_PLACEHOLDER_SECRETS = new Set([DEV_SECRET, "INSECURE-docker-compose-dev-secret-set-BETTER_AUTH_SECRET"]);
const PLACEHOLDER_SECRET_PATTERN = /insecure|change[-_ ]?me|replace[-_ ]?me|placeholder|your[-_ ]?secret|^(.)\1+$/i;

/**
 * Why a BETTER_AUTH_SECRET is unsafe for production, or null when it is acceptable.
 * Rejects short values, published/placeholder values and single-character repeats.
 */
export function weakAuthSecretReason(secret: string | undefined): string | null {
  if (!secret) return "it is not set";
  if (KNOWN_PLACEHOLDER_SECRETS.has(secret) || PLACEHOLDER_SECRET_PATTERN.test(secret)) {
    return "it is a published placeholder value";
  }
  if (secret.length < MIN_AUTH_SECRET_LENGTH) return `it is shorter than ${MIN_AUTH_SECRET_LENGTH} characters`;
  if (new Set(secret).size < 8) return "it has too little variety (fewer than 8 distinct characters)";
  return null;
}

/**
 * S3 secrets that are published (docker-compose.yml / .env.example MinIO defaults, MinIO's own default).
 * Anyone who can reach the endpoint could read every stored photo with them.
 */
const PUBLISHED_S3_SECRETS = new Set(["openshoot-dev-secret", "minioadmin"]);

/**
 * True when only this machine or its Docker network can reach `endpoint`: loopback, or a bare service
 * name such as `minio` (what docker-compose uses). Unset (AWS), public and LAN hosts are reachable.
 */
function isLoopbackOrServiceEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  return host === "localhost" || host.endsWith(".localhost") || /^127\.\d+\.\d+\.\d+$/.test(host) || host === "::1" || !/[.:]/.test(host);
}

/** Reverse-proxy hops are capped: more than this is a misconfiguration. */
const MAX_TRUSTED_PROXY_HOPS = 10;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // App
    NEXT_PUBLIC_APP_NAME: z.string().default("OpenShoot"),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    /** Public base URL providers call for webhooks. Defaults to APP_URL; localhost => polling only. */
    WEBHOOK_BASE_URL: optionalStr,

    // Database
    DATABASE_URL: z.string().default("pglite:./.data/pglite"),

    // Auth
    BETTER_AUTH_SECRET: optionalStr,
    GOOGLE_CLIENT_ID: optionalStr,
    GOOGLE_CLIENT_SECRET: optionalStr,
    /** Comma-separated emails that are always admins. */
    ADMIN_EMAILS: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [])),

    // Provider selection
    MOCK_PROVIDERS: bool(false),
    AI_PROVIDER: z.enum(["mock", "fal", "replicate"]).optional(),
    PAYMENT_PROVIDER: z.enum(["mock", "stripe"]).optional(),
    EMAIL_PROVIDER: z.enum(["mock", "resend"]).optional(),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    FACE_PROVIDER: z.enum(["mock", "local", "rekognition"]).optional(),
    MODERATION_PROVIDER: z.enum(["mock", "local", "openai"]).optional(),

    // AI providers
    FAL_KEY: optionalStr,
    REPLICATE_API_TOKEN: optionalStr,
    REPLICATE_WEBHOOK_SECRET: optionalStr,
    /** Replicate account/org that owns destination models created by training. */
    REPLICATE_OWNER: optionalStr,
    MOCK_JOB_DELAY_MS: intWithDefault(1500),

    // Safety (optional hosted backends; local + mock need no keys)
    OPENAI_API_KEY: optionalStr,
    AWS_REGION: optionalStr,
    AWS_ACCESS_KEY_ID: optionalStr,
    AWS_SECRET_ACCESS_KEY: optionalStr,

    // Storage
    LOCAL_STORAGE_DIR: z.string().default("./.data/storage"),
    S3_ENDPOINT: optionalStr,
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: optionalStr,
    S3_ACCESS_KEY_ID: optionalStr,
    S3_SECRET_ACCESS_KEY: optionalStr,
    S3_FORCE_PATH_STYLE: bool(false),

    // Payments
    STRIPE_SECRET_KEY: optionalStr,
    STRIPE_WEBHOOK_SECRET: optionalStr,

    // Email
    RESEND_API_KEY: optionalStr,
    EMAIL_FROM: z.string().default("OpenShoot <hello@localhost>"),

    // Ops
    CRON_SECRET: optionalStr,
    SIGNUP_BONUS_CREDITS: intWithDefault(0),
    WATERMARK_FREE_TIER: bool(true),
    /** Enables /api/demo/login and the "Try the demo" button (requires mock AI + mock payments). */
    DEMO_MODE: bool(false),

    /**
     * Number of reverse proxies in front of the app that append the client address to
     * X-Forwarded-For (nginx `$proxy_add_x_forwarded_for`, Caddy, Traefik, a load balancer…).
     * The client IP is the Nth entry from the RIGHT, so entries a client adds itself are ignored.
     * 0 = no trusted proxy: forwarded headers are ignored and the client IP is unknown.
     * Default: 1 on Vercel (detected via VERCEL), otherwise 0. See clientIp() in src/server/http.ts.
     */
    TRUSTED_PROXY_HOPS: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== "" ? Number(v.trim()) : undefined))
      .pipe(z.number().int().min(0).max(MAX_TRUSTED_PROXY_HOPS).optional()),
    /** Set by Vercel ("1") on its build and runtime; only used to default TRUSTED_PROXY_HOPS. */
    VERCEL: optionalStr,
  })
  .transform((e) => {
    const mock = e.MOCK_PROVIDERS;
    const aiProvider = e.AI_PROVIDER ?? (mock ? "mock" : "fal");
    const paymentProvider = e.PAYMENT_PROVIDER ?? (mock ? "mock" : "stripe");
    const emailProvider = e.EMAIL_PROVIDER ?? (mock || !e.RESEND_API_KEY ? "mock" : "resend");
    const faceProvider = e.FACE_PROVIDER ?? (aiProvider === "mock" ? "mock" : "local");
    const moderationProvider = e.MODERATION_PROVIDER ?? (aiProvider === "mock" ? "mock" : "local");
    const appUrl = e.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const webhookBase = (e.WEBHOOK_BASE_URL ?? appUrl).replace(/\/$/, "");
    const webhooksEnabled = !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(webhookBase);
    const isProd = e.NODE_ENV === "production";
    /** User-visible providers running as mocks (drives the production "Demo mode" banner). */
    const mockedProviders = [
      ...(aiProvider === "mock" ? (["ai"] as const) : []),
      ...(paymentProvider === "mock" ? (["payments"] as const) : []),
      ...(emailProvider === "mock" ? (["email"] as const) : []),
    ];
    const allMock = mockedProviders.length === 3;
    return {
      ...e,
      NEXT_PUBLIC_APP_URL: appUrl,
      aiProvider,
      paymentProvider,
      emailProvider,
      faceProvider,
      moderationProvider,
      webhookBase,
      webhooksEnabled,
      authSecret: e.BETTER_AUTH_SECRET ?? DEV_SECRET,
      isProd,
      isTest: e.NODE_ENV === "test",
      mockedProviders,
      /** Production running (partly) on mock providers: show the "Demo mode" banner. */
      demoBanner: isProd && mockedProviders.length > 0,
      /**
       * Public dev mailbox (/dev/emails, /api/dev/emails/latest): it shows live sign-in links, so in
       * production it needs an all-mock deployment AND an explicit mock-email choice (a deployment
       * that merely forgot RESEND_API_KEY never exposes links).
       */
      devMailboxEnabled:
        emailProvider === "mock" && (!isProd || (allMock && (mock || e.EMAIL_PROVIDER === "mock"))),
      /** Free mock checkout (/billing/mock-checkout, /api/billing/mock/*): in production only with mock AI. */
      mockCheckoutEnabled: paymentProvider === "mock" && (!isProd || aiProvider === "mock"),
      trustedProxyHops: e.TRUSTED_PROXY_HOPS ?? (e.VERCEL ? 1 : 0),
    };
  })
  .superRefine((e, ctx) => {
    // ── Safety invariant: real AI => real safety. Not overridable. ──
    if (e.aiProvider !== "mock" && (e.faceProvider === "mock" || e.moderationProvider === "mock")) {
      ctx.addIssue({
        code: "custom",
        message:
          "Safety: FACE_PROVIDER and MODERATION_PROVIDER cannot be 'mock' when a real AI_PROVIDER is used.",
      });
    }
    if (e.aiProvider === "fal" && !e.FAL_KEY) ctx.addIssue({ code: "custom", message: "AI_PROVIDER=fal requires FAL_KEY" });
    if (e.aiProvider === "replicate" && (!e.REPLICATE_API_TOKEN || !e.REPLICATE_OWNER))
      ctx.addIssue({ code: "custom", message: "AI_PROVIDER=replicate requires REPLICATE_API_TOKEN and REPLICATE_OWNER" });
    if (e.paymentProvider === "stripe" && (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET))
      ctx.addIssue({ code: "custom", message: "PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET" });
    if (e.emailProvider === "resend" && !e.RESEND_API_KEY)
      ctx.addIssue({ code: "custom", message: "EMAIL_PROVIDER=resend requires RESEND_API_KEY" });
    if (e.STORAGE_DRIVER === "s3" && (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY))
      ctx.addIssue({ code: "custom", message: "STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY" });
    if (e.faceProvider === "rekognition" && (!e.AWS_REGION || !e.AWS_ACCESS_KEY_ID || !e.AWS_SECRET_ACCESS_KEY))
      ctx.addIssue({ code: "custom", message: "FACE_PROVIDER=rekognition requires AWS_REGION/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY" });
    if (e.moderationProvider === "openai" && !e.OPENAI_API_KEY)
      ctx.addIssue({ code: "custom", message: "MODERATION_PROVIDER=openai requires OPENAI_API_KEY" });
    // `next build` runs with NODE_ENV=production but has no runtime secrets (e.g. Docker build stage).
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    if (e.isProd && !isBuildPhase) {
      // Anyone who knows the secret can forge session cookies for any user (admins included).
      const weak = weakAuthSecretReason(e.BETTER_AUTH_SECRET);
      if (weak)
        ctx.addIssue({
          code: "custom",
          path: ["BETTER_AUTH_SECRET"],
          message: `BETTER_AUTH_SECRET is unsafe for production: ${weak}. Generate one with \`openssl rand -base64 32\` (${MIN_AUTH_SECRET_LENGTH}+ random characters).`,
        });
      // The bundled MinIO's published credentials are only safe while nobody else can reach it.
      if (
        e.STORAGE_DRIVER === "s3" &&
        e.S3_SECRET_ACCESS_KEY &&
        PUBLISHED_S3_SECRETS.has(e.S3_SECRET_ACCESS_KEY) &&
        !isLoopbackOrServiceEndpoint(e.S3_ENDPOINT)
      )
        ctx.addIssue({
          code: "custom",
          path: ["S3_SECRET_ACCESS_KEY"],
          message:
            "S3_SECRET_ACCESS_KEY is a published default (the docker-compose MinIO password) but S3_ENDPOINT is reachable " +
            "from outside this machine: anyone could read every stored photo. Set MINIO_ROOT_PASSWORD (or your provider's " +
            "secret) to a random value, e.g. `openssl rand -base64 32`.",
        });
      // No real/mock mixing: real AI spend must be paid for, and sign-in links must never be public.
      if (e.aiProvider !== "mock" && (e.paymentProvider === "mock" || e.emailProvider === "mock")) {
        const mocked = [
          ...(e.paymentProvider === "mock" ? ["PAYMENT_PROVIDER (use stripe)"] : []),
          ...(e.emailProvider === "mock" ? ["EMAIL_PROVIDER (use resend + RESEND_API_KEY)"] : []),
        ];
        ctx.addIssue({
          code: "custom",
          message:
            `AI_PROVIDER=${e.aiProvider} in production requires real payments and email, but ${mocked.join(" and ")} ` +
            `${mocked.length > 1 ? "are" : "is"} mock. Set MOCK_PROVIDERS=false (it is for local/demo use only) ` +
            "and configure the real providers, or run everything on mock providers for a demo.",
        });
      }
    }
    if (e.DEMO_MODE && (e.aiProvider !== "mock" || e.paymentProvider !== "mock"))
      ctx.addIssue({ code: "custom", message: "DEMO_MODE requires mock AI and mock payment providers" });
  });

export type Env = z.output<typeof schema>;

let cached: Env | undefined;

/** Parse (once) and return the validated environment. Throws a readable error if invalid. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: re-read process.env on next access. */
export function resetEnvCache() {
  cached = undefined;
}

/** Lazily-validated env object: `env.DATABASE_URL`, `env.aiProvider`, ... */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
