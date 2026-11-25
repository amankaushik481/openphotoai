"use client";

import {
  CoinsIcon,
  Loader2Icon,
  MailIcon,
  MoreHorizontalIcon,
  SendIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserMinusIcon,
} from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalDate } from "@/components/billing/local-date";
import { api } from "@/lib/api-client";
import type { TeamDetailDTO, TeamMemberDTO } from "@/server/teams/types";
import { apiErrorText, initials, ROLE_LABELS } from "./team-ui";

export interface MembersCardProps {
  detail: TeamDetailDTO;
  /** Re-fetch the team after a change. */
  onChanged: () => Promise<unknown>;
  onGiveCredits: (userId: string) => void;
}

export function MembersCard({ detail, onChanged, onGiveCredits }: MembersCardProps) {
  const { team, me, members } = detail;
  const [removing, setRemoving] = useState<TeamMemberDTO | null>(null);
  const [roleChange, setRoleChange] = useState<{ member: TeamMemberDTO; role: "admin" | "member" } | null>(null);
  const seatsFull = team.seatsUsed >= team.seats;
  // Rendered on the server too: compare against a fixed "now" so both renders agree.
  const [now] = useState(() => Date.now());

  async function invite(email: string): Promise<boolean> {
    try {
      const { resent } = await api<{ resent: boolean }>(`/api/teams/${encodeURIComponent(team.id)}/invites`, {
        method: "POST",
        body: { email },
      });
      toast.success(resent ? `Sent a fresh invite link to ${email}.` : `Invited ${email}.`);
      await onChanged();
      return true;
    } catch (err) {
      toast.error(apiErrorText(err));
      return false;
    }
  }

  async function setRole(member: TeamMemberDTO, role: "admin" | "member") {
    await api(memberPath(team.id, member.id), { method: "PATCH", body: { role } });
    toast.success(`${label(member)} is now ${role === "admin" ? "an admin" : "a member"}.`);
    await onChanged();
  }

  async function remove(member: TeamMemberDTO) {
    await api(memberPath(team.id, member.id), { method: "DELETE" });
    toast.success(member.status === "invited" ? `Revoked the invite for ${member.email}.` : `Removed ${label(member)}.`);
    await onChanged();
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Members</CardTitle>
        <CardDescription>
          {me.canManage
            ? `${team.seatsUsed} of ${team.seats} seats used. Seats come with the owner's plan; pending and expired invites hold a seat until they're accepted or revoked.`
            : `${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}.`}
        </CardDescription>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Owner</span>: billing, roles, credits and deleting the team ·{" "}
          <span className="font-medium text-foreground">Admins</span>: invite and remove members, edit brand kits ·{" "}
          <span className="font-medium text-foreground">Members</span>: use the brand kits.
        </p>
      </CardHeader>

      {me.canManage && (
        <CardContent className="border-b py-5">
          <InviteForm onInvite={invite} disabled={seatsFull} seats={team.seats} />
        </CardContent>
      )}

      <ul className="divide-y" aria-label="Team members">
        {members.map((m) => {
          const isMe = m.id === me.memberId;
          const canRemove =
            m.role !== "owner" && !isMe && (me.isOwner || (me.role === "admin" && m.role === "member"));
          const canPromote = me.isOwner && m.role !== "owner";
          const canGive = me.isOwner && m.status === "active" && m.role !== "owner" && m.userId;
          const canResend = me.canManage && m.status === "invited";
          const expired = m.status === "invited" && m.expiresAt !== null && Date.parse(m.expiresAt) <= now;
          const hasActions = canRemove || canPromote || canGive || canResend;
          return (
            <li key={m.id} className="flex items-center gap-3 px-6 py-3">
              <Avatar className="size-9">
                {m.image && <AvatarImage src={m.image} alt="" />}
                <AvatarFallback className="bg-brand-soft text-xs text-brand-soft-foreground">
                  {m.status === "invited" ? <MailIcon aria-hidden="true" className="size-4" /> : initials(m.name || m.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name || m.email}
                  {isMe && <span className="text-muted-foreground"> (you)</span>}
                </p>
                {m.name && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                {m.status === "invited" && me.canManage && (
                  <p className="text-xs text-muted-foreground">
                    {expired ? (
                      <>
                        Link expired <LocalDate iso={m.expiresAt} /> · resend to renew it
                      </>
                    ) : (
                      <>
                        Invited <LocalDate iso={m.createdAt} /> · link works until <LocalDate iso={m.expiresAt} />
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {m.status === "invited" ? (
                  expired ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )
                ) : (
                  <Badge variant={m.role === "member" ? "outline" : "soft"}>{ROLE_LABELS[m.role]}</Badge>
                )}
                {hasActions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label(m)}`}>
                        <MoreHorizontalIcon aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canGive && (
                        <DropdownMenuItem onSelect={() => onGiveCredits(m.userId!)}>
                          <CoinsIcon aria-hidden="true" />
                          Give credits
                        </DropdownMenuItem>
                      )}
                      {canResend && (
                        <DropdownMenuItem onSelect={() => void invite(m.email)}>
                          <SendIcon aria-hidden="true" />
                          {expired ? "Send a new link" : "Resend invite"}
                        </DropdownMenuItem>
                      )}
                      {canPromote &&
                        (m.role === "admin" ? (
                          <DropdownMenuItem onSelect={() => setRoleChange({ member: m, role: "member" })}>
                            <ShieldIcon aria-hidden="true" />
                            Make member
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => setRoleChange({ member: m, role: "admin" })}>
                            <ShieldCheckIcon aria-hidden="true" />
                            Make admin
                          </DropdownMenuItem>
                        ))}
                      {canRemove && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(m)}>
                            <UserMinusIcon aria-hidden="true" />
                            {m.status === "invited" ? "Revoke invite" : "Remove"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.status === "invited" ? `Revoke the invite for ${removing.email}?` : `Remove ${removing ? label(removing) : ""}?`}
        description={
          removing?.status === "invited"
            ? "The link in their email stops working right away and the seat is freed."
            : "They lose access to the team's brand kits right away and the seat is freed. Their own photos, models and credits (including credits you sent them) stay with them."
        }
        confirmLabel={removing?.status === "invited" ? "Revoke invite" : "Remove"}
        destructive
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />

      <ConfirmDialog
        open={roleChange !== null}
        onOpenChange={(open) => !open && setRoleChange(null)}
        title={
          roleChange
            ? roleChange.role === "admin"
              ? `Make ${label(roleChange.member)} an admin?`
              : `Make ${label(roleChange.member)} a member?`
            : ""
        }
        description={
          roleChange?.role === "admin"
            ? "Admins can invite and remove members and create, edit or delete brand kits. Only you can change roles, send credits or delete the team."
            : "They keep using the team's brand kits but can no longer invite people or edit kits."
        }
        confirmLabel={roleChange?.role === "admin" ? "Make admin" : "Make member"}
        onConfirm={() => (roleChange ? setRole(roleChange.member, roleChange.role) : undefined)}
      />
    </Card>
  );
}

function InviteForm({
  onInvite,
  disabled,
  seats,
}: {
  onInvite: (email: string) => Promise<boolean>;
  disabled: boolean;
  seats: number;
}) {
  const emailId = useId();
  const hintId = useId();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    if (await onInvite(email.trim())) setEmail("");
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <Label htmlFor={emailId}>Invite by email</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          required
          disabled={disabled}
          aria-describedby={hintId}
          className="h-10 flex-1"
        />
        <Button type="submit" variant="brand" className="h-10" disabled={disabled || pending || !email.trim()}>
          {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
          Send invite
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {seats === 0
          ? "The owner's plan no longer includes teams. Upgrade to Studio to invite people."
          : disabled
            ? `All ${seats} seats are taken. Remove a member or revoke an invite first.`
            : "They'll get an email with a join link. They need to sign in with that same address."}
      </p>
    </form>
  );
}

function label(m: TeamMemberDTO): string {
  return m.name || m.email;
}

function memberPath(teamId: string, memberId: string): string {
  return `/api/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`;
}
