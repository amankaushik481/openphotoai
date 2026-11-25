import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EMAIL_COMPONENTS } from "@/emails";
import { renderEmail, type EmailTemplateName } from "@/server/email";
import { isDevMailboxEnabled } from "@/server/email/dev-mailbox";

export const metadata: Metadata = {
  title: "Email templates",
  robots: { index: false, follow: false },
};

function forceDarkMode(html: string): string {
  return html.replace("@media (prefers-color-scheme: dark)", "@media all");
}

/** Every email template rendered with its PreviewProps, in light and dark mode (mock email only). */
export default async function DevEmailTemplatesPage() {
  await connection();
  if (!isDevMailboxEnabled()) notFound();
  const names = Object.keys(EMAIL_COMPONENTS) as EmailTemplateName[];
  const rendered = await Promise.all(
    names.map(async (name) => ({ name, email: await renderEmail(name, EMAIL_COMPONENTS[name].PreviewProps as never) })),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <Link href="/dev/emails" className="text-sm text-safelight-ink underline underline-offset-4">
        ← Dev mailbox
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">Email templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each template with its sample props (<code className="font-mono">PreviewProps</code>), as mail clients show it
          in light and dark mode. Dark mode applies in clients that honor <code className="font-mono">prefers-color-scheme</code>{" "}
          (Apple Mail, iOS Mail, Outlook for Mac, Outlook.com).
        </p>
        <nav aria-label="Templates" className="mt-4 flex flex-wrap gap-2 text-xs">
          {names.map((name) => (
            <a
              key={name}
              href={`#${name}`}
              className="border border-foreground/25 px-2 py-1 font-mono hover:border-safelight-ink"
            >
              {name}
            </a>
          ))}
        </nav>
      </header>

      <div className="grid gap-12">
        {rendered.map(({ name, email }) => (
          <section key={name} id={name} aria-labelledby={`${name}-heading`} className="scroll-mt-6">
            <h2 id={`${name}-heading`} className="mono-caps text-foreground">
              <code className="font-mono">{name}</code>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Subject: {email.subject}</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {(["light", "dark"] as const).map((scheme) => (
                <figure key={scheme} className="grid gap-1">
                  <figcaption className="mono-caps text-muted-foreground">{scheme}</figcaption>
                  <iframe
                    title={`${name} (${scheme} mode)`}
                    // Dark: apply the template's dark-mode rules unconditionally, as a dark-mode mail client would.
                    srcDoc={scheme === "dark" ? forceDarkMode(email.html) : email.html}
                    sandbox=""
                    loading="lazy"
                    className="h-[36rem] w-full border border-foreground/15 bg-[#fbf8f2]"
                  />
                </figure>
              ))}
            </div>
            <details className="mt-3 border border-foreground/15 p-3">
              <summary className="mono-caps cursor-pointer text-foreground">Plain-text version</summary>
              <pre className="mt-2 text-xs break-words whitespace-pre-wrap">{email.text}</pre>
            </details>
          </section>
        ))}
      </div>
    </main>
  );
}
