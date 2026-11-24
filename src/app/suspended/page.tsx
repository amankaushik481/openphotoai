import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { APP } from "@/config/app";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account suspended", robots: { index: false } };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function SuspendedPage() {
  const user = await getCurrentUser();
  const suspended = user?.banned ? user : null;

  return (
    <AuthShell>
      <Card>
        <CardHeader className="justify-items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" aria-hidden />
          </div>
          <CardTitle className="text-xl">Your account is suspended</CardTitle>
          <CardDescription>
            While suspended you can&apos;t sign in, generate photos or use the API. Your photos and models are not
            shared with anyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {suspended?.banReason && (
            <p className="rounded-lg border bg-muted/40 px-3 py-2">
              <span className="font-medium">Reason:</span> {suspended.banReason}
            </p>
          )}
          {suspended?.banExpires && (
            <p className="text-muted-foreground">The suspension ends on {formatDate(suspended.banExpires)} (UTC).</p>
          )}
          <p className="text-muted-foreground">
            If you think this is a mistake, email{" "}
            <a href={`mailto:${APP.supportEmail}`} className="font-medium text-foreground underline underline-offset-2">
              {APP.supportEmail}
            </a>{" "}
            from the address on your account and we&apos;ll take a look.
          </p>
        </CardContent>
        <CardFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button asChild variant="ghost" className="w-full sm:w-auto">
            <Link href="/">Back to home</Link>
          </Button>
          {user ? (
            <SignOutButton variant="outline" className="w-full sm:w-auto" />
          ) : (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a href={`mailto:${APP.supportEmail}`}>Contact support</a>
            </Button>
          )}
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
