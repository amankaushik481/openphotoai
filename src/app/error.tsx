"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/react";

export default function ErrorPage({ error, retry }: { error: unknown; reset: () => void; retry: () => void }) {
  const t = useT();
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-[60dvh] flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-display text-4xl">{t("pages.errorTitle")}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{t("pages.errorBody")}</p>
      {digest && <p className="mt-2 font-mono text-xs text-muted-foreground">{t("pages.errorRef", { digest })}</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => retry()} size="lg">
          <RotateCwIcon />
          {t("common.retry")}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/">{t("common.goHome")}</Link>
        </Button>
      </div>
    </main>
  );
}
