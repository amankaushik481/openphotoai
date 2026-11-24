"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BanIcon, CheckIcon, EyeOffIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { ActionDialog, Field, actionErrorMessage } from "./action-dialog";

type ReportAction = "dismiss" | "remove_media" | "suspend_user";

const ACTIONS: Record<
  ReportAction,
  { label: string; title: string; description: string; submit: string; done: string; destructive?: boolean; icon: React.ReactNode }
> = {
  dismiss: {
    label: "Dismiss",
    title: "Dismiss this report?",
    description: "No action is taken against the user. The report is closed.",
    submit: "Dismiss report",
    done: "Report dismissed.",
    icon: <XIcon aria-hidden="true" />,
  },
  remove_media: {
    label: "Remove media",
    title: "Remove the reported media?",
    description: "The file is deleted from storage, hidden from the owner's gallery and every share link to it stops working.",
    submit: "Remove media",
    done: "Media removed and share links revoked.",
    destructive: true,
    icon: <EyeOffIcon aria-hidden="true" />,
  },
  suspend_user: {
    label: "Suspend owner",
    title: "Suspend the owner of this content?",
    description:
      "They are signed out everywhere, all their share links stop working and they get an email. Your note is used as the reason.",
    submit: "Suspend owner",
    done: "Owner suspended.",
    destructive: true,
    icon: <BanIcon aria-hidden="true" />,
  },
};

export function ReportActions({
  reportId,
  canRemoveMedia,
  canSuspend,
}: {
  reportId: string;
  canRemoveMedia: boolean;
  canSuspend: boolean;
}) {
  const available: ReportAction[] = [
    "dismiss",
    ...(canRemoveMedia ? (["remove_media"] as const) : []),
    ...(canSuspend ? (["suspend_user"] as const) : []),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {available.map((action) => {
        const meta = ACTIONS[action];
        const noteId = `note-${reportId}-${action}`;
        return (
          <ActionDialog
            key={action}
            trigger={
              <Button size="sm" variant={meta.destructive ? "destructive" : "outline"}>
                {meta.icon}
                {meta.label}
              </Button>
            }
            title={meta.title}
            description={meta.description}
            submitLabel={meta.submit}
            destructive={meta.destructive}
            onSubmit={async (data) => {
              await api(`/api/admin/reports/${encodeURIComponent(reportId)}/resolve`, {
                method: "POST",
                body: { action, note: String(data.get("note") ?? "") },
              });
              return meta.done;
            }}
          >
            <Field
              id={noteId}
              label={action === "suspend_user" ? "Reason (sent to the user)" : "Internal note (optional)"}
            >
              <Textarea
                id={noteId}
                name="note"
                maxLength={1000}
                required={action === "suspend_user"}
                minLength={action === "suspend_user" ? 3 : undefined}
              />
            </Field>
          </ActionDialog>
        );
      })}
    </div>
  );
}

/** One-click "reviewed" for a safety event (no confirm: it only clears it from the queue). */
export function MarkReviewedButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [busy, setBusy] = React.useState(false);

  async function markReviewed() {
    setBusy(true);
    try {
      await api(`/api/admin/moderation-events/${encodeURIComponent(eventId)}/review`, { method: "POST" });
      toast.success("Marked as reviewed.");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(actionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;
  return (
    <Button size="sm" variant="outline" onClick={markReviewed} disabled={loading} aria-busy={loading}>
      {loading ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : <CheckIcon aria-hidden="true" />}
      Mark reviewed
    </Button>
  );
}
