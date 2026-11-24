/** Friendly copy for `?error=` codes Better Auth (and our hooks) append to /login. */
const MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "That sign-in link is invalid or has already been used. Request a new one below.",
  EXPIRED_TOKEN: "That sign-in link has expired. Request a new one below.",
  ACCOUNT_DELETED: "This account has been deleted. You can create a new one with a different email.",
  BANNED_USER: "Your account is suspended. Contact support if you think this is a mistake.",
  RATE_LIMITED: "Too many sign-in attempts. Please wait a while and try again.",
  access_denied: "Google sign-in was cancelled.",
  state_mismatch: "Your sign-in session expired. Please try again.",
  state_not_found: "Your sign-in session expired. Please try again.",
  please_restart_the_process: "Your sign-in session expired. Please try again.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES[code.toUpperCase()] ?? "Sign-in didn't work. Please try again.";
}
