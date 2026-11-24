"use client";

import * as React from "react";
import { LoaderCircleIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorText } from "@/lib/api-client";
import type { SentInviteDTO } from "@/server/together/types";

const MAX_MESSAGE = 500;

export interface InviteFriendCardProps {
  id?: string;
  onInvited: () => void;
}

export function InviteFriendCard({ id, onInvited }: InviteFriendCardProps) {
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ invite: SentInviteDTO; resent: boolean; emailSent: boolean }>(
        "/api/multi-person/invites",
        {
          method: "POST",
          body: { email: email.trim(), message: message.trim() || undefined },
        },
      );
      if (!res.emailSent) {
        toast.warning("The invite was saved but the email didn't go out. Try sending it again in a minute.");
      } else {
        toast.success(
          res.resent
            ? `Invite sent again to ${res.invite.inviteeEmail}.`
            : `Invite sent to ${res.invite.inviteeEmail}.`,
        );
      }
      setEmail("");
      setMessage("");
      onInvited();
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Invite a friend</CardTitle>
        <CardDescription>
          They choose one of their own models to share with you. Nothing is shared until they accept, and either of you
          can stop at any time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={sending}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="together-invite-email">Their email</Label>
            <Input
              id="together-invite-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "together-invite-error" : undefined}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="together-invite-message">
              Message <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="together-invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE}
              rows={3}
              placeholder="Want to make some photos for our trip album?"
              aria-describedby="together-invite-message-count"
            />
            <p id="together-invite-message-count" className="self-end text-xs text-muted-foreground tabular-nums">
              {message.length}/{MAX_MESSAGE}
            </p>
          </div>
          {error && (
            <p id="together-invite-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={sending || !email.trim()} className="h-11">
            {sending ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            ) : (
              <SendIcon aria-hidden="true" />
            )}
            Send invite
          </Button>
        </form>
        <ol className="mt-5 flex list-decimal flex-col gap-1.5 pl-5 text-xs text-muted-foreground marker:text-primary">
          <li>They get an email with a private link (valid 14 days).</li>
          <li>They sign in with that email, pick one of their models and accept.</li>
          <li>Their model shows up under &ldquo;With&rdquo; so you can create photos together.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
