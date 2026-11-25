"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Sonner injects its own unlayered stylesheet, so these overrides need `!` to win. (Class names are
// spelled out in full so Tailwind can find them.)

/**
 * Toasts as lab labels: a square paper slip with a hairline border, a coloured tick on its left edge
 * (safelight by default; green / amber / red for the status types), and a square close button.
 */
const toastOptions: ToasterProps["toastOptions"] = {
  classNames: {
    toast:
      "!rounded-xs !border-foreground/18 !pl-5 !shadow-[inset_3px_0_0_var(--tick,var(--safelight-ink)),0_16px_32px_-22px_rgb(0_0_0/0.55)] [font-variant-numeric:tabular-nums]",
    title: "!font-medium !leading-snug",
    description: "!text-[0.8125rem] !leading-snug !text-muted-foreground",
    success: "[--tick:var(--success)]",
    error: "[--tick:var(--destructive)]",
    warning: "[--tick:var(--warning)]",
    info: "[--tick:var(--foreground)]",
    closeButton: "!rounded-xs !border-foreground/20",
    actionButton: "!rounded-xs !bg-foreground !text-background !font-medium",
    cancelButton: "!rounded-xs",
  },
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={toastOptions}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-xs)",
          // `richColors` palette on our tokens: status text on the popover surface stays ≥ 5:1 in both
          // themes (sonner's default red-on-pink error is ~4.3:1).
          "--success-bg": "var(--popover)",
          "--success-text": "var(--success)",
          "--success-border": "color-mix(in oklab, var(--success) 45%, var(--border))",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--destructive)",
          "--error-border": "color-mix(in oklab, var(--destructive) 45%, var(--border))",
          "--warning-bg": "var(--popover)",
          "--warning-text": "var(--warning)",
          "--warning-border": "color-mix(in oklab, var(--warning) 45%, var(--border))",
          "--info-bg": "var(--popover)",
          "--info-text": "var(--popover-foreground)",
          "--info-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
