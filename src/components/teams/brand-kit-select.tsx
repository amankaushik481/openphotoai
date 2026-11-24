"use client";

import * as React from "react";
import useSWR from "swr";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { BrandKitDTO } from "@/server/teams/types";
import { brandKitFragment } from "./brand-kit-prompt";
import { BRAND_KITS_KEY, ColorSwatch } from "./team-ui";

const NONE = "__none__";

export interface BrandKitSelectProps {
  /** Selected brand kit id (undefined = none). */
  value?: string;
  onChange(id?: string): void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** The brand kits I can apply, fetched once and shared via SWR. */
export function useBrandKits() {
  const { data, error, isLoading, mutate } = useSWR<{ brandKits: BrandKitDTO[] }>(BRAND_KITS_KEY, fetcher, {
    dedupingInterval: 10_000,
  });
  return { brandKits: data?.brandKits, error, isLoading, mutate };
}

/**
 * Brand kit picker for the generation UI. Renders nothing when the user has no kits
 * (not on a team, or the team has none). Clears a selection that is no longer available.
 */
export function BrandKitSelect({ value, onChange, label = "Brand kit", disabled, className, id }: BrandKitSelectProps) {
  const fallbackId = React.useId();
  const selectId = id ?? fallbackId;
  const hintId = `${selectId}-hint`;
  const { brandKits } = useBrandKits();

  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const missing = Boolean(value && brandKits && !brandKits.some((k) => k.id === value));
  React.useEffect(() => {
    if (missing) onChangeRef.current(undefined);
  }, [missing]);

  if (!brandKits || brandKits.length === 0) return null;

  const selected = brandKits.find((k) => k.id === value);
  const groups = groupByTeam(brandKits);
  const fragment = selected ? brandKitFragment(selected) : "";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={selectId}>{label}</Label>
      <Select
        value={selected ? selected.id : NONE}
        disabled={disabled}
        onValueChange={(next) => onChange(next === NONE ? undefined : next)}
      >
        <SelectTrigger id={selectId} aria-describedby={hintId} className="h-11 w-full data-[size=default]:h-11">
          <SelectValue placeholder="No brand kit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No brand kit</SelectItem>
          <SelectSeparator />
          {groups.map((kits) => (
            <SelectGroup key={kits[0]!.teamId}>
              {groups.length > 1 && <SelectLabel>{kits[0]!.teamName}</SelectLabel>}
              {kits.map((kit) => (
                <SelectItem key={kit.id} value={kit.id}>
                  <span className="flex min-w-0 items-center gap-2">
                    <ColorSwatch color={kit.colorHex} />
                    <span className="truncate">{kit.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{kit.aspectRatio}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p id={hintId} className="line-clamp-2 text-xs text-muted-foreground">
        {selected
          ? fragment
            ? `Adds “${fragment}” to every prompt (${selected.aspectRatio}).`
            : `Uses the ${selected.aspectRatio} aspect ratio.`
          : "Apply your team's background, outfit and style to every photo."}
      </p>
    </div>
  );
}

function groupByTeam(kits: BrandKitDTO[]): BrandKitDTO[][] {
  const map = new Map<string, BrandKitDTO[]>();
  for (const kit of kits) map.set(kit.teamId, [...(map.get(kit.teamId) ?? []), kit]);
  return [...map.values()];
}
