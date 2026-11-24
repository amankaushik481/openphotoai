/**
 * Better Auth instance: magic link (+ Google when configured), Drizzle adapter over
 * our `user`/`session`/`account`/`verification` tables. Email + password is off.
 *
 * Created lazily on first use so importing this module (e.g. during `next build`)
 * never validates env or touches the database.
 */
import { APIError, betterAuth, type GenericEndpointContext } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import { CLIENT_IP_HEADER } from "@/server/http";
import { enforceMagicLinkRateLimit, toVerifyPageUrl } from "./magic-link";
import { admitSignIn, onUserCreated, prepareNewUser, type SignInBlock } from "./user-policy";

const ID_PREFIX: Record<string, string> = { user: "usr", session: "ses", account: "acc", verification: "ver" };

const SESSION_TTL_SEC = 60 * 60 * 24 * 30;
const MAGIC_LINK_TTL_SEC = 60 * 15;
/**
 * Better Auth's own magic-link limit (send + verify, per IP) when links only reach the dev mailbox.
 * Its default (5 / minute) would lock out dev and e2e runs, which share one localhost IP; our
 * per-IP send limit is skipped in that mode for the same reason (see enforceMagicLinkRateLimit).
 */
const DEV_MAILBOX_MAGIC_LINK_RATE_LIMIT = { window: 60, max: 100 };

/** Where a blocked user lands when a browser sign-in is refused. */
const BLOCKED_REDIRECT: Record<SignInBlock, string> = {
  banned: "/suspended",
  deleted: "/login?error=ACCOUNT_DELETED",
};

/** App fields on `user`. `input: false` so no client can set them through Better Auth endpoints. */
const userAdditionalFields = {
  role: { type: "string", required: false, defaultValue: "user", input: false },
  banned: { type: "boolean", required: false, defaultValue: false, input: false },
  banReason: { type: "string", required: false, input: false },
  banExpires: { type: "date", required: false, input: false },
  credits: { type: "number", required: false, defaultValue: 0, input: false },
  plan: { type: "string", required: false, defaultValue: "free", input: false },
  hasPaid: { type: "boolean", required: false, defaultValue: false, input: false },
  stripeCustomerId: { type: "string", required: false, input: false, returned: false },
  locale: { type: "string", required: false, defaultValue: "en", input: false },
  marketingOptIn: { type: "boolean", required: false, defaultValue: false, input: false },
  lowCreditsNotifiedAt: { type: "date", required: false, input: false, returned: false },
  deletedAt: { type: "date", required: false, input: false, returned: false },
} as const;

function requestHeaders(ctx: GenericEndpointContext | null | undefined): Headers | undefined {
  return ctx?.request?.headers ?? ctx?.headers;
}

function createAuth() {
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const googleEnabled = isGoogleAuthEnabled();

  return betterAuth({
    appName: env.NEXT_PUBLIC_APP_NAME,
    baseURL: appUrl,
    basePath: "/api/auth",
    secret: env.authSecret,
    trustedOrigins: [appUrl],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    advanced: {
      database: { generateId: ({ model }) => newId(ID_PREFIX[model] ?? model.slice(0, 3)) },
      // Only the IP our auth route resolved with the trusted-proxy rules (clientIpFromHeaders); the
      // route strips any client-sent copy. Unknown IP => Better Auth's shared per-path bucket.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    // Profile edits go through PATCH /api/me (validated, length-capped). Better Auth's update-user
    // would accept any `image` URL (rendered to teammates) and an unbounded `name` (used in emails).
    disabledPaths: ["/update-user"],
    emailAndPassword: { enabled: false },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
            prompt: "select_account",
          },
        }
      : undefined,
    account: {
      // A magic-link account and a Google login with the same email are one user, but only when Google
      // reports the email as verified (Better Auth's default check; no `trustedProviders`, which would
      // skip it and let an unverified Google identity claiming someone's address take over the account).
      accountLinking: { enabled: true },
    },
    user: { additionalFields: userAdditionalFields },
    session: {
      expiresIn: SESSION_TTL_SEC,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    onAPIError: { errorURL: `${appUrl}/login` },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => ({ data: prepareNewUser(data, env.ADMIN_EMAILS) }),
          after: async (created) => {
            await onUserCreated({ id: created.id, email: created.email, name: created.name });
          },
        },
      },
      session: {
        create: {
          before: async (data, ctx) => {
            const block = await admitSignIn(data.userId);
            if (!block) return;
            // Browser flows (magic-link verify, OAuth callback) get a redirect; API callers a 403.
            if (ctx) throw ctx.redirect(`${appUrl}${BLOCKED_REDIRECT[block]}`);
            throw APIError.from("FORBIDDEN", {
              code: block === "banned" ? "BANNED_USER" : "ACCOUNT_DELETED",
              message: block === "banned" ? "Your account is suspended." : "This account has been deleted.",
            });
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SEC,
        storeToken: "hashed",
        // Only while links go to the dev mailbox (never a production fallback for a missing RESEND_API_KEY).
        rateLimit: env.devMailboxEnabled ? DEV_MAILBOX_MAGIC_LINK_RATE_LIMIT : undefined,
        sendMagicLink: async ({ email, url }, ctx) => {
          await enforceMagicLinkRateLimit(requestHeaders(ctx), email);
          const { sendEmail } = await import("@/server/email"); // lazy: keeps provider SDKs off the auth path
          await sendEmail("magic_link", email, { url: toVerifyPageUrl(url, appUrl) });
        },
      }),
      nextCookies(), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __openshootAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.__openshootAuth ??= createAuth();
  return globalForAuth.__openshootAuth;
}

/** Test helper: rebuild the instance on next use (e.g. after changing env). */
export function resetAuth(): void {
  globalForAuth.__openshootAuth = undefined;
}

/** Lazy proxy so `auth.api.getSession(...)` works without eager construction. */
export const auth: Auth = new Proxy({} as Auth, {
  get(_t, prop) {
    return getAuth()[prop as keyof Auth];
  },
});

export function isGoogleAuthEnabled(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
