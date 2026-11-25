/**
 * The /docs/api page body: guides (auth, rate limits, idempotency, errors, job lifecycle, quickstart)
 * plus an endpoint + schema reference generated from the OpenAPI document. Server component.
 */
import Link from "next/link";

import { RATE_LIMITS } from "@/config/rate-limits";
import { apiPlanNames, errorCodeTable, V1_BASE_PATH } from "@/server/openapi/spec";
import type { HttpMethod, OpenApiDocument, OperationObject } from "@/server/openapi/types";
import { JOB_STATUSES, type JobStatus } from "@/types/domain";
import { CodeTabs } from "./code-tabs";
import { Endpoint } from "./endpoint";
import { CodeBlock, DocTable, InlineMarkdown, MethodBadge, schemaAnchor } from "./primitives";
import { quickstartSamples } from "./quickstart";
import { SchemaTable } from "./schema-table";

const JOB_STATUS_DOCS: Record<JobStatus, string> = {
  queued: "Accepted and charged; not yet submitted to the AI provider (usually skipped).",
  running: "Submitted to the AI provider. `progress` is a best-effort percentage.",
  succeeded: "Done. Results are in `media` (best shots first).",
  failed: "The provider or processing failed. Credits refunded; `error` explains why.",
  canceled: "Canceled by you (or the provider). Credits refunded.",
  blocked: "Every output was blocked by the safety filter. Credits refunded.",
};

const GUIDES = [
  { id: "overview", title: "Overview" },
  { id: "authentication", title: "Authentication" },
  { id: "quickstart", title: "Quickstart" },
  { id: "jobs", title: "Jobs & polling" },
  { id: "idempotency", title: "Idempotency" },
  { id: "rate-limits", title: "Rate limits" },
  { id: "errors", title: "Errors" },
] as const;

interface EndpointEntry {
  path: string;
  method: HttpMethod;
  op: OperationObject;
}

