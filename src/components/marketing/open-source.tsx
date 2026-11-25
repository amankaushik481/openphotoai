import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";

import { GithubIcon } from "@/components/layout/icons";
import { Folio, SHELL } from "@/components/marketing/editorial";
import { APP } from "@/config/app";
import { MODELS } from "@/config/models";
import { cn } from "@/lib/utils";

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
    <section aria-labelledby="oss-title" className="border-t border-border py-20 sm:py-28 lg:py-36">
      <div className={cn(SHELL, "grid gap-y-14 lg:grid-cols-12 lg:gap-x-10")}>
        <div className="flex flex-col items-start lg:col-span-6">
          <Folio no="07" label="Self-host" />
          <h2
            id="oss-title"
            className="mt-6 font-display text-[clamp(2.9rem,8vw,5.5rem)] leading-[0.92] tracking-[-0.03em]"
          >
            Run your own studio. <span className="block italic">Keep the keys.</span>
          </h2>
          <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-pretty text-muted-foreground">
            Use the hosted app, or run the exact same code on your own server: for yourself, your team or your own
            business.
          </p>
          <ol className="mt-10 w-full max-w-[34rem] border-t border-border">
            {facts.map((fact, i) => (
              <li key={fact} className="grid grid-cols-[2.5rem_1fr] border-b border-border py-3.5 text-[0.9375rem]">
                <span className="mono-caps pt-1 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-pretty">{fact}</span>
              </li>
            ))}
          </ol>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3 text-[15px]">
            <a
              href={APP.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink sm:min-h-0"
            >
              <GithubIcon className="size-4" />
              View on GitHub
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center gap-2 font-medium underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-safelight-ink sm:min-h-0"
            >
              Self-hosting guide
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>

        {/* A lab ticket: the self-host kit, with the licence stamped on it. */}
        <figure className="relative min-w-0 lg:col-span-6 lg:pt-24 lg:pl-6">
          <div className="relative">
            <div className="print-paper relative rotate-[0.8deg] text-[#16140f] shadow-print">
              {/* Ticket notches. */}
              <span aria-hidden="true" className="absolute top-[4.25rem] -left-3 size-6 rounded-full bg-background" />
              <span aria-hidden="true" className="absolute top-[4.25rem] -right-3 size-6 rounded-full bg-background" />
              <div className="flex items-baseline justify-between gap-4 px-6 pt-6 pb-5 sm:px-8">
                <p className="font-mono text-[0.6875rem] font-medium tracking-[0.16em] uppercase">
                  {APP.name} · Self-host kit
                </p>
                <p className="font-mono text-[0.6875rem] tracking-[0.16em] uppercase">No. 0001</p>
              </div>
              <div aria-hidden="true" className="mx-4 border-t-2 border-dashed border-[#16140f]/25" />
              <div className="px-6 pt-5 pb-6 sm:px-8 sm:pb-8">
                <div className="bg-[#100e0b] text-[#e9e2d6]">
                  <p className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 font-mono text-[0.6875rem] tracking-[0.14em] text-[#b3aa9b] uppercase">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ec4d33]" />
                    Terminal
                  </p>
                  {/* Wrapped, not scrolled: the clone URL is long and there's no hidden overflow to reach. */}
                  <pre className="p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] sm:p-5 sm:text-[13px]">
                    <code>
                      <span className="text-[#b3aa9b]">$ </span>git clone {repo}.git openshoot{"\n"}
                      <span className="text-[#b3aa9b]">$ </span>cd openshoot && cp .env.example .env{"\n"}
                      <span className="text-[#b3aa9b]">$ </span>docker compose up --build{"\n"}
                      <span className="text-[#8fd0a4]">✓</span> app, worker, Postgres and storage running{"\n"}
                      <span className="text-[#b3aa9b]">→ </span>http://localhost:3000
                    </code>
                  </pre>
                </div>
                <p className="mt-4 pr-24 font-mono text-[0.6875rem] leading-relaxed tracking-[0.08em] uppercase sm:pr-32">
                  Docker Compose on one machine, or Vercel with any Postgres.
                </p>
              </div>
            </div>
            <MitStamp className="absolute -right-2 -bottom-14 w-28 rotate-[-12deg] sm:-right-5 sm:w-36" />
          </div>
          <figcaption className="mt-6 max-w-[calc(100%-9rem)] text-[0.9375rem] text-muted-foreground">
            Add your provider keys when you&apos;re ready.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/** A rubber stamp in safelight ink. Decorative (the licence is stated in the text). */
function MitStamp({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className={cn("text-safelight-ink opacity-90", className)}
    >
      <defs>
        <path id="stamp-ring" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="35" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text fill="currentColor" fontSize="9.5" letterSpacing="3.1" className="font-mono font-medium">
        <textPath href="#stamp-ring">OPEN SOURCE · SELF-HOSTABLE ·</textPath>
      </text>
      <text
        x="60"
        y="68"
        textAnchor="middle"
        fill="currentColor"
        fontSize="24"
        className="font-display"
        letterSpacing="1"
      >
        MIT
      </text>
    </svg>
  );
}
