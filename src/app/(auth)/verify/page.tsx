import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PrintSheet } from "@/components/auth/print-sheet";
import { SheetKicker, SheetTitle } from "@/components/auth/sheet-heading";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { magicLinkVerifyApiPath, pendingMagicLinkEmail } from "@/server/auth/magic-link";
import { firstParam, loginPathFor, safeLoginPath, safeNextPath } from "@/server/auth/redirect";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Confirm sign-in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A plain notice on the print sheet: status line, title, explanation, the way forward. */
function StatusSheet({
  tone,
  kicker,
  title,
  description,
  children,
}: {
  tone: "warning" | "success";
  kicker: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <PrintSheet frame="02" caption="Sign-in link" mark={tone === "warning" ? "reject" : "keep"}>
      <SheetKicker tone={tone}>{kicker}</SheetKicker>
      <SheetTitle>{title}</SheetTitle>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-col gap-2">{children}</div>
    </PrintSheet>
  );
}

/**
 * Landing page for emailed magic links. The token is only consumed when the user
 * clicks, so email security scanners that prefetch links can't burn it.
 */
export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = firstParam(params.token);
  const next = safeNextPath(firstParam(params.callbackURL));
  // "Request a new link" keeps the destination (e.g. the pack the user was about to open).
  const newLinkHref = loginPathFor(next);
  const user = await getCurrentUser();

  if (!token) {
    return (
      <StatusSheet
        tone="warning"
        kicker="Link cut short"
        title="This link is incomplete"
        description="Part of the link may have been cut off. Open it straight from the email (don't copy part of it), or request a new one."
      >
        <Button asChild variant="brand" size="lg" className="w-full rounded-[3px]">
          <Link href={newLinkHref}>Request a new link</Link>
        </Button>
      </StatusSheet>
    );
  }

  // Show which account the link signs into, so a link someone else requested (login CSRF) is obvious.
  const email = await pendingMagicLinkEmail(token);
  if (!email) {
    // Links are single-use: the most common way here is clicking the same email twice.
    if (user && !user.banned) {
      return (
        <StatusSheet
          tone="success"
          kicker="Signed in"
          title="You're already signed in"
          description={
            <>
              This link was already used, but you&apos;re signed in as{" "}
              <strong className="font-medium break-all text-foreground">{user.email}</strong>.
            </>
          }
        >
          <Button asChild variant="brand" size="lg" className="w-full rounded-[3px]">
            <Link href={next}>
              Continue to {APP.name}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </StatusSheet>
      );
    }
    return (
      <StatusSheet
        tone="warning"
        kicker="Link used up"
        title="This link has expired or was already used"
        description="Sign-in links work once and expire after 15 minutes. If you asked for several, only the newest one works."
      >
        <Button asChild variant="brand" size="lg" className="w-full rounded-[3px]">
          <Link href={newLinkHref}>Request a new link</Link>
        </Button>
      </StatusSheet>
    );
  }

  const href = magicLinkVerifyApiPath({
    token,
    callbackURL: next,
    errorCallbackURL: safeLoginPath(firstParam(params.errorCallbackURL)),
  });
  const switching = user && user.email.toLowerCase() !== email.toLowerCase() ? user.email : null;

  return (
    <PrintSheet frame="02" caption="Sign-in link · one click">
      <SheetKicker tone="safelight">One more click</SheetKicker>
      <SheetTitle>Confirm sign-in</SheetTitle>
      <p className="mt-3 text-sm text-muted-foreground">
        Continue to sign in to {APP.name} on this device as{" "}
        <strong className="font-medium break-all text-foreground" data-testid="verify-email">
          {email}
        </strong>
        .
      </p>
      <div className="mt-6 grid gap-3">
        {switching && (
          <p className="border-l-2 border-foreground py-1 pl-3 text-sm text-muted-foreground">
            You&apos;re signed in as <span className="font-medium break-all text-foreground">{switching}</span>.
            Continuing switches to the account above.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Not your email address? Don&apos;t continue: someone may be trying to sign you into their account.
        </p>
        <Button asChild variant="brand" size="lg" className="w-full rounded-[3px]">
          {/* Plain anchor: the API route sets the session cookie and redirects. */}
          <a href={href} rel="nofollow">
            Sign in to {APP.name}
          </a>
        </Button>
      </div>
      <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
        Links work once and expire after 15 minutes.{" "}
        <Link
          href={newLinkHref}
          className="underline decoration-foreground/30 underline-offset-2 hover:text-foreground hover:decoration-safelight-ink"
        >
          Request a new link
        </Link>
      </p>
    </PrintSheet>
  );
}
