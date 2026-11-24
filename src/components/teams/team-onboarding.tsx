import { CoinsIcon, MailIcon, PaletteIcon, SparklesIcon, UsersIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateTeamForm } from "./create-team-form";

const FEATURES = [
  {
    icon: PaletteIcon,
    title: "Brand kits",
    body: "Save your background, outfit, style, lighting and aspect ratio once. Every teammate's headshots match.",
  },
  {
    icon: UsersIcon,
    title: "Invite your team",
    body: "Send email invites. Each person trains their own private model — nobody sees anyone else's selfies.",
  },
  {
    icon: CoinsIcon,
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
      <ul className="grid gap-3 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
              <Icon aria-hidden="true" className="size-4" />
            </div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>

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
        <Card className="border-primary/25 bg-brand-soft/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon aria-hidden="true" className="size-4 text-primary" />
              Teams and brand kits are part of Studio
            </CardTitle>
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
