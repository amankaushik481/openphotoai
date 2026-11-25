"use client";

import { Loader2Icon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AspectRatioPicker } from "@/components/app/aspect-ratio-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api-client";
import type { BrandKitDTO } from "@/server/teams/types";
import type { AspectRatio } from "@/types/domain";
import { brandKitFragment, SAMPLE_HEADSHOT_PROMPT } from "./brand-kit-prompt";
import { apiErrorText } from "./team-ui";

export interface PackOption {
  slug: string;
  name: string;
}

interface KitValues {
  name: string;
  backgroundPrompt: string;
  outfitPrompt: string;
  stylePrompt: string;
  lighting: string;
  aspectRatio: AspectRatio;
  basePackId: string | null;
  colorHex: string | null;
}

const EMPTY: KitValues = {
  name: "",
  backgroundPrompt: "",
  outfitPrompt: "",
  stylePrompt: "",
  lighting: "",
  aspectRatio: "4:5",
  basePackId: null,
  colorHex: null,
};

const NO_PACK = "__none__";
const DEFAULT_SWATCH = "#6d28d9";
const PROMPT_MAX = 300;
const LIGHTING_MAX = 200;

export interface BrandKitEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  /** Kit to edit; omit to create a new one. */
  kit?: BrandKitDTO | null;
  packs: PackOption[];
  onSaved: (kit: BrandKitDTO) => void;
}

export function BrandKitEditorDialog({ open, onOpenChange, teamId, kit, packs, onSaved }: BrandKitEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted per open so the form starts from the kit being edited. */}
        {open && (
          <BrandKitForm
            key={kit?.id ?? "new"}
            teamId={teamId}
            kit={kit ?? null}
            packs={packs}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved(saved);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BrandKitForm({
  teamId,
  kit,
  packs,
  onCancel,
  onSaved,
}: {
  teamId: string;
  kit: BrandKitDTO | null;
  packs: PackOption[];
  onCancel: () => void;
  onSaved: (kit: BrandKitDTO) => void;
}) {
  const ids = {
    name: useId(),
    background: useId(),
    outfit: useId(),
    style: useId(),
    lighting: useId(),
    pack: useId(),
    color: useId(),
    preview: useId(),
  };
  const [values, setValues] = useState<KitValues>(() => (kit ? pickValues(kit) : EMPTY));
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const set = <K extends keyof KitValues>(key: K, value: KitValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setBlocked(null);
    try {
      const body = { ...values, name: values.name.trim() };
      const { brandKit } = kit
        ? await api<{ brandKit: BrandKitDTO }>(`/api/brand-kits/${encodeURIComponent(kit.id)}`, { method: "PATCH", body })
        : await api<{ brandKit: BrandKitDTO }>(`/api/teams/${encodeURIComponent(teamId)}/brand-kits`, {
            method: "POST",
            body,
          });
      toast.success(kit ? `Saved “${brandKit.name}”.` : `Created “${brandKit.name}”.`);
      onSaved(brandKit);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "content_blocked") setBlocked(err.message);
      else toast.error(apiErrorText(err));
    } finally {
      setPending(false);
    }
  }

  const fragment = brandKitFragment(values);

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{kit ? "Edit brand kit" : "New brand kit"}</DialogTitle>
        <DialogDescription>
          These details are added to every photo your teammates create with this kit. Describe the look, not the
          person.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Website headshots"
          maxLength={60}
          required
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PromptField
          id={ids.background}
          label="Background"
          value={values.backgroundPrompt}
          onChange={(v) => set("backgroundPrompt", v)}
          placeholder="plain light-gray studio backdrop"
        />
        <PromptField
          id={ids.outfit}
          label="Outfit"
          value={values.outfitPrompt}
          onChange={(v) => set("outfitPrompt", v)}
          placeholder="navy blazer over a white shirt"
        />
        <PromptField
          id={ids.style}
          label="Style"
          value={values.stylePrompt}
          onChange={(v) => set("stylePrompt", v)}
          placeholder="clean corporate look, natural skin texture"
        />
        <div className="grid content-start gap-2">
          <Label htmlFor={ids.lighting}>Lighting</Label>
          <Input
            id={ids.lighting}
            value={values.lighting}
            onChange={(e) => set("lighting", e.target.value)}
            placeholder="soft window light from the left"
            maxLength={LIGHTING_MAX}
            autoComplete="off"
          />
        </div>
      </div>

      <AspectRatioPicker value={values.aspectRatio} onValueChange={(r) => set("aspectRatio", r)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={ids.pack}>Suggested pack (optional)</Label>
          <Select
            value={values.basePackId ?? NO_PACK}
            onValueChange={(v) => set("basePackId", v === NO_PACK ? null : v)}
          >
            <SelectTrigger id={ids.pack} className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PACK}>None</SelectItem>
              {packs.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={ids.color}>Brand color (optional)</Label>
          <div className="flex items-center gap-2">
            <input
              id={ids.color}
              type="color"
              value={values.colorHex ?? DEFAULT_SWATCH}
              onChange={(e) => set("colorHex", e.target.value.toLowerCase())}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
            />
            <span className="font-mono text-sm text-muted-foreground">{values.colorHex ?? "Not set"}</span>
            {values.colorHex && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => set("colorHex", null)} aria-label="Clear brand color">
                <XIcon aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby={ids.preview} className="grid gap-2 border border-dashed border-foreground/25 bg-muted/40 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 id={ids.preview} className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Live preview
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">{values.aspectRatio}</span>
        </div>
        <p className="font-mono text-xs leading-relaxed break-words">
          <span className="text-muted-foreground">{SAMPLE_HEADSHOT_PROMPT}</span>
          {fragment ? (
            <>
              <span className="text-muted-foreground">, </span>
              <mark className="bg-transparent px-0.5 text-foreground underline decoration-safelight-ink decoration-2 underline-offset-4">{fragment}</mark>
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {fragment
            ? "Highlighted text is what this kit adds to each teammate's prompt."
            : "Fill in a field above to see how the kit changes a headshot prompt."}
        </p>
      </section>

      {blocked && (
        <Alert variant="destructive" role="alert">
          <ShieldAlertIcon aria-hidden="true" />
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="brand" disabled={pending || !values.name.trim()}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          {kit ? "Save changes" : "Create brand kit"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PromptField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={PROMPT_MAX}
        rows={2}
        className="min-h-16 resize-y"
      />
    </div>
  );
}

function pickValues(kit: BrandKitDTO): KitValues {
  return {
    name: kit.name,
    backgroundPrompt: kit.backgroundPrompt,
    outfitPrompt: kit.outfitPrompt,
    stylePrompt: kit.stylePrompt,
    lighting: kit.lighting,
    aspectRatio: kit.aspectRatio,
    basePackId: kit.basePackId,
    colorHex: kit.colorHex,
  };
}
