"use client";

import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import type { CreditTransferResult, TeamMemberDTO } from "@/server/teams/types";
import { apiErrorText } from "./team-ui";

export interface CreditTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  teamName: string;
  /** Active members who can receive credits (the owner excluded). */
  recipients: TeamMemberDTO[];
  /** Preselected recipient user id. */
  initialUserId?: string | null;
}

export function CreditTransferDialog({ open, onOpenChange, ...rest }: CreditTransferDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <TransferForm key={rest.initialUserId ?? "any"} {...rest} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({
  teamId,
  teamName,
  recipients,
  initialUserId,
  onDone,
}: Omit<CreditTransferDialogProps, "open" | "onOpenChange"> & { onDone: () => void }) {
  const memberId = useId();
  const amountId = useId();
  const hintId = useId();
  const { user: me, mutate: mutateMe } = useMe();
  const [recipient, setRecipient] = useState<string | undefined>(
    initialUserId ?? (recipients.length === 1 ? recipients[0]!.userId ?? undefined : undefined),
  );
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);

  const credits = Number(amount);
  const validAmount = Number.isInteger(credits) && credits > 0;
  const balance = me?.credits;
  const remaining = balance !== undefined && validAmount ? balance - credits : undefined;
  const tooMuch = remaining !== undefined && remaining < 0;

  // One idempotency key per opened form and (recipient, amount): a double submit or a retry after a
  // lost response returns the first transfer instead of sending the credits twice.
  const [attempt] = useState(() => `xfer-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);
  const inFlight = useRef(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!recipient || !validAmount || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const { transfer } = await api<{ transfer: CreditTransferResult }>(
        `/api/teams/${encodeURIComponent(teamId)}/credits/transfer`,
        {
          method: "POST",
          body: { memberUserId: recipient, amount: credits },
          headers: { "Idempotency-Key": `${attempt}:${recipient}:${credits}` },
        },
      );
      const name = recipients.find((r) => r.userId === recipient);
      toast.success(`Sent ${transfer.amount.toLocaleString("en-US")} credits to ${name?.name || name?.email || "your teammate"}.`);
      if (me) await mutateMe({ user: { ...me, credits: transfer.balance } }, { revalidate: true });
      onDone();
    } catch (err) {
      toast.error(apiErrorText(err));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Transfer credits</DialogTitle>
        <DialogDescription>
          Give credits from your balance to a member of {teamName}. Transfers are immediate and can&apos;t be undone.
        </DialogDescription>
      </DialogHeader>

      {recipients.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nobody has joined yet. Invite teammates first — credits can be sent once they accept.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor={memberId}>Teammate</Label>
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger id={memberId} className="h-11 w-full data-[size=default]:h-11">
                <SelectValue placeholder="Choose a teammate" />
              </SelectTrigger>
              <SelectContent>
                {recipients.map((r) => (
                  <SelectItem key={r.id} value={r.userId!}>
                    {r.name ? `${r.name} · ${r.email}` : r.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={amountId}>Credits</Label>
            <Input
              id={amountId}
              type="number"
              inputMode="numeric"
              min={1}
              max={balance}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50"
              required
              aria-describedby={hintId}
              aria-invalid={tooMuch || undefined}
              className="h-11"
            />
            <p id={hintId} className={tooMuch ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {balance === undefined
                ? "Loading your balance…"
                : tooMuch
                  ? `You only have ${balance.toLocaleString("en-US")} credits.`
                  : remaining !== undefined
                    ? `You'll have ${remaining.toLocaleString("en-US")} of ${balance.toLocaleString("en-US")} credits left.`
                    : `Your balance: ${balance.toLocaleString("en-US")} credits.`}
            </p>
          </div>
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="brand" disabled={pending || !recipient || !validAmount || tooMuch}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Send credits
        </Button>
      </DialogFooter>
    </form>
  );
}
