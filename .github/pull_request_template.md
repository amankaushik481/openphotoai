## What and why

<!-- What does this PR change, and why? Link the issue: "Closes #123". -->

## How it was tested

<!-- Commands you ran, screenshots or recordings for UI changes (mobile + desktop). -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (and `pnpm test:e2e` for user-facing flows)
- [ ] Works with `MOCK_PROVIDERS=true` and zero API keys; tests never call paid APIs
- [ ] Every query on user data is filtered by the owner's `userId`
- [ ] Safety is not weakened: consent, age, moderation, AI labels and rate limits still apply and cannot be turned off via env
- [ ] New environment variables are validated in `src/lib/env.ts` and documented in `.env.example`
- [ ] Schema changes come with a migration (`pnpm db:generate`)
- [ ] Docs updated where behavior changed
