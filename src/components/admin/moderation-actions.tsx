"use client";

import * as React from "react";
import { BanIcon, CheckIcon, EyeOffIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "./kbd";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { ActionDialog, Field } from "./action-dialog";

type ReportAction = "dismiss" | "remove_media" | "suspend_user";

/** Single-key shortcuts for the focused queue item (see TriageKeyboard). */
export const TRIAGE_SHORTCUTS = { dismiss: "d", remove_media: "r", suspend_user: "s", review: "m" } as const;

const ACTIONS: Record<
  ReportAction,
  { label: string; title: string; description: string; submit: string; done: string; destructive?: boolean; icon: React.ReactNode }
> = {
  dismiss: {
    label: "Dismiss",
    title: "Dismiss this report?",
    description: "No action is taken against the user. The report is closed and recorded with your note.",
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
        const key = TRIAGE_SHORTCUTS[action];
        return (
          <ActionDialog
            key={action}
            trigger={
              <Button
                size="sm"
                variant={meta.destructive ? "destructive" : "outline"}
                data-shortcut={key}
                aria-keyshortcuts={key.toUpperCase()}
              >
                {meta.icon}
                {meta.label}
                <Kbd>{key.toUpperCase()}</Kbd>
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
              hint="Ctrl+Enter (⌘+Enter on a Mac) to submit."
            >
              <Textarea
                id={noteId}
                name="note"
                maxLength={1000}
                required={action === "suspend_user"}
                minLength={action === "suspend_user" ? 3 : undefined}
                aria-describedby={`${noteId}-hint`}
              />
            </Field>
          </ActionDialog>
        );
      })}
    </div>
  );
}

/** "Reviewed" for a safety event: a quick confirm (Enter), recorded with the reviewer. */
export function MarkReviewedButton({ eventId, kind }: { eventId: string; kind?: string }) {
  const key = TRIAGE_SHORTCUTS.review;
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline" data-shortcut={key} aria-keyshortcuts={key.toUpperCase()}>
          <CheckIcon aria-hidden="true" />
          Mark reviewed
          <Kbd>{key.toUpperCase()}</Kbd>
        </Button>
      }
      title="Mark this safety event as reviewed?"
      description={`It leaves the queue${kind ? ` (${kind})` : ""}. It stays in the user's history with your name as the reviewer.`}
      submitLabel="Mark reviewed"
      onSubmit={async () => {
        await api(`/api/admin/moderation-events/${encodeURIComponent(eventId)}/review`, { method: "POST" });
        return "Marked as reviewed.";
      }}
    />
  );
}
