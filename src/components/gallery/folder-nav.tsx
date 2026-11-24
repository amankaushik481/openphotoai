"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  ImagesIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { MAX_FOLDERS, type FolderDTO } from "@/server/gallery/dto";
import { FolderNameDialog } from "./folder-name-dialog";
import { galleryHref, type GalleryFilters } from "./gallery-filters";
import { ShareDialog } from "./share-dialog";
import { useFolders } from "./use-gallery";

export interface FolderNavProps {
  filters: GalleryFilters;
  /** Called after a link is followed (e.g. close the mobile sheet). */
  onNavigate?: () => void;
  /** Called after folders change (counts, deletions) so the media list can refresh. */
  onFoldersChanged?: () => void;
  className?: string;
}

type DialogState =
  | { kind: "create" }
  | { kind: "rename"; folder: FolderDTO }
  | { kind: "delete"; folder: FolderDTO }
  | { kind: "share"; folder: FolderDTO }
  | null;

const itemClass =
  "flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function FolderNav({ filters, onNavigate, onFoldersChanged, className }: FolderNavProps) {
  const router = useRouter();
  const { folders, isLoading, mutate } = useFolders();
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const close = () => setDialog(null);
  const atLimit = (folders?.length ?? 0) >= MAX_FOLDERS;

  async function create(name: string) {
    const { folder } = await api<{ folder: FolderDTO }>("/api/folders", { method: "POST", body: { name } });
    await mutate();
    toast.success(`Folder “${folder.name}” created`);
    router.push(galleryHref({ ...filters, folderId: folder.id }), { scroll: false });
    onNavigate?.();
  }

  async function rename(folder: FolderDTO, name: string) {
    await api(`/api/folders/${folder.id}`, { method: "PATCH", body: { name } });
    await mutate();
  }

  async function remove(folder: FolderDTO) {
    await api(`/api/folders/${folder.id}`, { method: "DELETE" });
    await mutate();
    toast.success(`Folder “${folder.name}” deleted. Its photos are still in your gallery.`);
    if (filters.folderId === folder.id) router.replace(galleryHref({ ...filters, folderId: undefined }), { scroll: false });
    onFoldersChanged?.();
  }

  return (
    <nav aria-label="Folders" className={cn("flex flex-col gap-1", className)}>
      <Link
        href={galleryHref({ ...filters, folderId: undefined })}
        onClick={onNavigate}
        aria-current={!filters.folderId ? "page" : undefined}
        className={cn(itemClass, !filters.folderId && "bg-accent font-medium")}
      >
        <ImagesIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        All media
      </Link>

      <div className="mt-3 mb-1 flex items-center justify-between gap-2 px-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Folders</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setDialog({ kind: "create" })}
          disabled={atLimit}
          aria-label="New folder"
          title={atLimit ? `You can have up to ${MAX_FOLDERS} folders` : "New folder"}
        >
          <FolderPlusIcon />
        </Button>
      </div>

      {isLoading && !folders ? (
        <div className="grid gap-1.5 px-1" aria-busy="true">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : folders && folders.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {folders.map((folder) => {
            const active = filters.folderId === folder.id;
            const Icon = active ? FolderOpenIcon : FolderIcon;
            return (
              <li key={folder.id} className="group/folder relative flex items-center">
                <Link
                  href={galleryHref({ ...filters, folderId: folder.id })}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(itemClass, "pr-10", active && "bg-accent font-medium")}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{folder.mediaCount}</span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Actions for ${folder.name}`}
                      className="absolute right-1 size-7 pointer-fine:opacity-0 pointer-fine:group-focus-within/folder:opacity-100 pointer-fine:group-hover/folder:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "rename", folder })}>
                      <PencilIcon aria-hidden="true" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDialog({ kind: "share", folder })}>
                      <Share2Icon aria-hidden="true" />
                      Share folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete", folder })}>
                      <Trash2Icon aria-hidden="true" />
                      Delete folder
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-2.5 py-1 text-sm text-muted-foreground">
          No folders yet.{" "}
          <button
            type="button"
            onClick={() => setDialog({ kind: "create" })}
            className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Create one
          </button>
        </p>
      )}

      <FolderNameDialog
        open={dialog?.kind === "create"}
        onOpenChange={(open) => !open && close()}
        title="New folder"
        description="Group photos for a project, a profile or a person you're sharing with."
        submitLabel="Create folder"
        onSubmit={create}
      />
      <FolderNameDialog
        open={dialog?.kind === "rename"}
        onOpenChange={(open) => !open && close()}
        title="Rename folder"
        submitLabel="Save"
        initialName={dialog?.kind === "rename" ? dialog.folder.name : ""}
        onSubmit={(name) => (dialog?.kind === "rename" ? rename(dialog.folder, name) : Promise.resolve())}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title={dialog?.kind === "delete" ? `Delete “${dialog.folder.name}”?` : "Delete folder?"}
        description="The folder and its share links are removed. The photos stay in your gallery."
        confirmLabel="Delete folder"
        destructive
        onConfirm={() => (dialog?.kind === "delete" ? remove(dialog.folder) : undefined)}
      />
      {dialog?.kind === "share" && (
        <ShareDialog
          target={{ folderId: dialog.folder.id }}
          open
          onOpenChange={(open) => !open && close()}
          title={`Share “${dialog.folder.name}”`}
        />
      )}
    </nav>
  );
}
