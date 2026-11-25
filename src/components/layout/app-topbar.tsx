import Link from "next/link";
import { ApertureIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreditBadge } from "@/components/app/credit-badge";
import { Logo } from "@/components/layout/logo";
import { UserMenu, type ShellUser } from "@/components/layout/user-menu";
import { t } from "@/i18n";

export function AppTopbar({ user }: { user: ShellUser }) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-border/70">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 md:h-16 lg:px-8">
        <Logo href="/app" className="md:hidden" />
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="brand" size="sm" className="hidden md:inline-flex">
            <Link href="/app/create">
              <ApertureIcon />
              {t("nav.create")}
            </Link>
          </Button>
          <CreditBadge />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
