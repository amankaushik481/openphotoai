/**
 * Server-side environment, validated with Zod. CONTRACT FILE — every variable is
 * documented in .env.example. Import `env` from here instead of reading process.env.
 *
 * Parsing is lazy (first property access) so `next build` works without runtime secrets.
 *
 * SAFETY INVARIANT: when a real AI provider is configured, the face + moderation
 * providers can never be "mock". This is enforced here and cannot be overridden.
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
      isProd: e.NODE_ENV === "production",
      isTest: e.NODE_ENV === "test",
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
    if (e.isProd && !e.BETTER_AUTH_SECRET)
      ctx.addIssue({ code: "custom", message: "BETTER_AUTH_SECRET is required in production" });
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
