"use client";

import * as React from "react";
import Link from "next/link";
import { InboxIcon, SendIcon } from "lucide-react";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import type { InviteListDTO, ReceivedInviteDTO, SentInviteDTO } from "@/server/together/types";
import type { InviteStatus } from "@/types/domain";
import { formatDate, INVITE_STATUS_LABEL, INVITE_STATUS_VARIANT } from "./format";

export interface InvitesPanelProps {
  invites: InviteListDTO;
  onChanged: () => void;
}

function StatusBadge({ status }: { status: InviteStatus }) {
  return <Badge variant={INVITE_STATUS_VARIANT[status]}>{INVITE_STATUS_LABEL[status]}</Badge>;
}

async function revoke(id: string) {
  // Errors are shown by ConfirmDialog (it keeps the dialog open and toasts the message).
  await api(`/api/multi-person/shares/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function InvitesPanel({ invites, onChanged }: InvitesPanelProps) {
  const waiting = invites.received.filter((r) => r.status === "pending").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invites</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={waiting > 0 ? "received" : "sent"} className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="sent" className="flex-1">
              Sent
            </TabsTrigger>
            <TabsTrigger value="received" className="flex-1">
              Received
              {waiting > 0 && (
                <Badge variant="brand" className="ml-1 px-1.5 py-0 text-[10px]" aria-label={`${waiting} waiting`}>
                  {waiting}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sent">
            {invites.sent.length === 0 ? (
              <EmptyList icon={<SendIcon />} text="Invites you send appear here." />
            ) : (
              <ul className="flex flex-col divide-y">
                {invites.sent.map((invite) => (
                  <SentItem key={invite.id} invite={invite} onChanged={onChanged} />
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="received">
            {invites.received.length === 0 ? (
              <EmptyList icon={<InboxIcon />} text="When someone invites you, it shows up here." />
            ) : (
              <ul className="flex flex-col divide-y">
                {invites.received.map((invite) => (
                  <ReceivedItem key={invite.id} invite={invite} onChanged={onChanged} />
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function EmptyList({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      {text}
    </p>
  );
}

function SentItem({ invite, onChanged }: { invite: SentInviteDTO; onChanged: () => void }) {
  const canRevoke = invite.status === "pending" || invite.status === "accepted";
  const detail =
    invite.status === "accepted" && invite.partner
      ? invite.partner.modelName
        ? `${invite.partner.name} shared “${invite.partner.modelName}”`
        : `${invite.partner.name} accepted`
      : invite.status === "pending"
        ? `Expires ${formatDate(invite.expiresAt)}`
        : `Sent ${formatDate(invite.createdAt)}`;

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{invite.inviteeEmail}</span>
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        </div>
        <StatusBadge status={invite.status} />
      </div>
      {canRevoke && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
              {invite.status === "pending" ? "Withdraw invite" : "Stop using their model"}
            </Button>
          }
          title={invite.status === "pending" ? "Withdraw this invite?" : "Stop using their model?"}
          description={
            invite.status === "pending"
              ? "The link in their email stops working. You can invite them again later."
              : "You won't be able to create new photos with their model. Photos you already made stay in your gallery."
          }
          confirmLabel={invite.status === "pending" ? "Withdraw" : "Stop"}
          destructive
          onConfirm={async () => {
            await revoke(invite.id);
            onChanged();
          }}
        />
      )}
    </li>
  );
}

function ReceivedItem({ invite, onChanged }: { invite: ReceivedInviteDTO; onChanged: () => void }) {
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{invite.from.name}</span>
          <span className="truncate text-xs text-muted-foreground">{invite.from.email}</span>
        </div>
        <StatusBadge status={invite.status} />
      </div>
      {invite.message && invite.status === "pending" && (
        <blockquote className="border-l-2 border-primary/40 pl-3 text-sm break-words text-muted-foreground">
          {invite.message}
        </blockquote>
      )}
      {invite.status === "accepted" && invite.model && (
        <p className="text-xs text-muted-foreground">You share “{invite.model.name}”.</p>
      )}
      {invite.status === "pending" && (
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link href={`/invites/${encodeURIComponent(invite.id)}`}>Respond</Link>
        </Button>
      )}
      {invite.status === "accepted" && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
              Stop sharing
            </Button>
          }
          title="Stop sharing your model?"
          description={`${invite.from.name} won't be able to create new photos with your model. Photos they already made stay in their gallery.`}
          confirmLabel="Stop sharing"
          destructive
          onConfirm={async () => {
            await revoke(invite.id);
            onChanged();
          }}
        />
      )}
    </li>
  );
}
