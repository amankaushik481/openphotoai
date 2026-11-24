"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Client half of `ThemeToggle` (use that one): a plain <button> whose classes and label are resolved
 * by the caller, so the island ships without the Button/cva/tailwind-merge stack and the dictionary.
 * Both icons render and CSS picks one, so there's no hydration mismatch.
 */
export function ThemeToggleButton({ className, label }: { className: string; label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      data-slot="button"
      data-variant="ghost"
      data-size="icon"
      className={className}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={label}
    >
      <SunIcon className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
      <MoonIcon className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
    </button>
  );
}
