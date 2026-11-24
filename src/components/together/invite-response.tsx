"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheckIcon, LoaderCircleIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api, apiErrorText } from "@/lib/api-client";
import type { ReceivedInviteDTO } from "@/server/together/types";
import type { IdentityModelDTO } from "@/types/domain";
import { modelDetail, PersonPicker } from "./person-picker";

export interface InviteResponseProps {
  /** The token (or share id) from the URL. */
  inviteRef: string;
  invite: ReceivedInviteDTO;
  /** The signed-in user's own models (only ready ones can be shared). */
  models: IdentityModelDTO[];
}

type Outcome = "accepted" | "declined" | null;

export function InviteResponse({ inviteRef, invite, models }: InviteResponseProps) {
  const ready = models.filter((m) => m.status === "ready");
  const [modelId, setModelId] = React.useState<string | null>(ready.length === 1 ? ready[0]!.id : null);
  const [busy, setBusy] = React.useState<"accept" | "decline" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome>(null);
  const sharedName = models.find((m) => m.id === modelId)?.name;
  const base = `/api/multi-person/invites/${encodeURIComponent(inviteRef)}`;

  async function respond(action: "accept" | "decline") {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      await api(`${base}/${action}`, { method: "POST", body: action === "accept" ? { modelId } : undefined });
      setOutcome(action === "accept" ? "accepted" : "declined");
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setBusy(null);
    }
  }

  if (outcome === "accepted") {
    return (
      <Card>
        <CardHeader className="justify-items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CircleCheckIcon className="size-6" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl" role="status">
            You&apos;re sharing {sharedName ? `“${sharedName}”` : "your model"} with {invite.from.name}
          </CardTitle>
          <CardDescription>
            You can stop sharing any time from Together → Invites. Want photos with {invite.from.name} in your own
            gallery too? Invite them back.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild variant="brand">
            <Link href="/app/together">Go to Together</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (outcome === "declined") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl" role="status">
            Invite declined
          </CardTitle>
          <CardDescription>Nothing was shared. {invite.from.name} will see that you declined.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild variant="outline">
            <Link href="/app">Go to your dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{invite.from.name} wants to take photos with you</CardTitle>
        <CardDescription>
          Invitation from <span className="font-medium text-foreground">{invite.from.name}</span> (
          <span className="break-all">{invite.from.email}</span>)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {invite.message && (
          <figure className="rounded-xl border bg-muted/40 px-4 py-3">
            <blockquote className="text-sm break-words whitespace-pre-line">{invite.message}</blockquote>
            <figcaption className="mt-1 text-xs text-muted-foreground">— {invite.from.name}</figcaption>
          </figure>
        )}

        <section aria-labelledby="consent-title" className="flex flex-col gap-2">
          <h2 id="consent-title" className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheckIcon className="size-4 text-primary" aria-hidden="true" />
            What accepting means
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              {invite.from.name} can combine the model you choose with their own models to create photos of the two of
              you together. They can&apos;t use it on its own.
            </li>
            <li>The photos are created and stored in their account, and our safety rules apply to every one.</li>
            <li>
              You can stop sharing at any time. New photos are blocked right away; photos already created stay with
              them.
            </li>
            <li>Sharing is one way: you don&apos;t get access to their model unless they accept an invite from you.</li>
          </ul>
        </section>

        <PersonPicker
          legend="Model to share"
          name="invite-model"
          options={models.map((model) => ({ model, detail: modelDetail(model), disabled: model.status !== "ready" }))}
          value={modelId}
          onValueChange={setModelId}
          empty={
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <p>You need a model of yourself first. Create one, then come back to this page to accept.</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/app/models/new">
                  <PlusIcon aria-hidden="true" />
                  Create your model
                </Link>
              </Button>
            </div>
          }
        />
        {models.length > 0 && ready.length === 0 && (
          <p className="text-sm text-muted-foreground">
            None of your models is ready yet. Finish one in{" "}
            <Link href="/app/models" className="font-medium text-foreground underline underline-offset-4">
              your models
            </Link>
            , then come back to accept.
          </p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription role="alert">{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={busy !== null}
          onClick={() => respond("decline")}
        >
          {busy === "decline" && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
          Decline
        </Button>
        <Button
          variant="brand"
          className="h-11 w-full sm:w-auto"
          disabled={busy !== null || !modelId}
          onClick={() => respond("accept")}
        >
          {busy === "accept" && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
          Accept and share
        </Button>
      </CardFooter>
    </Card>
  );
}
