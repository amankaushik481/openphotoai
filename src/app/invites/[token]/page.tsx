import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { PrintSheet, type StripMark } from "@/components/auth/print-sheet";
import { SheetKicker, SheetTitle } from "@/components/auth/sheet-heading";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { InviteResponse } from "@/components/together/invite-response";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/server/auth/session";
import { getInvitePreview, listOwnModels } from "@/server/together";
import type { ReceivedInviteDTO } from "@/server/together/types";

export const metadata: Metadata = {
  title: "Together photos invitation",
  robots: { index: false, follow: false },
  // The URL carries a secret token: never leak it to other sites.
  referrer: "no-referrer",
};

/** An invite that can't be answered here: status line, title, why, and where to go instead. */
function Notice({
  kicker,
  tone = "muted",
  mark = "none",
  title,
  description,
  children,
}: {
  kicker: string;
  tone?: "muted" | "warning";
  mark?: StripMark;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <PrintSheet frame="02" mark={mark} caption="Together · invitation">
      <SheetKicker tone={tone}>{kicker}</SheetKicker>
      <SheetTitle>{title}</SheetTitle>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-6 flex flex-col gap-2 sm:flex-row">{children}</div>}
    </PrintSheet>
  );
}

function closedCopy(invite: ReceivedInviteDTO): { title: string; description: string } {
  switch (invite.status) {
    case "accepted":
      return {
        title: "You already accepted",
        description: invite.model
          ? `You're sharing “${invite.model.name}” with ${invite.from.name}. You can stop sharing from Together → Invites.`
          : `You accepted ${invite.from.name}'s invite.`,
      };
    case "declined":
      return {
        title: "You declined this invite",
        description: `Ask ${invite.from.name} for a new one if you changed your mind.`,
      };
    case "revoked":
      return {
        title: "This invite is no longer active",
        description: `${invite.from.name} withdrew it, or sharing was stopped.`,
      };
    default:
      return { title: "This invite has expired", description: `Ask ${invite.from.name} to send you a new one.` };
  }
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = `/invites/${encodeURIComponent(token)}`;
  const user = await requireUserPage(path);
  const preview = await getInvitePreview(user, token);

  if (preview.state === "pending") {
    const models = await listOwnModels(user.id);
    return (
      <AuthShell width="lg" label="Together · invitation">
        <InviteResponse inviteRef={token} invite={preview.invite} models={models} />
      </AuthShell>
    );
  }

  return (
    <AuthShell label="Together · invitation">
      {preview.state === "not_found" && (
        <Notice
          kicker="Link not on file"
          tone="warning"
          mark="reject"
          title="This invite link doesn't work"
          description="It may have been replaced by a newer invite (only the latest link works) or withdrawn. Ask the person who invited you to send it again."
        >
          <Button asChild variant="outline">
            <Link href="/app">Go to your dashboard</Link>
          </Button>
        </Notice>
      )}
      {preview.state === "wrong_account" && (
        <Notice
          kicker="Wrong account"
          tone="warning"
          title="This invite is for someone else"
          description={`It was sent to ${preview.invitedEmail}, but you're signed in as ${user.email}. Sign in with the invited address to respond.`}
        >
          <SignOutButton variant="brand" redirectTo={`/login?next=${encodeURIComponent(path)}`}>
            Switch account
          </SignOutButton>
        </Notice>
      )}
      {preview.state === "unverified" && (
        <Notice
          kicker="Email not verified"
          tone="warning"
          title="Verify your email first"
          description={`Sign in with a link sent to ${user.email} to confirm the address, then open this invite again.`}
        >
          <SignOutButton variant="brand" redirectTo={`/login?next=${encodeURIComponent(path)}`}>
            Sign in again
          </SignOutButton>
        </Notice>
      )}
      {preview.state === "own_invite" && (
        <Notice
          kicker="Your invitation"
          mark="keep"
          title="This is your own invite"
          description={`Only ${preview.inviteeEmail} can accept it. You'll see their model under Together once they do.`}
        >
          <Button asChild variant="brand">
            <Link href="/app/together">Go to Together</Link>
          </Button>
        </Notice>
      )}
      {preview.state === "closed" && (
        <Notice kicker="Invite closed" {...closedCopy(preview.invite)}>
          <Button asChild variant="outline">
            <Link href="/app/together">Go to Together</Link>
          </Button>
        </Notice>
      )}
    </AuthShell>
  );
}
