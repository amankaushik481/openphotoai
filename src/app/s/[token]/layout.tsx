import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { SkipLink } from "@/components/layout/skip-link";
import { APP } from "@/config/app";

const footerLink =
  "rounded-sm underline decoration-transparent underline-offset-4 transition-colors hover:text-foreground hover:decoration-safelight-ink";

/** Minimal public shell for shared media: brand, a way to try the app, legal + takedown contact. */
export default function SharedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grain relative isolate flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-5">
            <Logo />
            <span aria-hidden="true" className="mono-caps hidden text-muted-foreground sm:inline">
              Shared print
            </span>
          </div>
          <Button asChild variant="brand" size="sm" className="rounded-[3px]">
            <Link href="/">Create your own</Link>
          </Button>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 font-mono text-[11px] tracking-[0.06em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Images on this page are AI-generated with {APP.name} and may not depict real events.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1 uppercase">
            <Link href="/legal/acceptable-use" className={footerLink}>
              Acceptable use
            </Link>
            <Link href="/legal/terms" className={footerLink}>
              Terms
            </Link>
            <a href={`mailto:${APP.takedownEmail}`} className={footerLink}>
              Takedown requests
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
