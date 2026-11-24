"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/react";
import { cn } from "@/lib/utils";

/** Light/dark toggle. Both icons render and CSS picks one, so there's no hydration mismatch. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useT();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("relative", className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={t("user.toggleTheme")}
    >
      <SunIcon className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
      <MoonIcon className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
    </Button>
  );
}
