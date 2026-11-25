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
        <h1 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">Dev mailbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The latest {emails.length === 100 ? "100 " : ""}emails recorded by the mock email provider. Nothing here was
          actually delivered. This page only exists while <code className="font-mono">EMAIL_PROVIDER=mock</code>.
        </p>
        <Link
          href="/dev/emails/templates"
          className="mt-2 inline-block text-sm text-safelight-ink underline underline-offset-4"
        >
          Preview every template (light and dark) →
        </Link>
      </header>

      {emails.length === 0 ? (
        <p className="border border-dashed border-foreground/25 p-8 text-center font-mono text-xs tracking-[0.12em] text-muted-foreground uppercase">
          No emails yet. Request a sign-in link to send one.
        </p>
      ) : (
        <ul className="divide-y divide-foreground/10 overflow-hidden border border-foreground/15">
          {emails.map((email) => (
            <li key={email.id}>
              <Link
                href={`/dev/emails/${email.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-accent/50 focus-visible:bg-accent/50 [--focus-offset:-2px] sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{email.subject}</span>
                  <span className="block truncate text-sm text-muted-foreground">To: {email.to}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                  <span className="border border-foreground/25 px-1.5 py-0.5 font-mono text-[11px] tracking-[0.06em]">
                    {email.template}
                  </span>
                  <span className={`border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${STATUS_STYLES[email.status] ?? ""}`}>{email.status}</span>
                  <time dateTime={email.createdAt.toISOString()} className="text-muted-foreground">
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