function groupByTag(doc: OpenApiDocument): { tag: string; description: string; endpoints: EndpointEntry[] }[] {
  const entries: EndpointEntry[] = Object.entries(doc.paths).flatMap(([path, item]) =>
    (Object.entries(item) as [HttpMethod, OperationObject][]).map(([method, op]) => ({ path, method, op })),
  );
  return doc.tags
    .map((t) => ({
      tag: t.name,
      description: t.description,
      endpoints: entries.filter((e) => e.op.tags[0] === t.name),
    }))
    .filter((g) => g.endpoints.length > 0);
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 font-display text-3xl tracking-tight sm:text-4xl">
      {children}
    </h2>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>;
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

function Toc({ groups, schemaNames }: { groups: ReturnType<typeof groupByTag>; schemaNames: string[] }) {
  const link = "block rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  return (
    <nav aria-label="API documentation" className="text-sm">
      <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-foreground uppercase">Guides</p>
      <ul>
        {GUIDES.map((g) => (
          <li key={g.id}>
            <a href={`#${g.id}`} className={link}>
              {g.title}
            </a>
          </li>
        ))}
      </ul>
      {groups.map((g) => (
        <div key={g.tag} className="mt-4">
          <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-foreground uppercase">{g.tag}</p>
          <ul>
            {g.endpoints.map((e) => (
              <li key={e.op.operationId}>
                <a href={`#${e.op.operationId}`} className={`${link} flex items-center gap-2`}>
                  <MethodBadge method={e.method} className="px-1 py-0 text-[10px]" />
                  <span className="truncate">{e.op.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-4 px-2 pb-1 text-xs font-semibold tracking-wide text-foreground uppercase">Reference</p>
      <ul>
        <li>
          <a href="#schemas" className={link}>
            Schemas ({schemaNames.length})
          </a>
        </li>
        <li>
          <a href={`${V1_BASE_PATH}/openapi.json`} className={link}>
            openapi.json
          </a>
        </li>
      </ul>
    </nav>
  );
}

export function ApiDocs({ spec }: { spec: OpenApiDocument }) {
  const baseUrl = spec.servers[0]!.url;
  const origin = baseUrl.slice(0, -V1_BASE_PATH.length);
  const plans = apiPlanNames();
  const groups = groupByTag(spec);
  const schemaNames = Object.keys(spec.components.schemas).sort((a, b) => a.localeCompare(b));
  const apiLimit = RATE_LIMITS.apiPerMinute;
  const samples = quickstartSamples(baseUrl, `${origin}/app/api-keys`);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-8">
          <Toc groups={groups} schemaNames={schemaNames} />
        </div>
      </aside>

      <article className="min-w-0">
        <header>
          <p className="text-sm font-medium text-primary">API reference · v{spec.info.version}</p>
          <h1 className="mt-2 font-display text-5xl tracking-tight sm:text-6xl">{spec.info.title}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Create photos, edits and videos of yourself from your own code: the same jobs, packs and credits as the web
            app, over a small JSON REST API.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <a
              href={`${V1_BASE_PATH}/openapi.json`}
              className="inline-flex items-center rounded-md border bg-card px-3 py-1.5 font-medium shadow-xs hover:bg-accent"
            >
              OpenAPI 3.1 spec
            </a>
            <Link
              href="/app/api-keys"
              className="inline-flex items-center rounded-md border bg-card px-3 py-1.5 font-medium shadow-xs hover:bg-accent"
            >
              Get an API key
            </Link>
          </div>
        </header>

        <details className="mt-8 rounded-lg border bg-card p-3 lg:hidden">
          <summary className="cursor-pointer text-sm font-medium">On this page</summary>
          <div className="mt-3">
            <Toc groups={groups} schemaNames={schemaNames} />
          </div>
        </details>

        <div className="mt-12 space-y-16">
          <section aria-labelledby="overview">
            <H2 id="overview">Overview</H2>
            <Prose>
              <p>
                Base URL: <C>{baseUrl}</C>. Requests and responses are JSON (UTF-8); dates are ISO 8601 strings; ids are
                opaque strings like <C>job_…</C>. Lists are newest first and paginated with an opaque <C>nextCursor</C>{" "}
                — pass it back as <C>?cursor=</C> until it is <C>null</C>.
              </p>
              <p>
                Identity models are created and trained in the web app (consent selfie + photos). Everything you can
                create from them — photos, packs, batches, edits, upscales, videos — is available here.
              </p>
            </Prose>
          </section>

          <section aria-labelledby="authentication">
            <H2 id="authentication">Authentication</H2>
            <Prose>
              <p>
                Create a key on the{" "}
                <Link href="/app/api-keys" className="text-primary underline underline-offset-2">
                  API keys
                </Link>{" "}
                page. API access is included in the {plans.join(" and ")} plans; keys of accounts on other plans are
                refused with <C>403 plan_limit</C>. Keys are shown once — store them as secrets, never in client-side
                code. Send the key as a Bearer token:
              </p>
            </Prose>
            <div className="mt-4">
              <CodeBlock label="HTTP header" code="Authorization: Bearer os_live_..." />
            </div>
            <div className="mt-4">
              <DocTable caption="API key scopes" head={["Scope", "Grants"]}>
                {[
                  ["*", "Everything (default for new keys)."],
                  ["read", "GET endpoints: models, jobs, batches, media, packs, credits."],
                  ["generate", "Creating and canceling jobs and batches (spends credits)."],
                ].map(([scope, grants]) => (
                  <tr key={scope}>
                    <td>
                      <C>{scope}</C>
                    </td>
                    <td className="text-muted-foreground">{grants}</td>
                  </tr>
                ))}
              </DocTable>
            </div>
            <Prose>
              <p>
                A key without the scope an endpoint needs gets <C>403 forbidden</C>. A missing, invalid or revoked key
                gets <C>401 unauthorized</C>. Revoke a key any time; it stops working immediately.
              </p>
            </Prose>
          </section>

          <section aria-labelledby="quickstart">
            <H2 id="quickstart">Quickstart: create → poll → download</H2>
            <Prose>
              <p>
                Pick a ready model, start a job, poll it until it finishes, then download the results from their signed
                URLs.
              </p>
            </Prose>
            <div className="mt-4">
              <CodeTabs samples={samples} label="Quickstart language" />
            </div>
          </section>

          <section aria-labelledby="jobs">
            <H2 id="jobs">Jobs & polling</H2>
            <Prose>
              <p>
                Jobs are asynchronous. <C>POST /jobs</C> validates the request, runs the safety checks, charges the
                credits and submits the job, then returns it (usually <C>running</C>). Poll <C>GET /jobs/{"{id}"}</C>{" "}
                every 2–5 seconds — each poll also checks the AI provider when the job&apos;s last check is stale, so
                polling alone drives a job to completion. Photos typically take 5–30 seconds, videos a few minutes.
              </p>
              <p>
                <strong className="text-foreground">Webhooks:</strong> outgoing webhooks to your server aren&apos;t
                available in v1; poll instead (for many jobs, <C>GET /jobs?ids=a,b,c</C> or <C>GET /batches/{"{id}"}</C>{" "}
                checks them in one request). Signed media URLs expire — fetch the job or media again for fresh ones.
              </p>
            </Prose>
            <div className="mt-4">
              <DocTable caption="Job statuses" head={["Status", "Meaning"]}>
                {JOB_STATUSES.map((s) => (
                  <tr key={s}>
                    <td className="whitespace-nowrap">
                      <C>{s}</C>
                    </td>
                    <td className="text-muted-foreground">
                      <InlineMarkdown text={JOB_STATUS_DOCS[s]} />
                    </td>
                  </tr>
                ))}
              </DocTable>
            </div>
            <Prose>
              <p>
                Credits are refunded automatically for failed, canceled and blocked jobs, and proportionally for outputs
                the safety filter blocked (<C>blockedCount</C>) or the provider didn&apos;t return. Check{" "}
                <C>creditsCharged</C> / <C>creditsRefunded</C> on the job, or <C>GET /credits</C>.
              </p>
            </Prose>
          </section>

          <section aria-labelledby="idempotency">
            <H2 id="idempotency">Idempotency</H2>
            <Prose>
              <p>
                Network errors happen. Send an <C>Idempotency-Key</C> header (any unique string up to 200 printable
                ASCII characters, e.g. a UUID) with <C>POST /jobs</C>: retrying with the same key returns the original
                job instead of creating — and charging for — a second one, even if the first request is still in flight.
                Keys are scoped to your account and never expire, so use a new key for each new job.
              </p>
            </Prose>
          </section>

          <section aria-labelledby="rate-limits">
            <H2 id="rate-limits">Rate limits</H2>
            <Prose>
              <p>
                Each key may make {apiLimit.limit} requests per {apiLimit.windowSec} seconds. Every response carries{" "}
                <C>X-RateLimit-Limit</C>, <C>X-RateLimit-Remaining</C> and <C>X-RateLimit-Reset</C> (Unix seconds). Over
                a limit you get <C>429 rate_limited</C> with a <C>Retry-After</C> header — wait that many seconds.
              </p>
              <p>
                Job creation also counts toward per-account limits shared with the web app:{" "}
                {RATE_LIMITS.jobsPerMinute.limit} jobs per minute,{" "}
                {RATE_LIMITS.jobsPerDay.limit.toLocaleString("en-US")} per day, {RATE_LIMITS.batchesPerHour.limit}{" "}
                batches per hour, {RATE_LIMITS.draftsPerDay.limit} free drafts per day (
                {RATE_LIMITS.draftsPerDayFree.limit} before your first purchase), plus your plan&apos;s concurrent-job
                limit (<C>403 plan_limit</C>).
              </p>
            </Prose>
          </section>

          <section aria-labelledby="errors">
            <H2 id="errors">Errors</H2>
            <Prose>
              <p>Errors use HTTP status codes and always have the same JSON body:</p>
            </Prose>
            <div className="mt-4">
              <CodeBlock
                label="Error body"
                language="json"
                code={JSON.stringify(
                  {
                    error: {
                      code: "insufficient_credits",
                      message: "This needs 4 credits; you have 1.",
                      details: { needed: 4, balance: 1 },
                    },
                  },
                  null,
                  2,
                )}
              />
            </div>
            <div className="mt-4">
              <DocTable caption="Error codes" head={["Code", "Status", "Meaning"]}>
                {errorCodeTable().map((e) => (
                  <tr key={e.code}>
                    <td className="whitespace-nowrap">
                      <C>{e.code}</C>
                    </td>
                    <td className="font-mono text-xs">{e.status}</td>
                    <td className="text-muted-foreground">
                      <InlineMarkdown text={e.meaning} />
                    </td>
                  </tr>
                ))}
              </DocTable>
            </div>
          </section>

          <section aria-labelledby="endpoints">
            <H2 id="endpoints">Endpoints</H2>
            {groups.map((g) => (
              <div key={g.tag} className="mt-10">
                <h3 id={`tag-${g.tag.toLowerCase()}`} className="scroll-mt-24 text-2xl font-semibold tracking-tight">
                  {g.tag}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                <div className="mt-6 space-y-10">
                  {g.endpoints.map((e) => (
                    <Endpoint
                      key={e.op.operationId}
                      doc={spec}
                      path={e.path}
                      method={e.method}
                      op={e.op}
                      basePath={V1_BASE_PATH}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section aria-labelledby="schemas">
            <H2 id="schemas">Schemas</H2>
            <div className="mt-6 space-y-10">
              {schemaNames.map((name) => {
                const schema = spec.components.schemas[name]!;
                return (
                  <section
                    key={name}
                    id={schemaAnchor(name)}
                    aria-labelledby={`${schemaAnchor(name)}-title`}
                    className="scroll-mt-24"
                  >
                    <h3 id={`${schemaAnchor(name)}-title`} className="font-mono text-lg font-semibold">
                      {name}
                    </h3>
                    {schema.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        <InlineMarkdown text={schema.description} />
                      </p>
                    )}
                    {schema.oneOf ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        One of:{" "}
                        {schema.oneOf.map((v, i) => {
                          const target = v.$ref?.split("/").pop() ?? "";
                          return (
                            <span key={target}>
                              {i > 0 && ", "}
                              <a
                                href={`#${schemaAnchor(target)}`}
                                className="font-mono text-xs text-primary hover:underline"
                              >
                                {target}
                              </a>
                            </span>
                          );
                        })}
                      </p>
                    ) : (
                      <div className="mt-3">
                        <SchemaTable schema={schema} caption={`${name} fields`} />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
