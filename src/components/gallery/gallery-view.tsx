"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpenIcon, ImagesIcon, RotateCwIcon, SearchXIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/app/empty-state";
import { MediaGrid } from "@/components/app/media-grid";
import { ApiClientError, api } from "@/lib/api-client";
import type { BulkAction } from "@/server/gallery/dto";
import type { MediaDTO } from "@/types/domain";
import { errorMessage } from "@/i18n";
import { useT } from "@/i18n/react";
import { downloadMediaZip } from "./download-zip";
import { FolderNav } from "./folder-nav";
import {
  galleryHref,
  hasNarrowingFilters,
  parseGalleryFilters,
  serializeGalleryFilters,
  viewerHref,
  type GalleryFilters,
} from "./gallery-filters";
import { GalleryToolbar, type PackOption } from "./gallery-toolbar";
import { LoadMore } from "./load-more";
import { SelectionBar } from "./selection-bar";
import { applyBulkLocally, runBulkAction, useFolders, useMediaList } from "./use-gallery";

function bulkMessage(action: BulkAction, n: number, folderName: string | null): string {
  const items = n === 1 ? "1 item" : `${n} items`;
  switch (action) {
    case "favorite":
      return `Added ${items} to favorites`;
    case "unfavorite":
      return `Removed ${items} from favorites`;
    case "move":
      return folderName ? `Moved ${items} to “${folderName}”` : `Removed ${items} from the folder`;
    case "hide":
      return `Hid ${items}`;
    case "unhide":
      return `Unhid ${items}`;
    case "delete":
      return `Deleted ${items}`;
  }
}

export function GalleryView({ packs }: { packs: readonly PackOption[] }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = React.useMemo(() => parseGalleryFilters(searchParams), [searchParams]);
  const filtersKey = serializeGalleryFilters(filters);
  const list = useMediaList(filters);
  const { folders, mutate: mutateFolders } = useFolders();

  const [foldersOpen, setFoldersOpen] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<BulkAction | "download" | null>(null);

  const folderName = filters.folderId ? (folders?.find((f) => f.id === filters.folderId)?.name ?? null) : null;

  // A new list means a new selection (reset while rendering, not in an effect).
  const [selectionKey, setSelectionKey] = React.useState(filtersKey);
  if (selectionKey !== filtersKey) {
    setSelectionKey(filtersKey);
    setSelected([]);
  }

  React.useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog],[role=alertdialog],[role=menu]")) {
        setSelecting(false);
        setSelected([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  const setFilters = (next: GalleryFilters) => router.replace(galleryHref(next), { scroll: false });

  const showError = (err: unknown) =>
    toast.error(err instanceof ApiClientError ? err.message || errorMessage(err.code) : t("errors.generic"));

  async function toggleFavorite(item: MediaDTO, next: boolean) {
    await list.patchLocal((m) => (m.id === item.id ? { ...m, isFavorite: next } : m));
    try {
      await api(`/api/media/${item.id}`, { method: "PATCH", body: { isFavorite: next } });
    } catch (err) {
      showError(err);
      void list.revalidate();
    }
  }

  async function bulk(action: BulkAction, folderId: string | null = null) {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(action);
    try {
      const { updated } = await runBulkAction(action, ids, folderId);
      const chosen = new Set(ids);
      await list.patchLocal((m) => (chosen.has(m.id) ? applyBulkLocally(m, action, folderId) : m));
      const target = folderId ? (folders?.find((f) => f.id === folderId)?.name ?? "folder") : null;
      toast.success(bulkMessage(action, updated, target));
      setSelected([]);
      if (action === "delete") setSelecting(false);
      if (action === "move" || action === "delete") void mutateFolders();
      // Refresh counts (e.g. "Show hidden (N)") and pages shifted by removed items.
      void list.revalidate();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("download");
    try {
      const mode = await downloadMediaZip(selected);
      toast.success(mode === "saved" ? "Download ready" : "Preparing your download — it will start in a moment");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  }

  const loadedIds = list.media.filter((m) => filters.showHidden || !m.hidden).map((m) => m.id);
  const allSelected = loadedIds.length > 0 && loadedIds.every((id) => selected.includes(id));

  const empty =
    filters.folderId && !hasNarrowingFilters({ ...filters, folderId: undefined }) ? (
      <EmptyState
        icon={<FolderOpenIcon />}
        title="This folder is empty"
        description="Open All media, tap Select, pick photos and use Move to add them here."
        action={
          <Button asChild variant="outline">
            <Link href={galleryHref({ ...filters, folderId: undefined })}>All media</Link>
          </Button>
        }
      />
    ) : hasNarrowingFilters(filters) ? (
      <EmptyState
        icon={<SearchXIcon />}
        title="Nothing matches these filters"
        description={
          list.hiddenCount > 0 && !filters.showHidden ? "Some results are hidden by the best-shots picker." : undefined
        }
        action={
          <Button asChild variant="outline">
            <Link href={galleryHref({ folderId: filters.folderId })}>Clear filters</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<ImagesIcon />}
        title={t("empty.gallery")}
        description={t("empty.galleryBody")}
        action={
          <Button asChild variant="brand">
            <Link href="/app/create">
              <SparklesIcon aria-hidden="true" />
              {t("nav.create")}
            </Link>
          </Button>
        }
      />
    );

  return (
    <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <FolderNav filters={filters} onFoldersChanged={() => void list.revalidate()} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <GalleryToolbar
          filters={filters}
          onFiltersChange={setFilters}
          packs={packs}
          folderName={folderName}
          hiddenCount={list.hiddenCount}
          selecting={selecting}
          onSelectingChange={(on) => {
            setSelecting(on);
            if (!on) setSelected([]);
          }}
          onOpenFolders={() => setFoldersOpen(true)}
        />

        {folderName && <h2 className="text-lg font-semibold">{folderName}</h2>}

        {list.error && !list.media.length ? (
          <Alert variant="destructive">
            <AlertTitle>We couldn&apos;t load your gallery</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {list.error instanceof ApiClientError ? errorMessage(list.error.code) : t("errors.generic")}
              <Button type="button" variant="outline" size="sm" onClick={() => void list.revalidate()}>
                <RotateCwIcon aria-hidden="true" />
                {t("common.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <MediaGrid
            media={list.media}
            loading={list.isLoading}
            skeletonCount={12}
            hrefFor={(m) => viewerHref(m.id, filters)}
            selectable={selecting}
            selectedIds={selected}
            onSelectionChange={setSelected}
            onToggleFavorite={(m, next) => void toggleFavorite(m, next)}
            showHidden={Boolean(filters.showHidden)}
            empty={empty}
            priorityCount={6}
          />
        )}

        <LoadMore hasMore={list.hasMore} loading={list.isLoadingMore} onLoadMore={list.loadMore} />

        {selecting && (
          <SelectionBar
            count={selected.length}
            total={loadedIds.length}
            allSelected={allSelected}
            onSelectAll={() => setSelected(loadedIds)}
            onClear={() => setSelected([])}
            onExit={() => {
              setSelecting(false);
              setSelected([]);
            }}
            currentFolderId={filters.folderId}
            busy={busy}
            onAction={bulk}
            onDownload={download}
          />
        )}
      </div>

      <Sheet open={foldersOpen} onOpenChange={setFoldersOpen}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Folders</SheetTitle>
            <SheetDescription className="sr-only">Pick a folder to show, or manage your folders.</SheetDescription>
          </SheetHeader>
          <FolderNav
            filters={filters}
            onNavigate={() => setFoldersOpen(false)}
            onFoldersChanged={() => void list.revalidate()}
            className="px-2 pb-6"
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
