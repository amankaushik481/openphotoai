# Rules for build agents (read fully before starting)

You are a senior engineer on the OpenShoot build: an open-source, self-hostable AI photographer SaaS
(Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Drizzle + Postgres, Better Auth, Zod 4,
Vitest 5, Playwright 1.63). Repo: `/home/user/openphotoai`. **Other agents are editing other files in the same
working tree at the same time.**

1. Read `AGENTS.md`, `docs/CONTRACTS.md`, `docs/SPEC.md` and the contract files you touch or depend on.
   Next 16 differs from older versions — check `node_modules/next/dist/docs/` when unsure (async params,
   `proxy.ts`, etc.). Better Auth docs: `node_modules/better-auth/` (types + README).
2. **Only create/edit files in your ownership list.** Never edit `package.json`, `pnpm-lock.yaml`,
   `src/db/schema.ts`, `drizzle/`, `src/types/domain.ts`, `src/providers/types.ts`, `src/lib/env.ts`,
   `src/server/http.ts`, or files owned by other workstreams. Contract stubs you own: replace the bodies, keep the
   exported signatures (you may add optional params / extra exports). Need a dependency, a schema column or a
   contract change? Don't do it — list it under "Requests" in your final report (work around it meanwhile, e.g.
   store extra data in an existing jsonb `metadata` column).
3. **No git commands** (the orchestrator commits). **Don't run `next build` or `next dev`** (shared `.next`
   dir) unless your brief explicitly allows it.
4. **Never call paid external APIs.** Network: the npm registry works; most other hosts are blocked.
5. Code that depends on another workstream's contract stub may throw "not implemented" until that workstream
   lands (usually within the hour). Code against the signature; in unit tests use `vi.mock()` for those modules,
   or re-check later.
6. Verify your work:
   - Typecheck only your files: `pnpm exec tsc --noEmit -p . 2>&1 | grep -E '^(src/your/dir|tests/unit/your-area)'`
     (errors in other agents' WIP files are expected — ignore them, but yours must be clean).
   - Unit tests: `pnpm exec vitest run tests/unit/<your-area>` (PGlite in-memory DB via `tests/helpers/db.ts`:
     `await createTestDb()` in `beforeEach`, `createTestUser({...})`; env defaults in `vitest.config.ts`:
     `MOCK_PROVIDERS=true`, `MOCK_JOB_DELAY_MS=0`).
   - Lint your files: `pnpm exec eslint <your files>`.
7. Quality bar: production code, strict types (no `any` without a justified eslint-disable), small focused
   modules, comments only where logic is non-obvious, accessible + mobile-first UI, no secrets in code, every
   DB query on user data filtered by the owner's `userId`.
8. Final reply to the orchestrator: **≤ 250 words** — files created, test results (pass/fail counts), anything
   incomplete, and "Requests" (deps / schema / contract changes). No code dumps.

## Provider implementation module map (registry imports these exact paths/exports)

| Module | Export | Workstream |
|---|---|---|
| `src/providers/mock/ai.ts` | `createMockAIProvider(): ImageProvider & TrainingProvider & VideoProvider` | providers (W1) |
| `src/providers/mock/face.ts` | `createMockFaceProvider(): FaceProvider` | providers (W1) |
| `src/providers/mock/moderation.ts` | `createMockModerationProvider(): ModerationProvider` | providers (W1) |
| `src/providers/mock/markers.ts` | mock marker protocol (encode/decode) shared by mocks + test fixtures | providers (W1) |
| `src/providers/ai/fal.ts` | `createFalProvider(opts: { apiKey: string }): ImageProvider & TrainingProvider & VideoProvider` | fal (W2) |
| `src/providers/ai/replicate.ts` | `createReplicateProvider(opts: { apiToken: string; webhookSecret?: string; owner: string })` | replicate (W2) |
| `src/providers/safety/local-face.ts` | `createLocalFaceProvider(): FaceProvider` | safety-ml (W2) |
| `src/providers/safety/local-moderation.ts` | `createLocalModerationProvider(): ModerationProvider` | safety-ml (W2) |
| `src/providers/safety/rekognition.ts` | `createRekognitionFaceProvider(opts: { region; accessKeyId; secretAccessKey })` | safety-ml (W2) |
| `src/providers/safety/openai-moderation.ts` | `createOpenAIModerationProvider(opts: { apiKey: string })` | safety-ml (W2) |
| `src/providers/payment/mock.ts` | `createMockPaymentProvider(): PaymentProvider` | billing (W2) |
| `src/providers/payment/stripe.ts` | `createStripePaymentProvider(opts: { secretKey: string; webhookSecret: string })` | billing (W2) |
| `src/providers/email/mock.ts` | `createMockEmailProvider(): EmailProvider` | email (W1) |
| `src/providers/email/resend.ts` | `createResendEmailProvider(opts: { apiKey: string; from: string })` | email (W1) |
| `src/providers/storage/local.ts` | `createLocalStorage(opts: { dir: string; baseUrl: string; secret: string })` | storage (W1) |
| `src/providers/storage/s3.ts` | `createS3Storage(opts: {...})` | storage (W1) |

Factories must be cheap: heavy deps (tfjs, SDK clients) are imported lazily inside methods (`await import(...)`).
