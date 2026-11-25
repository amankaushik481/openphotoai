import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { CodeBlock, inlineCode } from "@/components/api-docs/primitives";
import { GithubIcon } from "@/components/layout/icons";
import { JsonLd } from "@/components/marketing/json-ld";
import { folio, MarginIndex, Masthead, PAGE } from "@/components/marketing/print-page";
import { APP } from "@/config/app";
import { marketingMetadata } from "@/content/site";
import { buildBreadcrumbJsonLd } from "@/content/structured-data";
import { cn } from "@/lib/utils";
import { PACK_CATEGORIES } from "@/types/pack";

export const metadata: Metadata = marketingMetadata({
  title: "Docs: self-hosting, packs and API",
  description: `Run ${APP.name} on your own server with Docker Compose or Vercel, bring your own AI provider keys, write photo packs as JSON, and automate everything with the API.`,
  path: "/docs",
});

const SECTIONS = [
  { id: "quickstart", title: "Quickstart" },
  { id: "going-live", title: "Going live" },
  { id: "safety", title: "Safety & responsibilities" },
  { id: "packs", title: "Pack format" },
  { id: "api", title: "API" },
];

const ENV_ROWS: [string, string][] = [
  ["NEXT_PUBLIC_APP_URL", "Public URL of your deployment (used in emails, auth callbacks and signed links)."],
  [
    "BETTER_AUTH_SECRET",
    "Long random string (32+ characters) that signs sessions (`openssl rand -hex 32`). The Docker image generates one if unset.",
  ],
  ["DATABASE_URL", "Any Postgres 14+ connection string (Docker, Neon, Supabase, RDS…)."],
  [
    "MOCK_PROVIDERS",
    "Local/demo only: set to `false` in production. A real AI provider requires real payments and email.",
  ],
  ["TRUSTED_PROXY_HOPS", "Number of reverse proxies in front of the app (1 behind nginx/Caddy; automatic on Vercel)."],
  [
    "AI_PROVIDER + FAL_KEY",
    "`fal` (default) with a fal.ai key, or `replicate` with REPLICATE_API_TOKEN and REPLICATE_OWNER.",
  ],
  [
    "FACE_PROVIDER / MODERATION_PROVIDER",
    "`local` runs on your server with no keys; Rekognition and OpenAI moderation are optional.",
  ],
  ["STORAGE_DRIVER + S3_*", "`s3` for any S3-compatible bucket (R2, S3, MinIO, B2). Keep the bucket private."],
  [
    "STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET",
    "Payments with Stripe Checkout; plans come from `src/config/plans.ts`, no dashboard setup.",
  ],
  ["RESEND_API_KEY + EMAIL_FROM", "Magic-link sign-in and notification emails."],
  ["CRON_SECRET", "Protects the job and maintenance cron endpoints."],
  [
    "NEXT_PUBLIC_LEGAL_ENTITY, …_JURISDICTION, …_SUPPORT_EMAIL, …_TAKEDOWN_EMAIL",
    "Fill the legal templates and contact addresses.",
  ],
];

const PACK_EXAMPLE = `{
  "slug": "rooftop-sunset",
  "name": "Rooftop Sunset",
  "tagline": "Warm city-rooftop portraits at golden hour.",
  "description": "Relaxed portraits on a city rooftop as the sun goes down…",
  "category": "lifestyle",
  "emoji": "🌇",
  "tags": ["sunset", "city", "rooftop"],
  "colors": ["#16140f", "#6b645a"],
  "defaultAspectRatio": "4:5",
  "prompts": [
    {
      "title": "Golden rim light",
      "prompt": "photo of {subject} on a city rooftop at sunset, warm rim light, 85mm, natural skin texture"
    }
  ]
}`;

function Code({ children }: { children: React.ReactNode }) {
  return <code className={inlineCode}>{children}</code>;
}

