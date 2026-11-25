import { MailIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/settings/editorial-card";
import { CreateTeamForm } from "./create-team-form";

const FEATURES = [
  {
    title: "Brand kits",
    body: "Save your background, outfit, style, lighting and aspect ratio once. Every teammate's headshots match.",
  },
  {
    title: "Invite your team",
    body: "Send email invites. Each person trains their own private model — nobody sees anyone else's selfies.",
  },
  {
    title: "Share credits",
    body: "Give credits from your balance to teammates so they can shoot without buying their own.",
  },
] as const;

export interface TeamOnboardingProps {
  /** The user's plan includes team seats. */
  canCreate: boolean;
  planName: string;
  seats: number;
}

/** Shown on /app/team when the user isn't on any team yet. */
export function TeamOnboarding({ canCreate, planName, seats }: TeamOnboardingProps) {
  return (
    <div className="grid gap-6">
      {/* An editorial index, not cards: numbered columns on hairlines. */}
      <ol className="grid border-t border-foreground/80 sm:grid-cols-3">
        {FEATURES.map(({ title, body }, i) => (
          <li
            key={title}
            className="flex flex-col gap-2 border-b border-foreground/15 py-5 sm:border-b-0 sm:px-5 sm:first:pl-0 sm:last:pr-0 sm:[&+li]:border-l"
          >
            <span aria-hidden="true" className="mono-caps text-safelight-ink">
              No. {String(i + 1).padStart(2, "0")}
            </span>
            <h2 className="font-display text-2xl leading-none tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>

      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Create your team</CardTitle>
            <CardDescription>
              Your {planName} plan includes {seats} seats (you count as one). You can rename the team later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateTeamForm />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-t-2 border-safelight-ink">
          <CardHeader>
            <p className="mono-caps text-safelight-ink">Studio plan</p>
            <CardTitle>Teams and brand kits are part of Studio</CardTitle>
            <CardDescription>
              You&apos;re on the {planName} plan. Upgrade to Studio to create a team with up to 25 seats, shared brand
              kits and credit transfers.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-col gap-2 sm:flex-row">
            <Button asChild variant="brand" className="w-full sm:w-auto">
              <Link href="/app/billing">Upgrade to Studio</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full sm:w-auto">
              <Link href="/pricing">Compare plans</Link>
            </Button>
          </CardFooter>
        </Card>
      )}

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MailIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Invited to someone else&apos;s team? Open the link in your invite email while signed in with that address — no
        Studio plan needed to join.
      </p>
    </div>
  );
}
