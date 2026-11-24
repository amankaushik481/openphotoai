"use client";

import * as React from "react";
import {
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FolderInputIcon,
  HeartIcon,
  HeartOffIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { MAX_BULK_IDS, type BulkAction } from "@/server/gallery/dto";
import { MoveToFolderMenu } from "./move-to-folder-menu";

export interface SelectionBarProps {
  count: number;
  /** Loaded items that could be selected. */
  total: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  /** Folder currently shown (for "Remove from folder"). */
  currentFolderId?: string;
  busy: BulkAction | "download" | null;
  onAction: (action: BulkAction, folderId?: string | null, folderName?: string | null) => Promise<void>;
  onDownload: () => Promise<void>;
}

export function SelectionBar({
  count,
  total,
  allSelected,
  onSelectAll,
  onClear,
  onExit,
  currentFolderId,
  busy,
  onAction,
  onDownload,
}: SelectionBarProps) {
  const disabled = count === 0 || busy !== null;
  const overLimit = count > MAX_BULK_IDS;
  const spin = (what: BulkAction | "download") =>
    busy === what ? <LoaderCircleIcon aria-hidden="true" className="animate-spin" /> : null;

  return (
    <div
      role="region"
      aria-label="Selection actions"
      className="glass sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mx-auto mt-6 flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl border p-2 shadow-lg md:bottom-4"
    >
      <Button type="button" variant="ghost" size="icon-sm" onClick={onExit} aria-label="Exit selection">
        <XIcon />
      </Button>
      <p className="mr-auto text-sm font-medium tabular-nums" aria-live="polite">
        {count} selected
        {overLimit && <span className="ml-1 text-destructive">(max {MAX_BULK_IDS})</span>}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={allSelected ? onClear : onSelectAll}
        disabled={total === 0}
        className="hidden sm:inline-flex"
      >
        {allSelected ? "Clear" : "Select all"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void onAction("favorite")}
        disabled={disabled || overLimit}
      >
        {spin("favorite") ?? <HeartIcon aria-hidden="true" />}
        <span className="hidden sm:inline">Favorite</span>
        <span className="sr-only sm:hidden">Favorite</span>
      </Button>

      <MoveToFolderMenu
        currentFolderId={currentFolderId}
        onMove={(folderId, folderName) => onAction("move", folderId, folderName)}
        trigger={
          <Button type="button" variant="outline" size="sm" disabled={disabled || overLimit}>
            {spin("move") ?? <FolderInputIcon aria-hidden="true" />}
            <span className="hidden sm:inline">Move</span>
            <span className="sr-only sm:hidden">Move to folder</span>
          </Button>
        }
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void onDownload()}
        disabled={disabled || overLimit}
      >
        {spin("download") ?? <DownloadIcon aria-hidden="true" />}
        <span className="hidden sm:inline">Download</span>
        <span className="sr-only sm:hidden">Download zip</span>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon-sm" disabled={disabled} aria-label="More actions">
            {busy && busy !== "favorite" && busy !== "move" && busy !== "download" ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <MoreHorizontalIcon />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void onAction("unfavorite")} disabled={overLimit}>
            <HeartOffIcon aria-hidden="true" />
            Remove from favorites
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onAction("hide")} disabled={overLimit}>
            <EyeOffIcon aria-hidden="true" />
            Hide
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onAction("unhide")} disabled={overLimit}>
            <EyeIcon aria-hidden="true" />
            Unhide
          </DropdownMenuItem>
          <DropdownMenuItem className="sm:hidden" onSelect={allSelected ? onClear : onSelectAll}>
            {allSelected ? "Clear selection" : "Select all loaded"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        trigger={
          <Button type="button" variant="destructive" size="sm" disabled={disabled || overLimit}>
            {spin("delete") ?? <Trash2Icon aria-hidden="true" />}
            <span className="hidden sm:inline">Delete</span>
            <span className="sr-only sm:hidden">Delete</span>
          </Button>
        }
        title={count === 1 ? "Delete 1 item?" : `Delete ${count} items?`}
        description="They are permanently deleted from storage and any share links stop working. This can't be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => onAction("delete")}
      />
    </div>
  );
}
