import { buttonVariants } from "@/components/ui/button";
import { ThemeToggleButton } from "@/components/layout/theme-toggle-button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle (a ghost icon button). Styles and label are resolved here, on the server when the
 * caller is a server component (marketing header), so only the tiny `ThemeToggleButton` hydrates.
 */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <ThemeToggleButton
      className={cn(buttonVariants({ variant: "ghost", size: "icon", className: cn("relative", className) }))}
      label={t("user.toggleTheme")}
    />
  );
}
