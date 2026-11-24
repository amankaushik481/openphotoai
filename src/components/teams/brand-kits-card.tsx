"use client";

import { PackageIcon, PaletteIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import type { BrandKitDTO } from "@/server/teams/types";
import { BrandKitEditorDialog, type PackOption } from "./brand-kit-editor-dialog";
import { brandKitFragment } from "./brand-kit-prompt";
import { ColorSwatch } from "./team-ui";

export interface BrandKitsCardProps {
  teamId: string;
  kits: BrandKitDTO[];
  canManage: boolean;
  packs: PackOption[];
  onChanged: () => Promise<unknown>;
}

export function BrandKitsCard({ teamId, kits, canManage, packs, onChanged }: BrandKitsCardProps) {
  const [editing, setEditing] = useState<BrandKitDTO | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<BrandKitDTO | null>(null);
  const packName = (slug: string | null) => (slug ? (packs.find((p) => p.slug === slug)?.name ?? slug) : null);

  function openEditor(kit: BrandKitDTO | null) {
    setEditing(kit);
    setEditorOpen(true);
  }

  async function remove(kit: BrandKitDTO) {
    await api(`/api/brand-kits/${encodeURIComponent(kit.id)}`, { method: "DELETE" });
    toast.success(`Deleted “${kit.name}”.`);
    await onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand kits</CardTitle>
        <CardDescription>
          A kit adds your background, outfit, style and lighting to every photo a teammate creates with it, so the
          whole team&apos;s headshots match.
        </CardDescription>
        {canManage && kits.length > 0 && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => openEditor(null)}>
              <PlusIcon aria-hidden="true" />
              New kit
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {kits.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<PaletteIcon />}
            title="No brand kits yet"
            description={
              canManage
                ? "Create one to give everyone the same backdrop, outfit and lighting."
                : "Ask the team owner or an admin to create one."
            }
            action={
              canManage ? (
                <Button variant="brand" onClick={() => openEditor(null)}>
                  <PlusIcon aria-hidden="true" />
                  Create a brand kit
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {kits.map((kit) => {
              const fragment = brandKitFragment(kit);
              const pack = packName(kit.basePackId);
              return (
                <li key={kit.id} className="flex flex-col gap-3 rounded-xl border p-4">
                  <div className="flex items-start gap-2">
                    <ColorSwatch color={kit.colorHex} className="mt-1.5" />
                    <h3 className="min-w-0 flex-1 truncate font-medium">{kit.name}</h3>
                    <Badge variant="outline" className="tabular-nums">
                      {kit.aspectRatio}
                    </Badge>
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {fragment || "Only sets the aspect ratio."}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {pack && kit.basePackId && (
                      <Button asChild variant="ghost" size="sm" className="-ml-2">
                        <Link href={`/app/packs/${encodeURIComponent(kit.basePackId)}`}>
                          <PackageIcon aria-hidden="true" />
                          {pack}
                        </Link>
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="sm" className={pack ? undefined : "-ml-2"}>
                      <Link href="/app/create">
                        <SparklesIcon aria-hidden="true" />
                        Create with it
                      </Link>
                    </Button>
                    {canManage && (
                      <span className="ml-auto flex gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEditor(kit)} aria-label={`Edit ${kit.name}`}>
                          <PencilIcon aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(kit)} aria-label={`Delete ${kit.name}`}>
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {canManage && (
        <BrandKitEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          teamId={teamId}
          kit={editing}
          packs={packs}
          onSaved={() => void onChanged()}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Teammates can no longer pick this kit. Photos already created with it are not affected."
        confirmLabel="Delete kit"
        destructive
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
      />
    </Card>
  );
}
