import type { Metadata } from "next";
import Link from "next/link";

import { Leader, Masthead, PAGE } from "@/components/marketing/print-page";
import { LegalTemplateNotice } from "@/components/marketing/legal-document";
import { APP } from "@/config/app";
import { toPlainText } from "@/content/inline";
import { getLegalDocument, LEGAL_LAST_UPDATED, LEGAL_PAGES } from "@/content/legal";
import { marketingMetadata } from "@/content/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = marketingMetadata({
  title: "Legal",
  description: `${APP.name}'s Terms of Service, Privacy Policy and Acceptable Use Policy, including refunds, biometric data and the takedown process.`,
  path: "/legal",
});

export default function LegalIndexPage() {
  return (
    <>
      <Masthead
        section="Legal"
        meta={
          <>
            Updated <time dateTime={LEGAL_LAST_UPDATED}>{LEGAL_LAST_UPDATED}</time>
          </>
        }
        title="The fine print, in full."
        lead={`Everything that governs using ${APP.name}, each with a summary in plain words first.`}
      />
      <div className={cn(PAGE, "mt-12 pb-20 sm:mt-16 sm:pb-28 lg:grid lg:grid-cols-12 lg:gap-10")}>
        <div className="lg:col-span-8 lg:col-start-4">
          <LegalTemplateNotice />
          <ol className="mt-10 border-t border-foreground">
            {LEGAL_PAGES.map((p, i) => {
              const doc = getLegalDocument(p.slug);
              return (
                <li key={p.slug} className="border-b border-border">
                  <Link href={p.href} className="group block py-6 [--focus-offset:-2px]">
                    <span className="flex items-baseline gap-4">
                      <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="font-display text-4xl leading-none decoration-safelight-ink decoration-2 underline-offset-[6px] group-hover:underline sm:text-5xl">
                        {p.title}
                      </span>
                      <Leader className="hidden sm:block" />
                      <span className="mono-caps hidden shrink-0 text-muted-foreground sm:inline">
                        {doc.sections.length} sections
                      </span>
                    </span>
                    <span className="mt-3 block max-w-[62ch] pl-7 text-sm text-pretty text-muted-foreground sm:pl-8">
                      {toPlainText(doc.summary)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </>
  );
}
