import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isDevMailboxEnabled, listDevEmails } from "@/server/email/dev-mailbox";
import { formatTime, STATUS_STYLES } from "./format";

export const metadata: Metadata = {
  title: "Dev mailbox",
  robots: { index: false, follow: false },
};

export default async function DevEmailsPage() {
  await connection();
  if (!isDevMailboxEnabled()) notFound();
  const emails = await listDevEmails(100);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dev mailbox</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The latest {emails.length === 100 ? "100 " : ""}emails recorded by the mock email provider. Nothing here was
          actually delivered. This page only exists while <code className="font-mono">EMAIL_PROVIDER=mock</code>.
        </p>
        <Link
          href="/dev/emails/templates"
          className="mt-2 inline-block text-sm text-violet-700 underline-offset-4 hover:underline dark:text-violet-300"
        >
          Preview every template (light and dark) →
        </Link>
      </header>

      {emails.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          No emails yet. Request a sign-in link to send one.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {emails.map((email) => (
            <li key={email.id}>
              <Link
                href={`/dev/emails/${email.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-zinc-50 focus-visible:bg-zinc-50 [--focus-offset:-2px] dark:hover:bg-zinc-900 dark:focus-visible:bg-zinc-900 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{email.subject}</span>
                  <span className="block truncate text-sm text-zinc-600 dark:text-zinc-400">To: {email.to}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-brand-soft px-2 py-0.5 font-mono text-brand-soft-foreground">
                    {email.template}
                  </span>
                  <span className={`rounded px-2 py-0.5 ${STATUS_STYLES[email.status] ?? ""}`}>{email.status}</span>
                  <time dateTime={email.createdAt.toISOString()} className="text-zinc-600 dark:text-zinc-400">
                    {formatTime(email.createdAt)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
