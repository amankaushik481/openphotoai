"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BanIcon, CoinsIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { ActionDialog, Field } from "./action-dialog";

export interface UserActionsProps {
  userId: string;
  email: string;
  banned: boolean;
  /** Admins (and yourself) can't be suspended. */
  canSuspend: boolean;
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function UserActions({ userId, email, banned, canSuspend }: UserActionsProps) {
  const router = useRouter();
  // One key per opened dialog: a double submit or retry never applies the adjustment twice.
  const [adjustKey, setAdjustKey] = React.useState(newIdempotencyKey);
  const base = `/api/admin/users/${encodeURIComponent(userId)}`;

  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        trigger={
          <Button variant="outline" size="sm" onClick={() => setAdjustKey(newIdempotencyKey())}>
            <CoinsIcon aria-hidden="true" />
            Adjust credits
          </Button>
        }
        title="Adjust credits"
        description={`Add or remove credits for ${email}. The change and your note are recorded in their ledger.`}
        submitLabel="Apply adjustment"
        onSubmit={async (data) => {
          const delta = Number(data.get("delta"));
          const note = String(data.get("note") ?? "");
          const res = await api<{ balance: number; applied: boolean }>(`${base}/credits`, {
            method: "POST",
            body: { delta, note },
            headers: { "Idempotency-Key": adjustKey },
          });
          return res.applied
            ? `Credits ${delta > 0 ? "added" : "removed"}. New balance: ${res.balance.toLocaleString("en-US")}.`
            : "This adjustment was already applied.";
        }}
      >
        <Field id="adjust-delta" label="Credits (negative to remove)" hint="Whole credits, e.g. 50 or -20. Balances can't go below zero.">
          <Input
            id="adjust-delta"
            name="delta"
            type="number"
            inputMode="numeric"
            step={1}
            min={-1_000_000}
            max={1_000_000}
            required
            aria-describedby="adjust-delta-hint"
          />
        </Field>
        <Field id="adjust-note" label="Note (required)">
          <Textarea id="adjust-note" name="note" required maxLength={500} placeholder="e.g. Goodwill for a failed batch (ticket #123)" />
        </Field>
      </ActionDialog>

      {banned ? (
        <UnsuspendButton base={base} email={email} onDone={() => router.refresh()} />
      ) : (
        canSuspend && (
          <ActionDialog
            trigger={
              <Button variant="destructive" size="sm">
                <BanIcon aria-hidden="true" />
                Suspend
              </Button>
            }
            title={`Suspend ${email}?`}
            description="They are signed out everywhere, their share links stop working and they get an email with your reason."
            submitLabel="Suspend account"
            destructive
            onSubmit={async (data) => {
              const res = await api<{ suspended: boolean; sessionsDeleted: number; shareLinksRevoked: number }>(`${base}/suspend`, {
                method: "POST",
                body: { reason: String(data.get("reason") ?? "") },
              });
              return res.suspended
                ? `Account suspended (${res.sessionsDeleted} session(s) ended, ${res.shareLinksRevoked} share link(s) revoked).`
                : "This account was already suspended.";
            }}
          >
            <Field id="suspend-reason" label="Reason (sent to the user)" hint="Be specific; this text is included in the email.">
              <Textarea
                id="suspend-reason"
                name="reason"
                required
                minLength={3}
                maxLength={500}
                aria-describedby="suspend-reason-hint"
              />
            </Field>
          </ActionDialog>
        )
      )}
    </div>
  );
}

function UnsuspendButton({ base, email, onDone }: { base: string; email: string; onDone: () => void }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          <ShieldCheckIcon aria-hidden="true" />
          Lift suspension
        </Button>
      }
      title={`Lift the suspension of ${email}?`}
      description="They can sign in again. Share links revoked by the suspension stay revoked."
      confirmLabel="Lift suspension"
      onConfirm={async () => {
        await api(`${base}/unsuspend`, { method: "POST" });
        toast.success("Suspension lifted.");
        onDone();
      }}
    />
  );
}
