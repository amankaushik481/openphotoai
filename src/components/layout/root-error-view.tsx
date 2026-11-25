"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCwIcon } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { LostFrame } from "@/components/layout/lost-frame";
import { Button } from "@/components/ui/button";
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

/**
 * Body of the root error boundary (`app/error.tsx`), loaded only when an error is shown: a frame that
 * fogged in the developer, the reference to quote, and the ways forward.
 */
export function RootErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  const digest =
    error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AuthShell width="xl" label="Darkroom · frame damaged">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <figure className="lg:col-span-7">
          <LostFrame variant="fogged" frame="500" className="shadow-print" />
          <figcaption className="mono-caps mt-4 flex justify-between gap-4 text-muted-foreground">
            <span>▸ 500 · fogged in the developer</span>
            {digest && <span className="hidden sm:inline">Ref. {digest}</span>}
          </figcaption>
        </figure>
        <div className="lg:col-span-5">
          <p className="mono-caps text-safelight-ink">Error · frame damaged</p>
          <h1 className="mt-3 font-display text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.92] tracking-[-0.02em] text-balance">
            {t("pages.errorTitle")}
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">{t("pages.errorBody")}</p>
          {digest && (
            <p className="mt-4 inline-block border-l-2 border-foreground py-0.5 pl-3 font-mono text-xs text-muted-foreground">
              {t("pages.errorRef", { digest })}
            </p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => {
                if (retrying) return;
                setRetrying(true);
                retry();
                // The boundary unmounts this view on success; re-enable if the error comes straight back.
                window.setTimeout(() => setRetrying(false), 1500);
              }}
              variant="brand"
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
          <p className="mt-8 max-w-md border-t border-border pt-4 text-sm text-muted-foreground">
            Keeps happening?{" "}
            <a
              href={supportMailto(digest, "")}
              // The page path is added on click (reading `location` while rendering would mismatch the server HTML).
              onClick={(e) => {
                e.currentTarget.href = supportMailto(digest, window.location.pathname);
              }}
              className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-safelight-ink"
            >
              Email support
            </a>{" "}
            {digest ? "with the reference above" : "and tell us what you were doing"}, and we&apos;ll look into it.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
