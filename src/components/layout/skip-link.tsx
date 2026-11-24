import { t } from "@/i18n";

/** First focusable element on every page: jumps keyboard users past the navigation. */
export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only z-[100] rounded-md bg-background px-4 py-2 text-sm font-medium shadow-lg ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      {t("app.skipToContent")}
    </a>
  );
}
