"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/react";

/** Errors inside /app keep the app shell (sidebar/nav) instead of the root error page. */
export default function AppErrorPage({ error, retry }: { error: unknown; reset: () => void; retry: () => void }) {
  const t = useT();
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="font-display text-3xl">{t("pages.errorTitle")}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{t("pages.errorBody")}</p>
      {digest && <p className="mt-2 font-mono text-xs text-muted-foreground">{t("pages.errorRef", { digest })}</p>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => retry()}>
          <RotateCwIcon />
          {t("common.retry")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/app">{t("nav.dashboard")}</Link>
        </Button>
      </div>
    </div>
  );
}
