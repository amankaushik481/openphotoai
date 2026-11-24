import { KeyRound, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { magicLinkVerifyApiPath, pendingMagicLinkEmail } from "@/server/auth/magic-link";
import { firstParam, safeLoginPath, safeNextPath } from "@/server/auth/redirect";

export const metadata: Metadata = {
  title: "Confirm sign-in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Landing page for emailed magic links. The token is only consumed when the user
 * clicks, so email security scanners that prefetch links can't burn it.
 */
export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = firstParam(params.token);

  if (!token) {
    return (
      <Card>
        <CardHeader className="justify-items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning">
            <TriangleAlert className="size-6" aria-hidden />
          </div>
          <CardTitle as="h1" className="text-xl">
            This link is incomplete
          </CardTitle>
          <CardDescription>Copy the whole link from the email, or request a new one.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="brand" size="lg" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Show which account the link signs into, so a link someone else requested (login CSRF) is obvious.
  const email = await pendingMagicLinkEmail(token);
  if (!email) {
    return (
      <Card>
        <CardHeader className="justify-items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning">
            <TriangleAlert className="size-6" aria-hidden />
          </div>
          <CardTitle as="h1" className="text-xl">
            This link has expired
          </CardTitle>
          <CardDescription>Sign-in links work once and expire after 15 minutes. Request a new one.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="brand" size="lg" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const href = magicLinkVerifyApiPath({
    token,
    callbackURL: safeNextPath(firstParam(params.callbackURL)),
    errorCallbackURL: safeLoginPath(firstParam(params.errorCallbackURL)),
  });

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
          <Link href="/login" className="underline underline-offset-2 hover:text-foreground">
            Request a new link
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
