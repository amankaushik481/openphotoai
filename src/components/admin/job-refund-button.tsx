"use client";

import { Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { ActionDialog, Field } from "./action-dialog";

/** Refund what's left of a job's credits (charged − already refunded). */
export function JobRefundButton({ jobId, refundable, userEmail }: { jobId: string; refundable: number; userEmail: string | null }) {
  if (refundable <= 0) return null;
  const noteId = `refund-note-${jobId}`;
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline" aria-label={`Refund ${refundable} credits for job ${jobId}`}>
          <Undo2Icon aria-hidden="true" />
          Refund {refundable}
        </Button>
      }
      title={`Refund ${refundable} credit${refundable === 1 ? "" : "s"}?`}
      description={`The credits go back to ${userEmail ?? "the job owner"} and the refund is recorded in their ledger.`}
      submitLabel="Refund credits"
      onSubmit={async (data) => {
        const res = await api<{ refunded: number }>(`/api/admin/jobs/${encodeURIComponent(jobId)}/refund`, {
          method: "POST",
          body: { note: String(data.get("note") ?? "") },
        });
        return `Refunded ${res.refunded} credit${res.refunded === 1 ? "" : "s"}.`;
      }}
    >
      <Field id={noteId} label="Note (optional)">
        <Textarea id={noteId} name="note" maxLength={500} placeholder="e.g. Results didn't look like the user" />
      </Field>
    </ActionDialog>
  );
}
