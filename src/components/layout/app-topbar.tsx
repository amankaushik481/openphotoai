import Link from "next/link";
import { ApertureIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreditBadge } from "@/components/app/credit-badge";
import { AppFolio } from "@/components/layout/app-folio";
import { Logo } from "@/components/layout/logo";
import { UserMenu, type ShellUser } from "@/components/layout/user-menu";
import { t } from "@/i18n";

/** Top bar: wordmark + balance on phones; a folio line, the safelight Create action and the account menu on desktop. */
export function AppTopbar({ user }: { user: ShellUser }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/88 supports-[backdrop-filter]:backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 md:h-16 lg:px-8">
        <Logo href="/app" className="md:hidden" />
        <AppFolio />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Button asChild variant="brand" size="sm" className="hidden md:inline-flex">
            <Link href="/app/create">
              <ApertureIcon />
              {t("nav.create")}
            </Link>
          </Button>
          <CreditBadge className="md:hidden" />
          <UserMenu user={user} shortcuts />
        </div>
      </div>
    </header>
  );
}
