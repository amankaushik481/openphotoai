<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# OpenShoot — agent guide

- Read `docs/CONTRACTS.md` (contracts, conventions, API routes, page map) and `docs/SPEC.md` before coding.
- Next.js 16 (App Router, `proxy.ts` instead of middleware, async `params`/`searchParams`/`cookies()`/`headers()`),
  React 19, Tailwind v4, Drizzle 0.45, Better Auth 1.7, Zod 4, Vitest 5, Playwright 1.63.
- Commands: `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest, PGlite in-memory, mock providers),
  `pnpm test:e2e` (Playwright), `pnpm db:generate` / `pnpm db:migrate`, `pnpm dev`.
- Mock-first: `MOCK_PROVIDERS=true` runs everything with zero keys. Never call paid APIs in tests.
- Safety is a core module (`src/server/safety`) and must never be bypassable via env.
