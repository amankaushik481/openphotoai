import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { PrintSheet } from "@/components/auth/print-sheet";
import { SheetKicker, SheetTitle } from "@/components/auth/sheet-heading";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account suspended", robots: { index: false } };

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Pre-filled appeal email, so support can find the account straight away. */
function appealMailto(email: string | null): string {
  const subject = encodeURIComponent(`Account suspension review${email ? ` (${email})` : ""}`);
  const body = encodeURIComponent(
    `Hi, my ${APP.name} account${email ? ` (${email})` : ""} was suspended and I think it's a mistake.\n\nWhat happened:\n`,
  );
  return `mailto:${APP.supportEmail}?subject=${subject}&body=${body}`;
}

export default async function SuspendedPage() {
  const user = await getCurrentUser();
  // Not (or no longer) suspended: an expired ban is cleared on sign-in, so don't tell them they're blocked.
  if (user && !user.banned) redirect("/app");
  const suspended = user?.banned ? user : null;
  const mailto = appealMailto(suspended?.email ?? null);

  return (
    <AuthShell label="Lab notice">
      {/* A lab notice rather than a print: no film strip, just the paper and the stamp. */}
      <PrintSheet strip={false} frame="00" caption="Lab notice · appeals by email">
        <div className="flex items-start justify-between gap-4">
          <SheetKicker tone="destructive">Account on hold</SheetKicker>
          <span
            aria-hidden="true"
            className="-mt-1 shrink-0 -rotate-6 rounded-[2px] border-2 border-destructive px-2 py-0.5 font-mono text-[11px] tracking-[0.16em] text-destructive"
          >
            HOLD
          </span>
        </div>
        <SheetTitle>Your account is suspended</SheetTitle>
        <p className="mt-3 text-sm text-muted-foreground">
          While suspended you can&apos;t sign in, generate photos or use the API. Your photos and models are not shared
          with anyone.
        </p>
        <div className="mt-5 grid gap-3 text-sm">
          {suspended?.banReason && (
            <p className="border-l-2 border-foreground py-1 pl-3">
              <span className="mono-caps mr-2 text-muted-foreground">Reason:</span>
              {suspended.banReason}
            </p>
          )}
          {suspended?.banExpires && (
            <p className="font-mono text-xs text-muted-foreground">
              The suspension ends on {formatDate(suspended.banExpires)} (UTC).
            </p>
          )}
          <p className="text-muted-foreground">
            If you think this is a mistake, email{" "}
            <a
              href={mailto}
              className="font-medium break-words text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-safelight-ink"
            >
              {APP.supportEmail}
            </a>{" "}
            from the address on your account and we&apos;ll take a look.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:justify-between">
          <Button asChild variant="ghost" className="w-full rounded-[3px] sm:-ml-3 sm:w-auto">
            <Link href="/">Back to home</Link>
          </Button>
          {user ? (
            <SignOutButton variant="outline" className="w-full rounded-[3px] sm:w-auto" />
          ) : (
            <Button asChild variant="outline" className="w-full rounded-[3px] sm:w-auto">
              <a href={mailto}>Contact support</a>
            </Button>
          )}
        </div>
      </PrintSheet>
    </AuthShell>
  );
}
