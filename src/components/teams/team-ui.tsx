"use client";

import { ApiClientError } from "@/lib/api-client";
import { errorMessage } from "@/i18n";
import { cn } from "@/lib/utils";
import type { TeamRole } from "@/types/domain";

export const BRAND_KITS_KEY = "/api/brand-kits";
export const teamKey = (teamId: string) => `/api/teams/${encodeURIComponent(teamId)}`;

export function apiErrorText(err: unknown): string {
  if (err instanceof ApiClientError) return err.message || errorMessage(err.code);
  return errorMessage(undefined);
}

export const ROLE_LABELS: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function initials(nameOrEmail: string): string {
  const words = nameOrEmail.split("@")[0]!.split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** Small brand-color dot (decorative). */
export function ColorSwatch({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3 shrink-0 rounded-full border border-black/10 dark:border-white/20", className)}
      style={{ background: color ?? "var(--muted)" }}
    />
  );
}
