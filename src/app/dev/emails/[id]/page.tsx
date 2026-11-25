import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDevEmail, isDevMailboxEnabled } from "@/server/email/dev-mailbox";
import { formatTime, STATUS_STYLES } from "../format";

export const metadata: Metadata = {
  title: "Dev mailbox",
  robots: { index: false, follow: false },
};

export default async function DevEmailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  if (!isDevMailboxEnabled()) notFound();
  const { id } = await params;
  const email = await getDevEmail(id);
  if (!email) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <Link href="/dev/emails" className="text-sm text-safelight-ink underline underline-offset-4">
        ← All emails
      </Link>

      <h1 className="mt-4 font-display text-3xl leading-tight tracking-tight break-words sm:text-4xl">{email.subject}</h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">To</dt>
        <dd className="break-all">{email.to}</dd>
        <dt className="text-muted-foreground">Template</dt>
        <dd className="font-mono">{email.template}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <span className={`border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${STATUS_STYLES[email.status] ?? ""}`}>{email.status}</span>
        </dd>
        <dt className="text-muted-foreground">Time</dt>
        <dd>
          <time dateTime={email.createdAt.toISOString()}>{formatTime(email.createdAt)}</time>
        </dd>
        {email.error ? (
          <>
            <dt className="text-muted-foreground">Error</dt>
            <dd className="text-destructive">{email.error}</dd>
          </>
        ) : null}
      </dl>

      <section aria-labelledby="links-heading" className="mt-8">
        <h2 id="links-heading" className="mono-caps text-foreground">
          Links
        </h2>
        {email.links.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">This email has no links.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {email.links.map((link, i) => (
              <li key={link} className="text-sm">
                <a
                  href={link}
                  rel="noreferrer"
                  className="break-all text-safelight-ink underline underline-offset-4"
                  data-testid={i === 0 ? "primary-link" : undefined}
                >
                  {link}
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="preview-heading" className="mt-8">
        <h2 id="preview-heading" className="mono-caps text-foreground">
          HTML preview
        </h2>
        <iframe
          title={`Email preview: ${email.subject}`}
          srcDoc={email.html}
          sandbox=""
          className="mt-2 h-[70vh] w-full border border-foreground/15 bg-[#fbf8f2]"
        />
      </section>

      <details className="mt-8 border border-foreground/15 p-4">
        <summary className="mono-caps cursor-pointer text-foreground">Plain-text version</summary>
        <pre className="mt-3 text-sm break-words whitespace-pre-wrap">{email.text || "(empty)"}</pre>
      </details>
    </main>
  );
}
