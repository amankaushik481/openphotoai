"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/react";

type ButtonProps = React.ComponentProps<typeof Button>;

export interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "children" | "value"> {
  value: string;
  /** Visible label; when omitted the button is icon-only with an accessible label. */
  label?: string;
  /** Show a toast on success. */
  toastMessage?: string;
  onCopied?: () => void;
}

export function CopyButton({
  value,
  label,
  toastMessage,
  onCopied,
  variant = "outline",
  size,
  ...props
}: CopyButtonProps) {
  const t = useT();
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (toastMessage) toast.success(toastMessage);
      onCopied?.();
    } catch {
      toast.error(t("errors.generic"));
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (label ? "sm" : "icon-sm")}
      onClick={copy}
      aria-label={label ? undefined : t("common.copyToClipboard")}
      {...props}
    >
      <Icon aria-hidden="true" />
      {label && <span>{copied ? t("common.copied") : label}</span>}
      <span className="sr-only" aria-live="polite">
        {copied ? t("common.copied") : ""}
      </span>
    </Button>
  );
}
