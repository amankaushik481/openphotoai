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
      <Link href="/dev/emails" className="text-sm text-violet-700 underline-offset-4 hover:underline dark:text-violet-300">
        ← All emails
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight break-words">{email.subject}</h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-600 dark:text-zinc-400">To</dt>
        <dd className="break-all">{email.to}</dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Template</dt>
        <dd className="font-mono">{email.template}</dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Status</dt>
        <dd>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[email.status] ?? ""}`}>{email.status}</span>
        </dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Time</dt>
        <dd>
          <time dateTime={email.createdAt.toISOString()}>{formatTime(email.createdAt)}</time>
        </dd>
        {email.error ? (
          <>
            <dt className="text-zinc-600 dark:text-zinc-400">Error</dt>
            <dd className="text-red-700 dark:text-red-400">{email.error}</dd>
          </>
        ) : null}
      </dl>

      <section aria-labelledby="links-heading" className="mt-8">
        <h2 id="links-heading" className="text-lg font-semibold">
          Links
        </h2>
        {email.links.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This email has no links.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {email.links.map((link, i) => (
              <li key={link} className="text-sm">
                <a
                  href={link}
                  rel="noreferrer"
                  className="break-all text-violet-700 underline underline-offset-4 dark:text-violet-300"
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
        <h2 id="preview-heading" className="text-lg font-semibold">
          HTML preview
        </h2>
        <iframe
          title={`Email preview: ${email.subject}`}
          srcDoc={email.html}
          sandbox=""
          className="mt-2 h-[70vh] w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
        />
      </section>

      <details className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <summary className="cursor-pointer text-lg font-semibold">Plain-text version</summary>
        <pre className="mt-3 text-sm break-words whitespace-pre-wrap">{email.text || "(empty)"}</pre>
      </details>
    </main>
  );
}
