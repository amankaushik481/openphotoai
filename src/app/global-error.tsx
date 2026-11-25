"use client";

import * as React from "react";

/**
 * Last-resort boundary (replaces the root layout, so no global CSS / providers here).
 * Styled inline and follows the OS color scheme.
 */
export default function GlobalError({ error, retry }: { error: unknown; reset: () => void; retry: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Something went wrong</title>
        <style>{`
          :root { color-scheme: light dark; --bg: #f1ece3; --fg: #16140f; --muted: #615a50; --accent: #c4280f; }
          @media (prefers-color-scheme: dark) { :root { --bg: #0e0d0b; --fg: #eee7db; --muted: #a39a8c; --accent: #f8664a; } }
          body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
                 font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; padding: 1rem; }
          h1 { font-family: ui-serif, Georgia, serif; font-weight: 400; font-size: 2.25rem; margin: 0 0 .75rem; }
          p { color: var(--muted); max-width: 28rem; margin: 0 auto 2rem; line-height: 1.5; }
          .row { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
          button, a { font: inherit; font-weight: 500; font-size: .95rem; border-radius: .6rem; padding: .7rem 1.25rem; cursor: pointer; text-decoration: none; }
          button { background: var(--accent); color: var(--bg); border: 0; }
          a { color: var(--fg); border: 1px solid color-mix(in oklab, var(--fg) 25%, transparent); }
          button:focus-visible, a:focus-visible { outline: 3px solid color-mix(in oklab, var(--accent) 60%, transparent); outline-offset: 2px; }
        `}</style>
        <main>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. You can try again, or head back home.</p>
          <div className="row">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
            {/* A full reload is intentional: the app shell itself failed to render. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Go home</a>
          </div>
        </main>
      </body>
    </html>
  );
}
