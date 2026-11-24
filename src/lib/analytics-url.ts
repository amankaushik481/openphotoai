/**
 * URL scrubbing for analytics (PostHog). Several pages carry bearer secrets in the URL: magic-link
 * tokens (/verify?token=), account deletion (/account/delete/confirm?token=), share links
 * (/s/<token>), invites (/invites/<token>, /teams/join/<token>), signed mock-checkout ids. Anyone
 * with access to the analytics project could replay them, so nothing but the route shape and
 * campaign parameters ever leaves the browser.
 */

/** Path prefixes whose next segment is a secret, replaced by a placeholder. */
const SECRET_SEGMENT_ROUTES: ReadonlyArray<readonly [prefix: string, placeholder: string]> = [
  ["/s/", ":token"],
  ["/invites/", ":token"],
  ["/teams/join/", ":token"],
  ["/dev/emails/", ":id"],
];

/** Query parameters that are safe to keep (marketing attribution); everything else is dropped. */
const ALLOWED_PARAMS = /^(utm_(source|medium|campaign|term|content)|ref)$/;

/** Event / person properties that hold a URL or a path. */
const URL_PROPERTIES = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"] as const;
const PATH_PROPERTIES = ["$pathname", "$prev_pageview_pathname", "$initial_pathname"] as const;

/** Routes that never get analytics beyond a scrubbed pageview (they exist to handle a token). */
const SENSITIVE_PREFIXES = ["/verify", "/account/delete", "/billing/mock-checkout", "/dev/", ...SECRET_SEGMENT_ROUTES.map(([p]) => p)];

export function isSensitivePath(pathname: string): boolean {
  return SENSITIVE_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

/** `/s/abc123/x` → `/s/:token/x`. */
export function sanitizePath(pathname: string): string {
  for (const [prefix, placeholder] of SECRET_SEGMENT_ROUTES) {
    if (pathname.startsWith(prefix) && pathname.length > prefix.length) {
      const rest = pathname.slice(prefix.length);
      const slash = rest.indexOf("/");
      return `${prefix}${placeholder}${slash === -1 ? "" : rest.slice(slash)}`;
    }
  }
  return pathname;
}

/**
 * Scrub a URL for analytics: secret path segments replaced, query reduced to utm_* / ref (none at
 * all on sensitive routes), fragment dropped. Unparseable input returns null.
 */
export function sanitizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const sensitive = isSensitivePath(url.pathname);
  const kept = new URLSearchParams();
  if (!sensitive) for (const [k, v] of url.searchParams) if (ALLOWED_PARAMS.test(k)) kept.append(k, v);
  const query = kept.toString();
  return `${url.origin}${sanitizePath(url.pathname)}${query ? `?${query}` : ""}`;
}

type Props = Record<string, unknown>;

function scrubProps(props: Props | undefined): Props | undefined {
  if (!props) return props;
  const out: Props = { ...props };
  for (const key of URL_PROPERTIES) {
    const value = out[key];
    if (typeof value === "string" && value !== "$direct") out[key] = sanitizeUrl(value) ?? "[redacted]";
  }
  for (const key of PATH_PROPERTIES) {
    const value = out[key];
    if (typeof value === "string") out[key] = sanitizePath(value.split(/[?#]/)[0]!);
  }
  return out;
}

/** PostHog `before_send`: scrub URL properties on the event and on the person ($set / $set_once). */
export function scrubAnalyticsEvent<T extends { properties: Props; $set?: Props; $set_once?: Props }>(event: T): T {
  return {
    ...event,
    properties: scrubProps(event.properties) ?? {},
    ...(event.$set ? { $set: scrubProps(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: scrubProps(event.$set_once) } : {}),
  };
}
