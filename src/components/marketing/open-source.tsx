import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";

import { GithubIcon } from "@/components/layout/icons";
import { MarketingSection } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { APP } from "@/config/app";
import { MODELS } from "@/config/models";

/** Landing section: open source and self-hosting, with honest facts only (no stars or user counts). */
export function OpenSource({ packCount }: { packCount: number }) {
  const facts = [
    "MIT-licensed: the app, safety system, billing, packs and API",
    `Bring your own fal.ai or Replicate key and pay list price, about $${MODELS.fal.generate.costUsd.toFixed(3)} per photo, with zero markup`,
    "Mock mode runs every feature with zero API keys, so you can try it first",
    `${packCount} packs as open JSON files, plus a REST API with an OpenAPI 3.1 spec`,
    "The same consent, age and content checks, which can't be switched off",
  ];
  const repo = APP.githubUrl.replace(/\/$/, "");
  return (
    <MarketingSection labelledBy="oss-title">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col items-start">
          <p className="font-mono text-xs font-medium tracking-[0.18em] text-brand-soft-foreground uppercase">
            Open source
          </p>
          <h2 id="oss-title" className="mt-3 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            Run your own studio. <span className="italic">Keep the keys.</span>
          </h2>
          <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
            Use the hosted app, or run the exact same code on your own server: for yourself, your team or your own
            business.
          </p>
          <ul className="mt-6 flex flex-col gap-3 text-sm">
            {facts.map((fact) => (
              <li key={fact} className="flex gap-3">
                <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href={APP.githubUrl} target="_blank" rel="noopener noreferrer">
                <GithubIcon className="size-4" />
                View on GitHub
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
              <Link href="/docs">
                Self-hosting guide
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
        <figure className="min-w-0">
          <div className="overflow-hidden rounded-2xl border bg-neutral-950 text-neutral-100 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.5)] dark:border-white/10">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="ml-2 font-mono text-[11px] text-white/60">terminal</span>
            </div>
            {/* Wrapped, not scrolled: the clone URL is long and there's no hidden overflow to reach. */}
            <pre className="p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] sm:p-5 sm:text-[13px]">
              <code>
                <span className="text-white/50">$ </span>git clone {repo}.git openshoot{"\n"}
                <span className="text-white/50">$ </span>cd openshoot && cp .env.example .env{"\n"}
                <span className="text-white/50">$ </span>docker compose up --build{"\n"}
                <span className="text-emerald-300">✓</span> app, worker, Postgres and storage running{"\n"}
                <span className="text-white/50">→ </span>http://localhost:3000
              </code>
            </pre>
          </div>
          <figcaption className="mt-3 text-xs text-muted-foreground">
            Docker Compose on one machine, or Vercel with any Postgres. Add your provider keys when you&apos;re ready.
          </figcaption>
        </figure>
      </div>
    </MarketingSection>
  );
}
