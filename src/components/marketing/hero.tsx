import Link from "next/link";
import { ArrowRightIcon, BadgeCheckIcon, Undo2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DemoLoginButton } from "@/components/demo/demo-login-button";
import { GithubIcon } from "@/components/layout/icons";
import { PortraitArt, type PortraitHair } from "@/components/marketing/portrait-art";
import { APP } from "@/config/app";
import { cn } from "@/lib/utils";

interface Frame {
  label: string;
  colors: [string, string];
  hair: PortraitHair;
  tilt: number;
  light: number;
  score: number;
  /** Below the likeness threshold: hidden from the gallery and refunded. */
  refunded?: boolean;
}

const FRAMES: Frame[] = [
  { label: "LinkedIn", colors: ["#1d4ed8", "#38bdf8"], hair: "short", tilt: -3, light: 34, score: 97 },
  { label: "Golden hour", colors: ["#c2410c", "#fbbf24"], hair: "long", tilt: 4, light: 124, score: 95 },
  { label: "Paris", colors: ["#9d174d", "#f472b6"], hair: "bun", tilt: -2, light: 46, score: 93 },
  { label: "Old money", colors: ["#14532d", "#a8a29e"], hair: "short", tilt: 2, light: 118, score: 96 },
  {
    label: "Neon night",
    colors: ["#6d28d9", "#06b6d4"],
    hair: "curly",
    tilt: -6,
    light: 30,
    score: 64,
    refunded: true,
  },
  { label: "Studio B&W", colors: ["#1c1917", "#78716c"], hair: "long", tilt: 1, light: 112, score: 94 },
];

export function Hero() {
  const kept = FRAMES.filter((f) => !f.refunded).length;
  return (
    <section aria-labelledby="hero-title" className="grain relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 h-[34rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.16] blur-3xl dark:opacity-25"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <a
            href={APP.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-7 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-3.5" />
            Open source · MIT · self-hostable
          </a>
          <h1
            id="hero-title"
            className="font-display text-[3.25rem] leading-[0.98] tracking-tight sm:text-7xl lg:text-[5.25rem]"
          >
            Your AI photographer.
            <br />
            <span className="text-brand-gradient pr-1 italic">Open source.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            Take a live selfie, add a few photos, and get studio-quality headshots, dating photos, travel shots and
            videos that actually look like you. Shots that miss on likeness are refunded automatically.
          </p>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
              <Link href="/login">
                Create your photos
                <ArrowRightIcon />
              </Link>
            </Button>
            {/* Static page: the island asks the server whether DEMO_MODE is on and stays hidden otherwise. */}
            <DemoLoginButton probe />
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href={APP.githubUrl} target="_blank" rel="noopener noreferrer">
                <GithubIcon className="size-4" />
                Self-host it
              </a>
            </Button>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Free drafts <span aria-hidden="true">·</span> No subscription needed <span aria-hidden="true">·</span> Pack
            credits never expire
          </p>
        </div>

        <figure className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div className="rounded-2xl border bg-card/90 p-3 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.45)] sm:p-4 lg:rotate-[1.25deg]">
            <div className="mb-3 flex items-center justify-between gap-3 px-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              <span>Contact sheet · You</span>
              <span className="inline-flex items-center gap-1 text-foreground">
                <BadgeCheckIcon aria-hidden="true" className="size-3.5 text-success" />
                Best shots first
              </span>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:gap-3">
              {FRAMES.map((frame, i) => (
                <li key={frame.label}>
                  <div
                    className="grain relative aspect-[4/5] overflow-hidden rounded-lg ring-1 ring-black/5"
                    style={{
                      backgroundImage: `linear-gradient(150deg, ${frame.colors[0]} 0%, ${frame.colors[1]} 100%)`,
                    }}
                  >
                    <PortraitArt hair={frame.hair} tilt={frame.tilt} light={frame.light} />
                    <span className="absolute top-1.5 left-1.5 font-mono text-[10px] text-white/85">
                      {String(i + 1).padStart(2, "0")}A
                    </span>
                    {frame.refunded && (
                      <div className="absolute inset-0 flex items-end justify-center bg-background/60 p-1.5 backdrop-grayscale">
                        <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-foreground shadow-xs">
                          <Undo2Icon aria-hidden="true" className="size-3" />
                          Refunded
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-1 px-0.5 text-[11px] leading-none">
                    <span className="truncate text-muted-foreground">{frame.label}</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        frame.refunded ? "text-muted-foreground line-through" : "font-medium text-success",
                      )}
                    >
                      {frame.score}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <figcaption className="mt-4 text-center text-xs text-muted-foreground lg:text-left">
            Illustration: {kept} shots kept, 1 below the likeness threshold hidden and its credits refunded.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
