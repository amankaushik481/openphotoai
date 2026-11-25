import { t } from "@/i18n";

/** First focusable element on every page: jumps keyboard users past the navigation. */
export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only z-[100] rounded-xs bg-foreground px-4 py-2.5 font-mono text-xs font-medium tracking-[0.14em] text-background uppercase focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {t("app.skipToContent")}
    </a>
  );
}
