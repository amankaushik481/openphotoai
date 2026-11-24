"use client";

import * as React from "react";
import useSWR from "swr";
import { Link2Icon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/app/copy-button";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ApiClientError, api, fetcher } from "@/lib/api-client";
import { SHARE_EXPIRY_DAYS, type ShareDTO } from "@/server/gallery/dto";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";

export type ShareTarget = { mediaId: string; folderId?: never } | { folderId: string; mediaId?: never };

export interface ShareDialogProps {
  target: ShareTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Share photo" / "Share “Trip” folder". */
  title?: string;
}

const NEVER = "never";

function describe(share: ShareDTO, locale: string): string {
  const views = share.views === 1 ? "1 view" : `${share.views.toLocaleString(locale)} views`;
  if (!share.expiresAt) return `${views} · never expires`;
  const date = new Date(share.expiresAt).toLocaleDateString(locale, { dateStyle: "medium" });
  return `${views} · expires ${date}`;
}

export function ShareDialog({ target, open, onOpenChange, title = "Share" }: ShareDialogProps) {
  const t = useT();
  const expiryId = React.useId();
  const query = target.mediaId
    ? `mediaId=${encodeURIComponent(target.mediaId)}`
    : `folderId=${encodeURIComponent(target.folderId!)}`;
  const { data, isLoading, mutate } = useSWR<{ shares: ShareDTO[] }>(open ? `/api/share?${query}` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const shares = data?.shares ?? [];
  const [expiry, setExpiry] = React.useState<string>(NEVER);
  const [creating, setCreating] = React.useState(false);

  async function create() {
    setCreating(true);
    try {
      const { share } = await api<{ share: ShareDTO }>("/api/share", {
        method: "POST",
        body: { ...target, ...(expiry === NEVER ? {} : { expiresInDays: Number(expiry) }) },
      });
      await mutate((cur) => ({ shares: [share, ...(cur?.shares ?? [])] }), { revalidate: false });
      try {
        await navigator.clipboard.writeText(share.url);
        toast.success("Link created and copied");
      } catch {
        toast.success("Link created");
      }
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message || errorMessage(err.code) : t("errors.generic"));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(share: ShareDTO) {
    await api(`/api/share/${share.id}`, { method: "DELETE" });
    await mutate((cur) => ({ shares: (cur?.shares ?? []).filter((s) => s.id !== share.id) }), { revalidate: false });
    toast.success("Link revoked — it no longer works");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Anyone with the link can view {target.mediaId ? "this photo" : "this folder"} without signing in. Shared
            pages are labeled AI-generated, hidden from search engines and have a report button.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          shares.length > 0 && (
            <ul className="grid gap-3" aria-label="Active links">
              {shares.map((share) => (
                <li key={share.id} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={share.url}
                      aria-label="Share link"
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono text-xs"
                    />
                    <CopyButton value={share.url} toastMessage="Link copied" />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{describe(share, t.locale)}</span>
                    <ConfirmDialog
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          Revoke
                        </Button>
                      }
                      title="Revoke this link?"
                      description="People who open it will see a “link unavailable” page. You can create a new link any time."
                      confirmLabel="Revoke link"
                      destructive
                      onConfirm={() => revoke(share)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor={expiryId}>Link expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger id={expiryId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEVER}>Never (until revoked)</SelectItem>
                {SHARE_EXPIRY_DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d === 1 ? "After 1 day" : `After ${d} days`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={create} disabled={creating || isLoading} aria-busy={creating}>
            {creating ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <Link2Icon aria-hidden="true" />
            )}
            {shares.length ? "Create another link" : "Create link"}
          </Button>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Deleting the {target.mediaId ? "photo" : "folder"} or revoking the link stops sharing immediately.
        </p>
      </DialogContent>
    </Dialog>
  );
}
