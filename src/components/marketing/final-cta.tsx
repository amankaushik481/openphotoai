import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { GithubIcon } from "@/components/layout/icons";
import { APP } from "@/config/app";

export function FinalCta({
  title = "Meet your AI photographer.",
  lead = "Free drafts, honest credits, and photos that look like you. Or run the whole thing on your own server.",
}: {
  title?: string;
  lead?: string;
}) {
  return (
    <section aria-labelledby="cta-title" className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="grain relative overflow-hidden rounded-3xl bg-brand-gradient px-6 py-16 text-center text-white shadow-[0_30px_80px_-40px_var(--brand-magenta)] sm:px-12 sm:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/15 blur-3xl"
        />
        <h2 id="cta-title" className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-white/90 sm:text-lg">{lead}</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-6 text-base font-semibold text-neutral-950 shadow-sm transition hover:bg-white/90 focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none sm:w-auto"
          >
            Create your photos
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
          <a
            href={APP.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/50 px-6 text-base font-medium text-white transition hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none sm:w-auto"
          >
            <GithubIcon className="size-4" />
            Self-host it
          </a>
        </div>
      </div>
    </section>
  );
}
