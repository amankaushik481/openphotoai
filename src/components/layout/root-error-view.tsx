"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { APP } from "@/config/app";
import { useT } from "@/i18n/react";

/** mailto: link to support, pre-filled with the error reference so the report can be matched to server logs. */
export function supportMailto(digest: string, page: string): string {
  const subject = digest ? `Error ${digest} on ${APP.name}` : `Error on ${APP.name}`;
  const body = [
    "What were you doing when this happened?",
    "",
    "",
    "---",
    ...(page ? [`Page: ${page}`] : []),
    ...(digest ? [`Reference: ${digest}`] : []),
  ].join("\n");
  return `mailto:${APP.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Body of the root error boundary (`app/error.tsx`), loaded only when an error is shown. */
export function RootErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  const digest =
    error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-[70dvh] flex-col items-center justify-center px-4 py-16 text-center">
      <Logo className="mb-10" />
      <h1 className="font-display text-4xl">{t("pages.errorTitle")}</h1>
      <p className="mt-3 max-w-md text-muted-foreground">{t("pages.errorBody")}</p>
      {digest && <p className="mt-2 font-mono text-xs text-muted-foreground">{t("pages.errorRef", { digest })}</p>}
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button
          onClick={() => {
            if (retrying) return;
            setRetrying(true);
            retry();
            // The boundary unmounts this view on success; re-enable if the error comes straight back.
            window.setTimeout(() => setRetrying(false), 1500);
          }}
          size="lg"
          aria-disabled={retrying || undefined}
        >
          <RotateCwIcon className={retrying ? "animate-spin motion-reduce:animate-none" : undefined} />
          {t("common.retry")}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/">{t("common.goHome")}</Link>
        </Button>
      </div>
      <p className="mt-8 max-w-md text-sm text-muted-foreground">
        Keeps happening?{" "}
        <a
          href={supportMailto(digest, "")}
          // The page path is added on click (reading `location` while rendering would mismatch the server HTML).
          onClick={(e) => {
            e.currentTarget.href = supportMailto(digest, window.location.pathname);
          }}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Email support
        </a>{" "}
        {digest ? "with the reference above" : "and tell us what you were doing"}, and we&apos;ll look into it.
      </p>
    </main>
  );
}