/** Shell and JSON listings on a darkroom surface, with a copy button. */
function Pre({ children, label, language = "bash" }: { children: string; label: string; language?: string }) {
  return <CodeBlock code={children} label={label} language={language} />;
}

/** Section heading: an ink rule, the mono section number, the title in the serif. */
function H2({ id, children }: { id: string; children: React.ReactNode }) {
  const no = SECTIONS.findIndex((s) => s.id === id) + 1;
  return (
    <h2
      id={`${id}-title`}
      className="flex items-baseline gap-3 border-t border-foreground pt-3 font-display text-4xl leading-tight text-foreground sm:text-5xl"
    >
      <span className="font-mono text-xs tracking-[0.12em] text-muted-foreground">§&nbsp;{folio(no)}</span>
      <span>{children}</span>
    </h2>
  );
}

const textLink =
  "font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-safelight-ink";

/** Renders `code` spans written with backticks in plain table copy. */
function WithCode({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/g)
        .map((part, i) =>
          part.startsWith("`") && part.endsWith("`") ? (
            <Code key={i}>{part.slice(1, -1)}</Code>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
    </>
  );
}

export default function DocsPage() {
  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Docs", path: "/docs" },
        ])}
      />
      <Masthead
        section="Docs · Self-hosting, packs and API"
        meta="MIT licensed"
        title="Run it yourself."
        lead={
          <>
            {APP.name} is one MIT-licensed Next.js app. Start it with zero API keys in mock mode, then plug in your own
            AI, storage, email and payment providers when you&apos;re ready.
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          <a
            href={APP.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-[3px] bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 pointer-coarse:h-11"
          >
            <GithubIcon className="size-4" />
            Source on GitHub
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <Link
            href="/docs/api"
            className="inline-flex h-10 items-center gap-2 rounded-[3px] border border-foreground/40 px-4 text-sm font-medium transition-colors hover:border-foreground hover:bg-accent pointer-coarse:h-11"
          >
            API reference
          </Link>
        </div>
      </Masthead>

      <div className={cn(PAGE, "mt-14 grid gap-10 pb-20 sm:mt-20 sm:pb-28 lg:grid-cols-12")}>
        <div className="lg:col-span-3">
          <MarginIndex
            label="On this page"
            heading="On this page"
            mobile="none"
            className="lg:sticky lg:top-24"
            items={SECTIONS.map((sec) => ({ href: `#${sec.id}`, label: sec.title }))}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-20 text-[0.975rem] leading-relaxed text-foreground/85 lg:col-span-9 lg:max-w-[50rem]">
          <section id="quickstart" aria-labelledby="quickstart-title" className="scroll-mt-24">
            <H2 id="quickstart">Quickstart</H2>
            <p className="mt-4">
              <strong className="font-semibold text-foreground">Docker Compose</strong> runs the app, a background
              worker, Postgres and S3-compatible storage on one machine:
            </p>
            <div className="mt-3">
              <Pre label="Docker Compose quickstart">{`git clone ${APP.githubUrl}.git openshoot
cd openshoot
cp .env.example .env
docker compose up --build`}</Pre>
            </div>
            <p className="mt-5">
              <strong className="font-semibold text-foreground">Or with Node 20+ and pnpm</strong>, using an embedded
              Postgres and local disk storage:
            </p>
            <div className="mt-3">
              <Pre label="pnpm quickstart">{`pnpm install
pnpm run setup
pnpm dev`}</Pre>
            </div>
            <p className="mt-5">
              Open <Code>http://localhost:3000</Code>. With <Code>MOCK_PROVIDERS=true</Code> (the default in{" "}
              <Code>.env.example</Code>) every provider is simulated: no keys, no cost, and emails appear at{" "}
              <Code>/dev/emails</Code>.
            </p>
          </section>

          <section id="going-live" aria-labelledby="going-live-title" className="scroll-mt-24">
            <H2 id="going-live">Going live</H2>
            <p className="mt-4">
              Every variable is validated at startup (<Code>pnpm check-env</Code> prints the result) and documented in{" "}
              <Code>.env.example</Code>. The ones that matter for production:
            </p>
            <div
              tabIndex={0}
              role="region"
              aria-label="Production environment variables"
              className="mt-5 overflow-x-auto border-y border-foreground [--focus-offset:-2px]"
            >
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <caption className="sr-only">Production environment variables</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="mono-caps py-2.5 pr-4 font-medium text-muted-foreground">
                      Variable
                    </th>
                    <th scope="col" className="mono-caps py-2.5 pr-4 font-medium text-muted-foreground">
                      What it does
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ENV_ROWS.map(([name, desc]) => (
                    <tr key={name} className="border-b border-border align-top last:border-0">
                      <th scope="row" className="py-2.5 pr-4 font-mono text-xs font-medium break-words text-foreground">
                        {name}
                      </th>
                      <td className="py-2.5 pr-4">
                        <WithCode text={desc} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5">
              Deploying to Vercel? Use a pooled Postgres URL, an S3-compatible bucket, and the bundled{" "}
              <Code>vercel.json</Code> crons. On a VPS, Docker Compose&apos;s <Code>worker</Code> service completes jobs
              without webhooks or cron.
            </p>
          </section>

          <section id="safety" aria-labelledby="safety-title" className="scroll-mt-24">
            <H2 id="safety">Safety &amp; responsibilities</H2>
            <ul className="mt-5 flex flex-col gap-3 [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:font-mono [&>li]:before:text-muted-foreground [&>li]:before:content-['–']">
              <li>
                Consent verification (live selfie + face match), adults-only checks, prompt filtering and output
                moderation are a core module with no off switch. Configuring a real AI provider refuses to start with
                mock safety providers.
              </li>
              <li>
                As an operator you are responsible for your deployment: publish terms and a privacy notice, set a
                monitored takedown address, handle reports from the moderation queue, and comply with biometric and
                privacy laws where you operate.
              </li>
              <li>
                The{" "}
                <Link href="/legal/terms" className={textLink}>
                  legal templates
                </Link>{" "}
                are filled from your <Code>NEXT_PUBLIC_LEGAL_*</Code> settings. They are templates: have a lawyer review
                them before launch.
              </li>
            </ul>
          </section>

          <section id="packs" aria-labelledby="packs-title" className="scroll-mt-24">
            <H2 id="packs">Pack format</H2>
            <p className="mt-4">
              A pack is one JSON file in <Code>packs/</Code>. Add a file, restart, and it appears in the gallery, the
              app and the API. Prompts use <Code>{"{subject}"}</Code>, <Code>{"{pronoun}"}</Code> and{" "}
              <Code>{"{possessive}"}</Code> placeholders, which are filled with the user&apos;s identity model. Each
              pack needs 6–60 prompts; optional <Code>promptMan</Code> / <Code>promptWoman</Code> variants, negative
              prompts and per-shot aspect ratios are supported.
            </p>
            <div className="mt-4">
              <Pre label="Example pack file" language="json">
                {PACK_EXAMPLE}
              </Pre>
            </div>
            <p className="mt-4">
              Categories:{" "}
              {PACK_CATEGORIES.map((c, i) => (
                <span key={c}>
                  <Code>{c}</Code>
                  {i < PACK_CATEGORIES.length - 1 ? ", " : "."}
                </span>
              ))}{" "}
              Validate your files with <Code>pnpm packs:validate</Code>.
            </p>
          </section>

          <section id="api" aria-labelledby="api-title" className="scroll-mt-24">
            <H2 id="api">API</H2>
            <p className="mt-4">
              Everything the app does is available over a REST API authenticated with API keys, described by an OpenAPI
              3.1 document at <Code>/api/v1/openapi.json</Code>.
            </p>
            <Link href="/docs/api" className={cn(textLink, "mt-5 inline-flex items-center gap-2")}>
              Read the API reference
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
