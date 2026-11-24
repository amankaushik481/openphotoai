"use client";

import * as React from "react";
import { FolderIcon, FolderMinusIcon, FolderPlusIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { MAX_FOLDERS, type FolderDTO } from "@/server/gallery/dto";
import { FolderNameDialog } from "./folder-name-dialog";
import { useFolders } from "./use-gallery";

export interface MoveToFolderMenuProps {
  /** The button that opens the menu (rendered with `asChild`). */
  trigger: React.ReactNode;
  /** Folder of the item(s): disables moving into it again; `null` (not in a folder) disables "Remove". */
  currentFolderId?: string | null;
  /** Move to a folder (`null` removes from folders). Errors are handled by the caller. */
  onMove: (folderId: string | null, folderName: string | null) => void | Promise<void>;
}

export function MoveToFolderMenu({ trigger, currentFolderId, onMove }: MoveToFolderMenuProps) {
  const { folders, mutate } = useFolders();
  const [creating, setCreating] = React.useState(false);
  const atLimit = (folders?.length ?? 0) >= MAX_FOLDERS;

  async function createAndMove(name: string) {
    const { folder } = await api<{ folder: FolderDTO }>("/api/folders", { method: "POST", body: { name } });
    await mutate();
    await onMove(folder.id, folder.name);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 w-56">
          <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
          {folders?.map((f) => (
            <DropdownMenuItem key={f.id} disabled={f.id === currentFolderId} onSelect={() => void onMove(f.id, f.name)}>
              <FolderIcon aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
            </DropdownMenuItem>
          ))}
          {folders && folders.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No folders yet.</p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={atLimit} onSelect={() => setCreating(true)}>
            <FolderPlusIcon aria-hidden="true" />
            New folder…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={currentFolderId === null} onSelect={() => void onMove(null, null)}>
            <FolderMinusIcon aria-hidden="true" />
            Remove from folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FolderNameDialog
        open={creating}
        onOpenChange={setCreating}
        title="New folder"
        submitLabel="Create and move"
        onSubmit={createAndMove}
      />
    </>
  );
}
