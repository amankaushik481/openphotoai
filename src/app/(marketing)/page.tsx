/**
 * TEMPORARY minimal hero — the landing workstream replaces this page.
 */
import Link from "next/link";
import { ArrowRightIcon, ShieldCheckIcon, SparklesIcon, ZapIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/layout/icons";
import { APP } from "@/config/app";

const POINTS = [
  { icon: ZapIcon, title: "Instant or trained", body: "Preview in seconds, or train for best likeness." },
  { icon: ShieldCheckIcon, title: "Consent-verified", body: "Live selfie check. Adults only. Real deletion." },
  { icon: SparklesIcon, title: "Honest credits", body: "Failed or weak shots are refunded automatically." },
];

export default function HomePage() {
  return (
    <section className="grain relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-20 blur-3xl dark:opacity-25"
      />
      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pt-20 pb-24 text-center sm:px-6 sm:pt-28 sm:pb-32">
        <a
          href={APP.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-8 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:text-foreground"
        >
          <GithubIcon className="size-3.5" />
          Open source · MIT · self-hostable
        </a>
        <h1 className="font-display text-5xl leading-[1.02] tracking-tight sm:text-7xl">
          Your AI photographer.
          <br />
          <span className="text-brand-gradient italic">Open source.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">{APP.description}</p>
        <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
            <Link href="/app">
              Create your photos
              <ArrowRightIcon />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
            <Link href="/packs">Browse packs</Link>
          </Button>
        </div>
        <ul className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border bg-card/70 p-5 shadow-xs">
              <Icon aria-hidden="true" className="mb-3 size-5 text-primary" />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
