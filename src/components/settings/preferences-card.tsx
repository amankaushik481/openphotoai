"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useId, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/settings/editorial-card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ME_KEY } from "@/hooks/use-me";
import { useT } from "@/i18n/react";
import { api } from "@/lib/api-client";
import type { MeDTO } from "@/types/domain";
import { apiErrorText } from "./client-errors";

const subscribeNoop = () => () => {};

/** False during SSR and hydration, true afterwards (the stored theme only exists in the browser). */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

const THEMES = [
  { value: "light", icon: SunIcon, labelKey: "user.themeLight" },
  { value: "dark", icon: MoonIcon, labelKey: "user.themeDark" },
  { value: "system", icon: MonitorIcon, labelKey: "user.themeSystem" },
] as const;

export function PreferencesCard({ initialMarketingOptIn }: { initialMarketingOptIn: boolean }) {
  const t = useT();
  const marketingId = useId();
  const marketingHintId = useId();
  const themeLabelId = useId();
  const hydrated = useHydrated();
  const { theme, setTheme } = useTheme();
  const [marketing, setMarketing] = useState(initialMarketingOptIn);
  const [saving, setSaving] = useState(false);

  async function onMarketingChange(next: boolean) {
    setMarketing(next); // optimistic
    setSaving(true);
    try {
      const { user } = await api<{ user: MeDTO & { marketingOptIn: boolean } }>("/api/me", {
        method: "PATCH",
        body: { marketingOptIn: next },
      });
      setMarketing(user.marketingOptIn);
      void mutate(ME_KEY);
      toast.success(next ? "You'll get product news by email." : "You won't get product news anymore.");
    } catch (err) {
      setMarketing(!next);
      toast.error(apiErrorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Emails and appearance.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Label htmlFor={marketingId}>Product news</Label>
            <p id={marketingHintId} className="text-sm text-muted-foreground">
              Occasional emails about new packs and features. Account emails (sign-in, receipts, deletion) are always
              sent.
            </p>
          </div>
          <Switch
            id={marketingId}
            checked={marketing}
            onCheckedChange={onMarketingChange}
            disabled={saving}
            aria-describedby={marketingHintId}
            className="mt-1"
          />
        </div>
        <Separator />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <p id={themeLabelId} className="text-sm leading-none font-medium">
              {t("user.theme")}
            </p>
            <p className="text-sm text-muted-foreground">Saved on this device.</p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby={themeLabelId}
            value={hydrated ? (theme ?? "system") : ""}
            onValueChange={(value) => {
              if (value) setTheme(value);
            }}
            className="w-full sm:w-auto"
          >
            {THEMES.map(({ value, icon: Icon, labelKey }) => (
              <ToggleGroupItem key={value} value={value} className="gap-1.5 px-3">
                <Icon aria-hidden />
                {t(labelKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  );
}
