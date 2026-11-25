import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";

import { GithubIcon } from "@/components/layout/icons";
import { SHELL } from "@/components/marketing/editorial";
import { GreasePencil } from "@/components/marketing/grease-pencil";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

/** The closing frame: one huge line with its last word circled in grease pencil, and the way in. */
export function FinalCta({
  title = "The studio is open.",
  lead = "Free drafts, honest credits, and photos that look like you. Or run the whole thing on your own server.",
  primaryHref = "/login",
  primaryLabel = "Start shooting",
}: {
  title?: string;
  lead?: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  const cut = title.trimEnd().lastIndexOf(" ");
  const head = cut > 0 ? title.slice(0, cut + 1) : "";
  const last = cut > 0 ? title.slice(cut + 1) : title;
  return (
    <section aria-labelledby="cta-title" className="overflow-x-clip border-t border-border py-24 sm:py-32 lg:py-40">
      <div className={cn(SHELL, "reveal")}>
        <p className="mono-caps text-muted-foreground">
          Last frame <span aria-hidden="true">· ▸ 36</span>
        </p>
        <h2
          id="cta-title"
          className="mt-6 max-w-[14ch] font-display text-[clamp(3.5rem,13vw,10.5rem)] leading-[0.86] tracking-[-0.04em]"
        >
          {head}
          <span className="relative inline-block italic">
            {last}
            <GreasePencil
              mark="circle"
              variant={0}
              strokeWidth={1.3}
              className="absolute -top-[0.06em] -left-[0.14em] h-[1.08em] w-[calc(100%+0.3em)]"
            />
          </span>
        </h2>
        <div className="mt-12 grid gap-8 lg:grid-cols-12 lg:gap-x-10">
          <p className="max-w-[32rem] text-lg leading-relaxed text-pretty text-muted-foreground lg:col-span-5">
            {lead}
          </p>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7 lg:col-span-7 lg:justify-end">
            <Button asChild variant="brand" size="lg" className="h-12 rounded-[3px] px-6 text-[15px]">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
            <a
              href={APP.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink sm:min-h-0"
            >
              <GithubIcon className="size-4" />
              Self-host it
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
