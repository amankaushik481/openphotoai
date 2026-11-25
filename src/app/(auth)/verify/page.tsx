import { ArrowRight, CircleCheck, KeyRound, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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

function StatusCard({
  tone,
  icon,
  title,
  description,
  children,
}: {
  tone: "warning" | "success";
  icon: ReactNode;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="justify-items-center text-center">
        <div
          className={
            tone === "warning"
              ? "mb-2 flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning [&_svg]:size-6"
              : "mb-2 flex size-12 items-center justify-center rounded-full bg-success/10 text-success [&_svg]:size-6"
          }
        >
          {icon}
        </div>
        <CardTitle as="h1" className="text-xl">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className="flex-col gap-2">{children}</CardFooter>
    </Card>
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
      <StatusCard
        tone="warning"
        icon={<TriangleAlert aria-hidden />}
        title="This link is incomplete"
        description="Part of the link may have been cut off. Open it straight from the email (don't copy part of it), or request a new one."
      >
        <Button asChild variant="brand" size="lg" className="w-full">
          <Link href={newLinkHref}>Request a new link</Link>
        </Button>
      </StatusCard>
    );
  }

  // Show which account the link signs into, so a link someone else requested (login CSRF) is obvious.
  const email = await pendingMagicLinkEmail(token);
  if (!email) {
    // Links are single-use: the most common way here is clicking the same email twice.
    if (user && !user.banned) {
      return (
        <StatusCard
          tone="success"
          icon={<CircleCheck aria-hidden />}
          title="You're already signed in"
          description={
            <>
              This link was already used, but you&apos;re signed in as{" "}
              <strong className="font-medium break-all text-foreground">{user.email}</strong>.
            </>
          }
        >
          <Button asChild variant="brand" size="lg" className="w-full">
            <Link href={next}>
              Continue to {APP.name}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </StatusCard>
      );
    }
    return (
      <StatusCard
        tone="warning"
        icon={<TriangleAlert aria-hidden />}
        title="This link has expired or was already used"
        description="Sign-in links work once and expire after 15 minutes. If you asked for several, only the newest one works."
      >
        <Button asChild variant="brand" size="lg" className="w-full">
          <Link href={newLinkHref}>Request a new link</Link>
        </Button>
      </StatusCard>
    );
  }

  const href = magicLinkVerifyApiPath({
    token,
    callbackURL: next,
    errorCallbackURL: safeLoginPath(firstParam(params.errorCallbackURL)),
  });
  const switching = user && user.email.toLowerCase() !== email.toLowerCase() ? user.email : null;

  return (
    <Card>
      <CardHeader className="justify-items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
          <KeyRound className="size-6" aria-hidden />
        </div>
        <CardTitle as="h1" className="text-xl">
          Confirm sign-in
        </CardTitle>
        <CardDescription>
          Continue to sign in to {APP.name} on this device as{" "}
          <strong className="font-medium break-all text-foreground" data-testid="verify-email">
            {email}
          </strong>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {switching && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-center text-sm text-muted-foreground">
            You&apos;re signed in as <span className="font-medium break-all text-foreground">{switching}</span>.
            Continuing switches to the account above.
          </p>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Not your email address? Don&apos;t continue: someone may be trying to sign you into their account.
        </p>
        <Button asChild variant="brand" size="lg" className="w-full">
          {/* Plain anchor: the API route sets the session cookie and redirects. */}
          <a href={href} rel="nofollow">
            Sign in to {APP.name}
          </a>
        </Button>
      </CardContent>
      <CardFooter>
        <p className="w-full text-center text-xs text-muted-foreground">
          Links work once and expire after 15 minutes.{" "}
          <Link href={newLinkHref} className="underline underline-offset-2 hover:text-foreground">
            Request a new link
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
