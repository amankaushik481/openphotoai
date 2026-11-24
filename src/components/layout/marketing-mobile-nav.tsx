import { buttonVariants } from "@/components/ui/button";
import { MarketingMobileNavTrigger } from "@/components/layout/marketing-mobile-nav-trigger";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Mobile menu button for the marketing header. Classes and label are resolved here (server side), and
 * the Radix sheet itself is loaded on first use (`MarketingMobileNavTrigger`), so the static marketing
 * pages only hydrate a plain <button>.
 */
export function MarketingMobileNav() {
  return (
    <MarketingMobileNavTrigger
      className={cn(buttonVariants({ variant: "ghost", size: "icon", className: "md:hidden" }))}
      label={t("nav.openMenu")}
    />
  );
}
