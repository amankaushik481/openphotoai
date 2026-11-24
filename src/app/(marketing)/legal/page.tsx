import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { LegalTemplateNotice } from "@/components/marketing/legal-document";
import { toPlainText } from "@/content/inline";
import { getLegalDocument, LEGAL_PAGES } from "@/content/legal";

export const metadata: Metadata = {
  title: "Legal",
  description: "Terms of Service, Privacy Policy and Acceptable Use Policy.",
  alternates: { canonical: "/legal" },
};

export default function LegalIndexPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
      <LegalTemplateNotice />
      <h1 className="mt-10 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">Legal</h1>
      <ul className="mt-10 flex flex-col gap-4">
        {LEGAL_PAGES.map((p) => (
          <li key={p.slug}>
            <Link
              href={p.href}
              className="group flex items-start justify-between gap-4 rounded-2xl border bg-card p-6 shadow-xs transition-colors hover:border-primary/40"
            >
              <span>
                <span className="block text-lg font-semibold">{p.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {toPlainText(getLegalDocument(p.slug).summary)}
                </span>
              </span>
              <ArrowRightIcon
                aria-hidden="true"
                className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
