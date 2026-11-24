/**
 * Demo mode (DEMO_MODE=true, mock AI + mock payments only): one click creates a throwaway account
 * with credits, a ready identity model and a first batch. Demo accounts are recognised by their
 * email domain (`.invalid` is reserved by RFC 2606, so no real address can ever use it) and are
 * deleted by the maintenance job once they are older than DEMO_ACCOUNT_TTL_HOURS.
 *
 * Kept free of heavy imports: maintenance and the app shell only need these helpers.
 */
export const DEMO_EMAIL_DOMAIN = "demo.invalid";
export const DEMO_USER_NAME = "Demo user";
export const DEMO_CREDITS = 300;
export const DEMO_ACCOUNT_TTL_HOURS = 24;
/** Pack + size of the batch started for every new demo account. */
export const DEMO_PACK_SLUG = "linkedin-headshots";
export const DEMO_BATCH_SIZE = 6;
/** Cookie set when a demo user dismisses the app-shell banner (read server-side: no flash). */
export const DEMO_BANNER_COOKIE = "os_demo_banner_dismissed";

/** True for accounts created by POST /api/demo/login. */
export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`));
}

/** `demo+<random>@demo.invalid` */
export function demoEmail(random: string): string {
  return `demo+${random.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`;
}
